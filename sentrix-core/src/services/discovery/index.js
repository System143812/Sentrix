import os from "os";
import pool from "../../lib/database.js";
import { getAllClients } from "../client.services.js";
import {
  AUTO_SCAN_INTERVAL_MS,
} from "./constants.js";
import {
  getLocalSubnet,
  getAvailableInterfaces,
  getPrimaryInterfaceAddress,
  getLocalGatewayCandidates,
  runNmapPingScan,
  pingHost,
  readArpTable,
  getHostnameForIp,
  getOpenPorts,
  findMacForIp,
} from "./scanner.js";
import {
  resolveVendor,
  detectDeviceType,
  getDeviceKind,
  canDeployAgent,
} from "./detector.js";
import { deployAgentToHost as deployAgentToHostInternal } from "./deployer.js";

const lastScanResults = new Map();
let latestSnapshot = {
  status: "idle",
  progress: 0,
  subnet: null,
  devices: [],
  lastScanAt: null,
  nextScanAt: null,
  message: "Discovery has not run yet.",
};
let activeScanPromise = null;
let activeScanSubnet = null;
let preferredSubnet = null;

function updateSnapshot(partial) {
  latestSnapshot = {
    ...latestSnapshot,
    ...partial,
  };
  // If subnet is being updated, make it the preferred one for auto-scans
  if (partial.subnet) {
    preferredSubnet = partial.subnet;
  }
  return latestSnapshot;
}

export function getDiscoverySnapshot() {
  return latestSnapshot;
}

export function getInterfaces() {
  return getAvailableInterfaces();
}

export function setPreferredSubnet(subnet) {
  preferredSubnet = subnet;
}

function getDisplayHostname(ip, hostname, registeredClient = null) {
  if (registeredClient?.hostname) {
    return registeredClient.hostname;
  }
  if (hostname && hostname !== "Unknown") {
    return hostname;
  }
  return `Host ${ip.split(".").at(-1)}`;
}

function normalizeMac(mac = "") {
  return String(mac || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-F0-9]/g, "");
}

async function getDeploymentRecordsByIp() {
  const [rows] = await pool.query("SELECT * FROM agent_deployment_records");
  return new Map(rows.map((row) => [row.ip, row]));
}

export async function recordAgentDeployment({ ip, mac = null, hostname = null, status = "requested", message = "", userId = null }) {
  const now = Date.now();
  await pool.query(
    `
    INSERT INTO agent_deployment_records
      (ip, mac, hostname, status, message, requested_by, requested_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      mac = COALESCE(VALUES(mac), mac),
      hostname = COALESCE(VALUES(hostname), hostname),
      status = VALUES(status),
      message = VALUES(message),
      requested_by = COALESCE(VALUES(requested_by), requested_by),
      updated_at = VALUES(updated_at)
    `,
    [ip, mac, hostname, status, message, userId, now, now],
  );
}

function getAgentStateForDevice(device, registeredClient = null, deploymentRecord = null) {
  const deployEligible = canDeployAgent(device.device_type);

  if (registeredClient?.status === "online") {
    return {
      agent_status: "running",
      deployment_action: "update",
      registered_client_id: registeredClient.id,
      last_agent_seen_at: registeredClient.last_seen_at || null,
      deploy_eligible: true,
    };
  }

  if (registeredClient || (deployEligible && deploymentRecord)) {
    return {
      agent_status: "offline",
      deployment_action: "activate",
      registered_client_id: registeredClient?.id || null,
      last_agent_seen_at: registeredClient?.last_seen_at || deploymentRecord?.updated_at || null,
      deploy_eligible: true,
    };
  }

  return {
    agent_status: "none",
    deployment_action: deployEligible ? "deploy" : "not_eligible",
    registered_client_id: null,
    last_agent_seen_at: null,
    deploy_eligible: deployEligible,
  };
}

async function saveScanResultsToDb(devices) {
  const now = Date.now();
  for (const device of devices) {
    await pool.query(
      `
      INSERT INTO discovery_scan_results
        (ip, mac, hostname, vendor, device_type, device_kind, open_ports, agent_status, registered_client_id, deployment_action, last_agent_seen_at, last_scanned_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        mac = VALUES(mac),
        hostname = VALUES(hostname),
        vendor = VALUES(vendor),
        device_type = VALUES(device_type),
        device_kind = VALUES(device_kind),
        open_ports = VALUES(open_ports),
        agent_status = VALUES(agent_status),
        registered_client_id = VALUES(registered_client_id),
        deployment_action = VALUES(deployment_action),
        last_agent_seen_at = VALUES(last_agent_seen_at),
        last_scanned_at = VALUES(last_scanned_at)
      `,
      [
        device.ip,
        device.mac,
        device.hostname,
        device.vendor,
        device.device_type,
        device.device_kind,
        JSON.stringify(device.open_ports),
        device.agent_status || "none",
        device.registered_client_id || null,
        device.deployment_action || "not_eligible",
        device.last_agent_seen_at || null,
        now,
      ],
    );
  }
}

export async function loadDiscoveryResultsFromDb() {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM discovery_scan_results ORDER BY last_scanned_at DESC",
    );
    if (rows.length > 0) {
      const devices = rows.map((row) => ({
        ip: row.ip,
        mac: row.mac,
        hostname: row.hostname,
        vendor: row.vendor,
        device_type: row.device_type,
        device_kind: row.device_kind,
        open_ports: typeof row.open_ports === "string" ? JSON.parse(row.open_ports) : row.open_ports,
        agent_status: row.agent_status || "none",
        deployment_action: row.deployment_action || (canDeployAgent(row.device_type) ? "deploy" : "not_eligible"),
        registered_client_id: row.registered_client_id,
        last_agent_seen_at: row.last_agent_seen_at,
        deploy_eligible: row.deployment_action === "not_eligible" ? false : canDeployAgent(row.device_type) || row.agent_status === "offline",
      }));
      
      devices.forEach((d) => lastScanResults.set(d.ip, d));
      
      // Derive active subnet from the most common subnet in the loaded results
      let initialSubnet = getLocalSubnet();
      if (devices.length > 0) {
        const subnetCounts = new Map();
        devices.forEach(d => {
          const parts = d.ip.split('.');
          const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
          subnetCounts.set(subnet, (subnetCounts.get(subnet) || 0) + 1);
        });
        
        // Find most frequent subnet
        let maxCount = 0;
        for (const [s, count] of subnetCounts.entries()) {
          if (count > maxCount) {
            maxCount = count;
            initialSubnet = s;
          }
        }
      }
      
      updateSnapshot({
        devices,
        lastScanAt: rows[0].last_scanned_at,
        subnet: initialSubnet,
        message: `Loaded ${devices.length} devices from database.`,
      });
    }
  } catch (error) {
    console.error("[Discovery] Failed to load results from DB:", error);
  }
}

export async function scanLocalNetwork(targetSubnet = null) {
  const subnet = targetSubnet || getLocalSubnet();
  if (!subnet) {
    updateSnapshot({
      status: "error",
      progress: 0,
      subnet: null,
      message: "No active IPv4 subnet was found.",
    });
    return [];
  }

  updateSnapshot({
    status: "scanning",
    progress: 5,
    subnet,
    message: `Pinging ${subnet}.0/24...`,
  });

  const ipAddresses = Array.from({ length: 254 }, (_, index) => `${subnet}.${index + 1}`);
  const gatewayCandidates = getLocalGatewayCandidates(subnet);

  const nmapResultsPromise = runNmapPingScan(subnet);
  const registeredClientsPromise = getAllClients().catch(() => []);
  
  // Ping hosts in batches to avoid overwhelming the OS and ensure ARP table population
  const batchSize = 30;
  for (let i = 0; i < ipAddresses.length; i += batchSize) {
    const batch = ipAddresses.slice(i, i + batchSize);
    await Promise.all(batch.map((ip) => pingHost(ip)));
    // Small pause between batches
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Small extra delay for ARP table to settle
  await new Promise(resolve => setTimeout(resolve, 500));
  
  updateSnapshot({
    progress: 35,
    message: "Reading ARP and nmap discovery results...",
  });
  
  const arpTable = await readArpTable();
  const nmapResults = await nmapResultsPromise;
  const registeredClients = await registeredClientsPromise;
  const deploymentRecordsByIp = await getDeploymentRecordsByIp().catch(() => new Map());
  const registeredByIp = new Map(
    registeredClients
      .filter((client) => client.ip)
      .map((client) => [client.ip, client]),
  );
  const registeredByMac = new Map(
    registeredClients
      .filter((client) => normalizeMac(client.mac))
      .map((client) => [normalizeMac(client.mac), client]),
  );
  const deploymentRecordsByMac = new Map(
    [...deploymentRecordsByIp.values()]
      .filter((record) => normalizeMac(record.mac))
      .map((record) => [normalizeMac(record.mac), record]),
  );

  const devices = await Promise.all(
    ipAddresses
      .map(async (ip) => {
        const nmapDevice = nmapResults.get(ip);
        const mac =
          nmapDevice?.mac && nmapDevice.mac !== "Unknown"
            ? nmapDevice.mac
            : findMacForIp(arpTable, ip);

        const openPorts = await getOpenPorts(ip);
        const isAlive = nmapDevice || mac !== "Unknown" || openPorts.length > 0;
        if (!isAlive) return null;

        const registeredClient = registeredByIp.get(ip) || registeredByMac.get(normalizeMac(mac));

        const [{ hostname, source }] = await Promise.all([
          getHostnameForIp(ip),
        ]);
        
        const scannedHostname =
          nmapDevice?.hostname && nmapDevice.hostname !== "Unknown"
            ? nmapDevice.hostname
            : hostname;
            
        const resolvedHostname = getDisplayHostname(ip, scannedHostname, registeredClient);
        
        const hostnameSource =
          registeredClient?.hostname
            ? "sentrix_agent"
            : nmapDevice?.hostname_source && nmapDevice.hostname_source !== "unresolved"
            ? nmapDevice.hostname_source
            : source === "unresolved"
            ? "scan"
            : source;
            
        const vendor = resolveVendor(nmapDevice?.vendor, mac);
        const device_type = registeredClient
          ? "PC"
          : detectDeviceType(ip, mac, openPorts, resolvedHostname, vendor, hostnameSource, gatewayCandidates);
          
        const gateway = gatewayCandidates.has(ip) || ip.endsWith(".1") || ip.endsWith(".254");
        const device_kind = getDeviceKind(device_type, vendor, openPorts, gateway);
        const deploymentRecord = deploymentRecordsByIp.get(ip) || deploymentRecordsByMac.get(normalizeMac(mac));

        return {
          ip,
          mac,
          hostname: resolvedHostname,
          hostname_source: hostnameSource,
          vendor,
          device_type,
          device_kind,
          gateway,
          open_ports: openPorts,
          ...getAgentStateForDevice({ device_type }, registeredClient, deploymentRecord),
        };
      })
  );

  const discoveredDevices = devices.filter((device) => device !== null);
  
  // Manually inject the server itself if it's on this subnet but missing from results
  // (arp -a often excludes the local machine)
  const primaryIp = getPrimaryInterfaceAddress();
  if (primaryIp && primaryIp.startsWith(`${subnet}.`)) {
    const alreadyFound = discoveredDevices.find(d => d.ip === primaryIp);
    if (!alreadyFound) {
      const serverMac = os.networkInterfaces()[Object.keys(os.networkInterfaces()).find(name => 
        os.networkInterfaces()[name].some(r => r.address === primaryIp)
      )]?.find(r => r.address === primaryIp)?.mac || "Unknown";
      
      const registeredClient = registeredByIp.get(primaryIp) || registeredByMac.get(normalizeMac(serverMac));
      
      discoveredDevices.push({
        ip: primaryIp,
        mac: serverMac,
        hostname: getDisplayHostname(primaryIp, os.hostname(), registeredClient),
        hostname_source: "system",
        vendor: "Sentrix Server",
        device_type: "Server",
        device_kind: "Management Server",
        gateway: false,
        open_ports: [Number(process.env.PORT || 4000)],
        ...getAgentStateForDevice({ device_type: "Server" }, registeredClient, null),
      });
    }
  }

  lastScanResults.clear();
  discoveredDevices.forEach((device) => lastScanResults.set(device.ip, device));

  await saveScanResultsToDb(discoveredDevices);

  updateSnapshot({
    status: "idle",
    progress: 100,
    subnet,
    devices: discoveredDevices,
    lastScanAt: Date.now(),
    nextScanAt: Date.now() + AUTO_SCAN_INTERVAL_MS,
    message: `Found ${discoveredDevices.length} network devices.`,
  });

  return discoveredDevices;
}

export async function runDiscoveryScan(targetSubnet = null) {
  // If a scan is running on the SAME subnet, return existing promise
  if (activeScanPromise && activeScanSubnet === targetSubnet) {
    return activeScanPromise;
  }

  activeScanSubnet = targetSubnet;
  activeScanPromise = scanLocalNetwork(targetSubnet)
    .catch((error) => {
      updateSnapshot({
        status: "error",
        progress: 0,
        message: error.message || "Discovery scan failed.",
        nextScanAt: Date.now() + AUTO_SCAN_INTERVAL_MS,
      });
      return latestSnapshot.devices;
    })
    .finally(() => {
      activeScanPromise = null;
      activeScanSubnet = null;
    });

  return activeScanPromise;
}

export function startDiscoveryScheduler(io) {
  const emitSnapshot = () => {
    io.to("dashboards").emit("discovery:update", getDiscoverySnapshot());
  };

  const runAndEmit = async () => {
    emitSnapshot();
    await runDiscoveryScan(preferredSubnet);
    emitSnapshot();
  };

  loadDiscoveryResultsFromDb().then(() => emitSnapshot());

  setInterval(emitSnapshot, 1500);
  setTimeout(runAndEmit, 3000);
  setInterval(runAndEmit, AUTO_SCAN_INTERVAL_MS);
}

export async function deployAgentToHost(ip, credentials = null, userId = null, action = "deploy") {
  const scanRecord = lastScanResults.get(ip);
  await recordAgentDeployment({
    ip,
    mac: scanRecord?.mac,
    hostname: scanRecord?.hostname,
    status: "requested",
    userId,
  });

  const result = await deployAgentToHostInternal(ip, lastScanResults, credentials, { action });
  const deploymentStatus = result.success
    ? result.installer
      ? "prepared"
      : "success"
    : "failed";
  await recordAgentDeployment({
    ip,
    mac: scanRecord?.mac,
    hostname: scanRecord?.hostname,
    status: deploymentStatus,
    message: result.message,
    userId,
  });
  return result;
}
