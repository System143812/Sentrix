import os from "os";
import { getAllClients, archiveClient } from "../clients/clients.service.js";
import { AUTO_SCAN_INTERVAL_MS } from "./constants.js";
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
import { DiscoveryRepository } from "./discovery.repository.js";

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

export async function isDeviceAliveInDiscovery(ip, mac = null) {
  if (ip && lastScanResults.has(ip)) {
    return true;
  }
  if (mac) {
    const normMac = normalizeMac(mac);
    if (normMac && normMac !== "UNKNOWN") {
      for (const device of lastScanResults.values()) {
        if (normalizeMac(device.mac) === normMac) {
          return true;
        }
      }
    }
  }
  // Fallback: If not found in cached scan results, do a direct lightweight ping check on the IP
  if (ip) {
    const alive = await pingHost(ip);
    if (alive) {
      lastScanResults.set(ip, {
        ip,
        mac: mac || "Unknown",
        hostname: `Host ${ip.split(".").at(-1)}`,
        device_type: "PC",
        last_seen: Date.now(),
      });
      return true;
    }
  }
  return false;
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
  const rows = await DiscoveryRepository.findDeploymentRecords();
  return new Map(rows.map((row) => [row.ip, row]));
}

export async function recordAgentDeployment({
  ip,
  mac = null,
  hostname = null,
  status = "requested",
  message = "",
  userId = null,
}) {
  await DiscoveryRepository.upsertDeploymentRecord({
    ip,
    mac,
    hostname,
    status,
    message,
    userId,
    now: Date.now(),
  });
}

function getAgentStateForDevice(
  device,
  registeredClient = null,
  deploymentRecord = null,
) {
  const deployEligible = canDeployAgent(device.device_type);

  const HEARTBEAT_FRESHNESS_MS = 60000; // 60 seconds threshold
  const now = Date.now();
  const lastSeen =
    registeredClient?.lastSeenAt || registeredClient?.last_agent_seen_at || 0;
  const isHeartbeatFresh =
    registeredClient?.status === "online" &&
    now - lastSeen <= HEARTBEAT_FRESHNESS_MS;

  if (isHeartbeatFresh) {
    return {
      agent_status: "running",
      deployment_action: "update",
      registered_client_id: registeredClient.id,
      last_agent_seen_at: lastSeen || null,
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
  await DiscoveryRepository.upsertScanResults(devices, Date.now());
}

export async function loadDiscoveryResultsFromDb() {
  try {
    const rows = await DiscoveryRepository.findScanResults();
    if (rows.length > 0) {
      const devices = rows.map((row) => ({
        ip: row.ip,
        mac: row.mac,
        hostname: row.hostname,
        vendor: row.vendor,
        device_type: row.device_type,
        device_kind: row.device_kind,
        open_ports:
          typeof row.open_ports === "string"
            ? JSON.parse(row.open_ports)
            : row.open_ports,
        agent_status: row.agent_status || "none",
        deployment_action:
          row.deployment_action ||
          (canDeployAgent(row.device_type) ? "deploy" : "not_eligible"),
        registered_client_id: row.registered_client_id,
        last_agent_seen_at: row.last_agent_seen_at,
        deploy_eligible:
          row.deployment_action === "not_eligible"
            ? false
            : canDeployAgent(row.device_type) || row.agent_status === "offline",
      }));

      devices.forEach((d) => lastScanResults.set(d.ip, d));

      // Derive active subnet from the most common subnet in the loaded results
      let initialSubnet = getLocalSubnet();
      if (devices.length > 0) {
        const subnetCounts = new Map();
        devices.forEach((d) => {
          const parts = d.ip.split(".");
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

  const ipAddresses = Array.from(
    { length: 254 },
    (_, index) => `${subnet}.${index + 1}`,
  );
  const gatewayCandidates = getLocalGatewayCandidates(subnet);

  const nmapResultsPromise = runNmapPingScan(subnet);
  const registeredClientsPromise = getAllClients().catch(() => []);

  // Ping hosts in batches to avoid overwhelming the OS and ensure ARP table population
  const batchSize = 30;
  for (let i = 0; i < ipAddresses.length; i += batchSize) {
    const batch = ipAddresses.slice(i, i + batchSize);
    await Promise.all(batch.map((ip) => pingHost(ip)));
    // Small pause between batches
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Small extra delay for ARP table to settle
  await new Promise((resolve) => setTimeout(resolve, 500));

  updateSnapshot({
    progress: 35,
    message: "Reading ARP and nmap discovery results...",
  });

  const arpTable = await readArpTable();
  const nmapResults = await nmapResultsPromise;
  const registeredClients = await registeredClientsPromise;
  const deploymentRecordsByIp = await getDeploymentRecordsByIp().catch(
    () => new Map(),
  );
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
    ipAddresses.map(async (ip) => {
      const nmapDevice = nmapResults.get(ip);
      const mac =
        nmapDevice?.mac && nmapDevice.mac !== "Unknown"
          ? nmapDevice.mac
          : findMacForIp(arpTable, ip);

      const openPorts = await getOpenPorts(ip);

      // DHCP-Safe Matching: Prioritize MAC address matching over IP matching
      // to prevent stale agent records from latching onto a new device assigned this IP by DHCP.
      const clientByMac = registeredByMac.get(normalizeMac(mac));
      const clientByIp = registeredByIp.get(ip);

      let registeredClient = null;
      if (clientByMac) {
        registeredClient = clientByMac;
      } else if (clientByIp) {
        // If matched by IP, allow if scanned mac is Unknown or matches clientByIp
        const registeredClientMacNorm = normalizeMac(clientByIp.mac);
        if (
          !mac ||
          mac === "Unknown" ||
          !clientByIp.mac ||
          clientByIp.mac === "Unknown" ||
          registeredClientMacNorm === normalizeMac(mac) ||
          !registeredByMac.has(registeredClientMacNorm)
        ) {
          registeredClient = clientByIp;
        }
      }

      const registeredClientBeforeAlive = registeredClient;
      const isAlive =
        nmapDevice ||
        mac !== "Unknown" ||
        openPorts.length > 0 ||
        Boolean(registeredClientBeforeAlive);
      if (!isAlive) return null;

      const effectiveMac =
        mac !== "Unknown" ? mac : registeredClient?.mac || "Unknown";

      const [{ hostname, source }] = await Promise.all([getHostnameForIp(ip)]);

      const scannedHostname = registeredClient?.hostname
        ? registeredClient.hostname
        : nmapDevice?.hostname && nmapDevice.hostname !== "Unknown"
          ? nmapDevice.hostname
          : hostname;

      const resolvedHostname = getDisplayHostname(
        ip,
        scannedHostname,
        registeredClient,
      );

      const hostnameSource = registeredClient?.hostname
        ? "sentrix_agent"
        : nmapDevice?.hostname_source &&
            nmapDevice.hostname_source !== "unresolved"
          ? nmapDevice.hostname_source
          : source === "unresolved"
            ? "scan"
            : source;

      const vendor = resolveVendor(nmapDevice?.vendor, effectiveMac);
      const device_type = registeredClient
        ? "PC"
        : detectDeviceType(
            ip,
            effectiveMac,
            openPorts,
            resolvedHostname,
            vendor,
            hostnameSource,
            gatewayCandidates,
          );

      const gateway =
        gatewayCandidates.has(ip) || ip.endsWith(".1") || ip.endsWith(".254");
      const device_kind = getDeviceKind(
        device_type,
        vendor,
        openPorts,
        gateway,
      );
      const deploymentRecord =
        deploymentRecordsByIp.get(ip) ||
        deploymentRecordsByMac.get(normalizeMac(effectiveMac));

      return {
        ip,
        mac: effectiveMac,
        hostname: resolvedHostname,
        hostname_source: hostnameSource,
        vendor,
        device_type,
        device_kind,
        gateway,
        open_ports: openPorts,
        ...getAgentStateForDevice(
          { device_type },
          registeredClient,
          deploymentRecord,
        ),
      };
    }),
  );

  const discoveredDevices = devices.filter((device) => device !== null);

  // Manually inject the server itself if it's on this subnet but missing from results
  // (arp -a often excludes the local machine)
  const primaryIp = getPrimaryInterfaceAddress();
  if (primaryIp && primaryIp.startsWith(`${subnet}.`)) {
    const alreadyFound = discoveredDevices.find((d) => d.ip === primaryIp);
    if (!alreadyFound) {
      const serverMac =
        os
          .networkInterfaces()
          [
            Object.keys(os.networkInterfaces()).find((name) =>
              os.networkInterfaces()[name].some((r) => r.address === primaryIp),
            )
          ]?.find((r) => r.address === primaryIp)?.mac || "Unknown";

      const registeredClient =
        registeredByIp.get(primaryIp) ||
        registeredByMac.get(normalizeMac(serverMac));

      discoveredDevices.push({
        ip: primaryIp,
        mac: serverMac,
        hostname: getDisplayHostname(
          primaryIp,
          os.hostname(),
          registeredClient,
        ),
        hostname_source: "system",
        vendor: "Sentrix Server",
        device_type: "Server",
        device_kind: "Management Server",
        gateway: false,
        open_ports: [Number(process.env.PORT || 4000)],
        ...getAgentStateForDevice(
          { device_type: "Server" },
          registeredClient,
          null,
        ),
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

export async function deployAgentToHost(
  ip,
  credentials = null,
  userId = null,
  action = "deploy",
) {
  const scanRecord = lastScanResults.get(ip);
  // Capture whether a real, registered client existed BEFORE this deployment attempt.
  // This lets us safely archive ghost records without touching a real client on update failures.
  const hadPreExistingClient = Boolean(scanRecord?.registered_client_id);

  await recordAgentDeployment({
    ip,
    mac: scanRecord?.mac,
    hostname: scanRecord?.hostname,
    status: "requested",
    userId,
  });

  const result = await deployAgentToHostInternal(
    ip,
    lastScanResults,
    credentials,
    { action },
  );
  const deploymentStatus = result.success
    ? result.installer
      ? "prepared"
      : "success"
    : "failed";

  // If the SMB push failed and a ghost provisioning record was created by generateProvisioningToken,
  // archive it immediately so it does not appear as a phantom device in the dashboard.
  if (
    deploymentStatus === "failed" &&
    result.agentId &&
    !hadPreExistingClient
  ) {
    try {
      await archiveClient(result.agentId);
      console.log(
        `[Discovery] Archived ghost client record ${result.agentId} after failed deployment to ${ip}`,
      );
    } catch (err) {
      console.warn(
        `[Discovery] Could not archive ghost client ${result.agentId}:`,
        err.message,
      );
    }
  }

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
