import pool from "../../lib/database.js";
import { getAllClients } from "../client.services.js";
import {
  AUTO_SCAN_INTERVAL_MS,
} from "./constants.js";
import {
  getLocalSubnet,
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

function updateSnapshot(partial) {
  latestSnapshot = {
    ...latestSnapshot,
    ...partial,
  };
  return latestSnapshot;
}

export function getDiscoverySnapshot() {
  return latestSnapshot;
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

async function saveScanResultsToDb(devices) {
  const now = Date.now();
  for (const device of devices) {
    await pool.query(
      `
      INSERT INTO discovery_scan_results
        (ip, mac, hostname, vendor, device_type, device_kind, open_ports, last_scanned_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        mac = VALUES(mac),
        hostname = VALUES(hostname),
        vendor = VALUES(vendor),
        device_type = VALUES(device_type),
        device_kind = VALUES(device_kind),
        open_ports = VALUES(open_ports),
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
        deploy_eligible: canDeployAgent(row.device_type),
      }));
      
      devices.forEach((d) => lastScanResults.set(d.ip, d));
      
      updateSnapshot({
        devices,
        lastScanAt: rows[0].last_scanned_at,
        subnet: getLocalSubnet(),
        message: `Loaded ${devices.length} devices from database.`,
      });
    }
  } catch (error) {
    console.error("[Discovery] Failed to load results from DB:", error);
  }
}

export async function scanLocalNetwork() {
  const subnet = getLocalSubnet();
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
    message: "Pinging local subnet...",
  });

  const ipAddresses = Array.from({ length: 254 }, (_, index) => `${subnet}.${index + 1}`);
  const gatewayCandidates = getLocalGatewayCandidates(subnet);

  const nmapResultsPromise = runNmapPingScan(subnet);
  const registeredClientsPromise = getAllClients().catch(() => []);
  
  await Promise.all(ipAddresses.map((ip) => pingHost(ip)));
  
  updateSnapshot({
    progress: 35,
    message: "Reading ARP and nmap discovery results...",
  });
  
  const arpTable = await readArpTable();
  const nmapResults = await nmapResultsPromise;
  const registeredClients = await registeredClientsPromise;
  const registeredByIp = new Map(
    registeredClients
      .filter((client) => client.ip)
      .map((client) => [client.ip, client]),
  );

  const devices = await Promise.all(
    ipAddresses
      .map(async (ip) => {
        const nmapDevice = nmapResults.get(ip);
        const registeredClient = registeredByIp.get(ip);
        const mac =
          nmapDevice?.mac && nmapDevice.mac !== "Unknown"
            ? nmapDevice.mac
            : findMacForIp(arpTable, ip);

        if (mac === "Unknown") return null;

        const [{ hostname, source }, openPorts] = await Promise.all([
          getHostnameForIp(ip),
          getOpenPorts(ip),
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
          deploy_eligible: canDeployAgent(device_type),
        };
      })
  );

  const discoveredDevices = devices.filter((device) => device !== null);
  
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

export async function runDiscoveryScan() {
  if (activeScanPromise) return activeScanPromise;

  activeScanPromise = scanLocalNetwork()
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
    });

  return activeScanPromise;
}

export function startDiscoveryScheduler(io) {
  const emitSnapshot = () => {
    io.to("dashboards").emit("discovery:update", getDiscoverySnapshot());
  };

  const runAndEmit = async () => {
    emitSnapshot();
    await runDiscoveryScan();
    emitSnapshot();
  };

  loadDiscoveryResultsFromDb().then(() => emitSnapshot());

  setInterval(emitSnapshot, 1500);
  setTimeout(runAndEmit, 3000);
  setInterval(runAndEmit, AUTO_SCAN_INTERVAL_MS);
}

export async function deployAgentToHost(ip, credentials = null) {
  return await deployAgentToHostInternal(ip, lastScanResults, credentials);
}
