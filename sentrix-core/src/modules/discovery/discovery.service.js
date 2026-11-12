import os from "os";
import { getAllClients, archiveClient } from "../clients/clients.service.js";
import { AUTO_SCAN_INTERVAL_MS } from "./constants.js";
import {
  getLocalSubnet,
  getAvailableInterfaces,
  getPrimaryInterfaceAddress,
  getPrimaryInterface,
  getLocalGatewayCandidates,
  runNmapPingScan,
  pingHost,
  readArpTable,
  getHostnameForIp,
  getOpenPorts,
  findMacForIp,
  commandExists,
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
  const device = ip ? lastScanResults.get(ip) : null;
  const STALE_THRESHOLD_MS = 300000; // 5 minutes
  const now = Date.now();

  if (device && now - (device.last_seen || 0) < STALE_THRESHOLD_MS) {
    return true;
  }
  if (mac) {
    const normMac = normalizeMac(mac);
    if (normMac && normMac !== "UNKNOWN") {
      for (const d of lastScanResults.values()) {
        if (
          normalizeMac(d.mac) === normMac &&
          now - (d.last_seen || 0) < STALE_THRESHOLD_MS
        ) {
          return true;
        }
      }
    }
  }

  // If network scan results have been populated, but the device is not found or stale,
  // do not fallback to direct pings which can falsely keep dead/stale IPs online.
  if (lastScanResults.size > 0) {
    return false;
  }

  // Fallback: If no discovery scan has run yet, do a direct lightweight ping check on the IP
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

export async function recordAgentDeployment({
  ip,
  mac = null,
  hostname = null,
  status = "requested",
  message = "",
  userId = null,
  action = "deploy",
}) {
  console.log(`[STATE DIAGNOSTIC] recordAgentDeployment called for IP: ${ip}, status: ${status}, action: ${action}`);
  try {
    const isUpdate = action === "update" || status === "updating";
    const targetStatus = isUpdate ? "updating" : "deploying";

    await DiscoveryRepository.upsertDeploymentRecord({
      ip,
      mac,
      hostname,
      status: "requested", // Always use valid ENUM 'requested' for agent_deployment_records table
      message,
      userId,
      now: Date.now(),
    });
    const device = lastScanResults.get(ip);
    if (device) {
      device.agent_status = targetStatus;
      device.deployment_action = targetStatus;
      device.last_seen = Date.now();
      device.last_scanned_at = Date.now();
    }
    if (latestSnapshot.devices) {
      const snapDev = latestSnapshot.devices.find((d) => d.ip === ip);
      if (snapDev) {
        snapDev.agent_status = targetStatus;
        snapDev.deployment_action = targetStatus;
        snapDev.last_seen = Date.now();
        snapDev.last_scanned_at = Date.now();
      }
    }

    if (device) {
      await saveScanResultsToDb([device]);
    } else {
      await DiscoveryRepository.upsertScanResults(
        [
          {
            ip,
            mac: mac || "Unknown",
            hostname: hostname || `Host ${ip.split(".").at(-1)}`,
            agent_status: targetStatus,
            deployment_action: targetStatus,
            last_scanned_at: Date.now(),
          },
        ],
        Date.now(),
      );
    }
    console.log(`[STATE DIAGNOSTIC] recordAgentDeployment completed for IP: ${ip}, targetStatus: ${targetStatus}`);
  } catch (err) {
    console.warn(
      "[Discovery] Failed to persist deployment record:",
      err.message,
    );
  }
}

export async function clearDeploymentCacheState(ip, mac) {
  const normMac = normalizeMac(mac);
  for (const [deviceIp, device] of lastScanResults.entries()) {
    const matchIp = ip && deviceIp === ip;
    const matchMac =
      normMac && normMac !== "UNKNOWN" && normalizeMac(device.mac) === normMac;
    if (matchIp || matchMac) {
      device.agent_status = "running";
      device.deployment_action = "update";
      await saveScanResultsToDb([device]);
    }
  }
  if (latestSnapshot.devices) {
    for (const device of latestSnapshot.devices) {
      const matchIp = ip && device.ip === ip;
      const matchMac =
        normMac &&
        normMac !== "UNKNOWN" &&
        normalizeMac(device.mac) === normMac;
      if (matchIp || matchMac) {
        device.agent_status = "running";
        device.deployment_action = "update";
        await saveScanResultsToDb([device]);
      }
    }
  }
}

function getAgentStateForDevice(
  device,
  registeredClient = null,
  existingDevice = null,
  deploymentRecord = null,
) {
  const deployEligible = canDeployAgent(device.device_type);
  const HEARTBEAT_FRESHNESS_MS = 90000; // 90 seconds (1 min 30 sec) threshold
  const now = Date.now();
  const TIMEOUT_MS = 300000; // 5 minutes grace period

  // 1. Check if device was recently set to deploying or updating (within 5 min grace period)
  // Check both existingDevice (discovery_scan_results) and deploymentRecord (agent_deployment_records)
  const activeDeployment = deploymentRecord || existingDevice;
  const isRequestedDeployment = activeDeployment?.status === "requested";
  const isStatusDeployment = ["deploying", "updating"].includes(activeDeployment?.agent_status);

  const deploymentTimestamp = activeDeployment ? Number(
    activeDeployment.updated_at || activeDeployment.requested_at || activeDeployment.last_scanned_at || activeDeployment.last_seen || now,
  ) : null;
  const diffMs = deploymentTimestamp ? now - deploymentTimestamp : null;

  console.log(`[STATE DIAGNOSTIC] getAgentStateForDevice:`, {
    activeDeployment: activeDeployment ? { agent_status: activeDeployment.agent_status, status: activeDeployment.status, updated_at: activeDeployment.updated_at, requested_at: activeDeployment.requested_at } : null,
    isRequestedDeployment,
    isStatusDeployment,
    deploymentTimestamp,
    diffMs,
    TIMEOUT_MS,
    hasRegisteredClient: Boolean(registeredClient)
  });

  if (activeDeployment && (isRequestedDeployment || isStatusDeployment)) {
    if (deploymentTimestamp && diffMs < TIMEOUT_MS) {
      const isUpdate = Boolean(registeredClient) || activeDeployment.agent_status === "updating" || activeDeployment.action === "update";
      const targetStatus = isUpdate ? "updating" : "deploying";
      const lastSeen = Number(registeredClient?.lastSeenAt || registeredClient?.last_agent_seen_at || 0);

      console.log(`[STATE DIAGNOSTIC] Grace period active (status requested/deploying/updating within ${TIMEOUT_MS}ms). Forcing status to: ${targetStatus}`);
      return {
        agent_status: targetStatus,
        deployment_action: targetStatus,
        registered_client_id: registeredClient?.id || activeDeployment.registered_client_id || null,
        last_agent_seen_at: lastSeen || activeDeployment.last_agent_seen_at || null,
        deploy_eligible: deployEligible,
      };
    } else {
      console.log(`[STATE DIAGNOSTIC] Grace period expired or invalid timestamp: diffMs=${diffMs}, TIMEOUT_MS=${TIMEOUT_MS}`);
    }
  }

  // 2. If a registered client exists, an agent is installed on this device
  if (registeredClient) {
    const lastSeen =
      registeredClient.lastSeenAt || registeredClient.last_agent_seen_at || 0;
    const isOnline = registeredClient.status === "online";
    const isHeartbeatFresh =
      isOnline && (lastSeen === 0 || now - lastSeen <= HEARTBEAT_FRESHNESS_MS);

    const targetStatus = isHeartbeatFresh ? "running" : "none";
    console.log(`[STATE DIAGNOSTIC] Fell through to registeredClient check -> returning agent_status: ${targetStatus}`, {
      isOnline,
      lastSeen,
      now,
      isHeartbeatFresh
    });

    const isRunning = targetStatus === "running";
    return {
      agent_status: targetStatus,
      deployment_action: isRunning ? "update" : (deployEligible ? "deploy" : "not_eligible"),
      registered_client_id: registeredClient.id,
      last_agent_seen_at: lastSeen || null,
      deploy_eligible: true,
    };
  }

  // 3. No agent registered and no active deployment in progress
  return {
    agent_status: "none",
    deployment_action: deployEligible ? "deploy" : "not_eligible",
    registered_client_id: null,
    last_agent_seen_at: null,
    deploy_eligible: deployEligible,
  };
}

async function saveScanResultsToDb(devices) {
  try {
    await DiscoveryRepository.upsertScanResults(devices, Date.now());
  } catch (err) {
    console.error("[Discovery] saveScanResultsToDb error:", err.message);
  }
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
        last_seen: row.last_scanned_at || Date.now(),
        deploy_eligible:
          row.deployment_action === "not_eligible"
            ? false
            : canDeployAgent(row.device_type),
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
  const scanStartTime = Date.now();
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

  const hasNmap = await commandExists("nmap");
  const nmapResultsPromise = runNmapPingScan(subnet);

  const pingResults = new Set();
  if (!hasNmap) {
    // Ping hosts in batches to avoid overwhelming the OS and ensure ARP table population (fallback if nmap not installed)
    const batchSize = 30;
    for (let i = 0; i < ipAddresses.length; i += batchSize) {
      const batch = ipAddresses.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (ip) => ({ ip, alive: await pingHost(ip) }))
      );
      results.forEach((r) => {
        if (r.alive) pingResults.add(r.ip);
      });
      // Small pause between batches
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Small extra delay for ARP table to settle
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  updateSnapshot({
    progress: 35,
    message: "Reading ARP and nmap discovery results...",
  });

  const arpTable = await readArpTable();
  const nmapResults = await nmapResultsPromise;

  // Fetch fresh registered clients and deployment records at the end of the scan collection phase
  // to prevent overriding new agent status with stale pre-scan data.
  const registeredClients = await getAllClients().catch(() => []);
  const dbScanResults = await DiscoveryRepository.findScanResults().catch(
    () => [],
  );
  const dbDeviceMap = new Map(dbScanResults.map((d) => [d.ip, d]));
  const deploymentRecords = await DiscoveryRepository.findDeploymentRecords().catch(
    () => [],
  );
  const deploymentMap = new Map(deploymentRecords.map((r) => [r.ip, r]));

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

  const devices = await Promise.all(
    ipAddresses.map(async (ip) => {
      const nmapDevice = nmapResults.get(ip);
      const isPingAlive = hasNmap ? Boolean(nmapDevice) : pingResults.has(ip);
      const arpMac = findMacForIp(arpTable, ip);
      const clientByIp = registeredByIp.get(ip);

      const isAlive = Boolean(
        nmapDevice ||
        isPingAlive ||
        (arpMac && arpMac !== "Unknown")
      );
      if (!isAlive) {
        return null;
      }

      const mac =
        nmapDevice?.mac && nmapDevice.mac !== "Unknown"
          ? nmapDevice.mac
          : arpMac && arpMac !== "Unknown"
            ? arpMac
            : clientByIp?.mac || "Unknown";

      // DHCP-Safe Matching: Prioritize MAC address matching over IP matching
      const clientByMac = registeredByMac.get(normalizeMac(mac));

      let registeredClient = clientByMac || clientByIp || null;

      const openPorts = await getOpenPorts(ip);

      const hasOpenPorts = openPorts.length > 0;
      const isOnlineRegisteredClient = Boolean(
        registeredClient &&
        (registeredClient.status === "online" ||
         (registeredClient.lastSeenAt && Date.now() - registeredClient.lastSeenAt < 60000))
      );

      const reallyAlive = Boolean(
        nmapDevice ||
        isPingAlive ||
        hasOpenPorts ||
        isOnlineRegisteredClient
      );
      if (!reallyAlive) return null;

      const effectiveMac =
        mac !== "Unknown" ? mac : registeredClient?.mac || "Unknown";

      // Dynamically exclude the Sentrix server itself (IP or MAC match)
      const serverPrimaryIp = getPrimaryInterfaceAddress();
      const serverIface = getPrimaryInterface();
      const serverMacNorm = normalizeMac(serverIface.mac);

      if (
        ip === serverPrimaryIp ||
        (normalizeMac(effectiveMac) !== "UNKNOWN" && normalizeMac(effectiveMac) === serverMacNorm)
      ) {
        return null;
      }

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
      const existingDevice = dbDeviceMap.get(ip) || lastScanResults.get(ip);

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
        last_seen: Date.now(),
        ...getAgentStateForDevice(
          { device_type },
          registeredClient,
          existingDevice,
          deploymentMap.get(ip),
        ),
      };
    }),
  );

  const discoveredDevices = devices.filter((device) => device !== null);

  lastScanResults.clear();
  discoveredDevices.forEach((device) => lastScanResults.set(device.ip, device));

  await saveScanResultsToDb(discoveredDevices);

  // Sync client statuses and fast-TTL purge stale network devices FIRST
  try {
    // Sweep-based instant cleanup: remove any discovery records not seen in this scan session
    await DiscoveryRepository.deleteStaleScanResults(scanStartTime);

    const { getAllClients, markClientOnline, markClientOffline } =
      await import("../clients/clients.service.js");
    const registeredClients = await getAllClients();

    const scannedIps = new Set(discoveredDevices.map((d) => d.ip));
    const scannedMacs = new Set(
      discoveredDevices
        .map((d) => normalizeMac(d.mac))
        .filter((m) => m && m !== "UNKNOWN"),
    );

    for (const client of registeredClients) {
      const clientMacNorm = normalizeMac(client.mac);
      const isFound =
        (client.ip && scannedIps.has(client.ip)) ||
        (clientMacNorm &&
          clientMacNorm !== "UNKNOWN" &&
          scannedMacs.has(clientMacNorm));

      if (isFound) {
        if (client.status === "offline") {
          await markClientOnline(client.id);
        }
      } else {
        // Not found in scan — mark offline immediately and remove from discovery
        if (client.status === "online") {
          await markClientOffline(client.id);
        }
        if (client.ip) {
          lastScanResults.delete(client.ip);
          await DiscoveryRepository.deleteScanResultByIp(client.ip).catch(
            () => {},
          );
        }
      }
    }
  } catch (err) {
    console.warn(
      "[Discovery] Failed to sync client statuses / prune stale devices:",
      err.message,
    );
  }

  await loadDiscoveryResultsFromDb();

  updateSnapshot({
    status: "idle",
    progress: 100,
    subnet,
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
    try {
      const { getClientSummary } = await import("../clients/clients.service.js");
      io.to("dashboards").emit("devices:update", await getClientSummary());
    } catch {}
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
  let existingRecord = null;
  try {
    existingRecord = await DiscoveryRepository.findDeploymentRecordByIp(ip);
  } catch {
    // Ignore DB errors during unit tests
  }
  const now = Date.now();
  const TIMEOUT_MS = action === "update" ? 60000 : 90000;

  if (existingRecord && existingRecord.status === "requested") {
    if (now - existingRecord.updated_at < TIMEOUT_MS) {
      throw new Error(
        "Deployment or update already in progress for this device.",
      );
    } else {
      console.warn(
        `[Discovery] Stale deployment record found for ${ip} (status: ${existingRecord.status}). Overwriting.`,
      );
    }
  }

  const hadPreExistingClient = Boolean(scanRecord?.registered_client_id);

  await recordAgentDeployment({
    ip,
    mac: scanRecord?.mac,
    hostname: scanRecord?.hostname,
    status: "requested",
    userId,
    action,
  });

  const result = await deployAgentToHostInternal(
    ip,
    lastScanResults,
    credentials,
    { action },
  );
  const deploymentStatus = result.success ? "requested" : "failed";

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

export async function handleAgentDisconnectDiscovery(agentId) {
  if (!agentId) return;
  try {
    const { getClientById } = await import("../clients/clients.service.js");
    const client = await getClientById(agentId);
    if (!client || !client.ip) return;

    let existingRecord = null;
    try {
      existingRecord = await DiscoveryRepository.findDeploymentRecordByIp(
        client.ip,
      );
    } catch {}

    if (existingRecord && existingRecord.status === "requested") {
      console.log(
        `[Discovery] Skipping discovery reset on disconnect for ${agentId} (${client.ip}): deployment/update in progress.`,
      );
      return;
    }

    const normMac = normalizeMac(client.mac);
    let updated = false;

    for (const [deviceIp, device] of lastScanResults.entries()) {
      const matchIp = deviceIp === client.ip;
      const matchMac =
        normMac &&
        normMac !== "UNKNOWN" &&
        normalizeMac(device.mac) === normMac;
      if (matchIp || matchMac) {
        device.agent_status = "none";
        device.deployment_action = canDeployAgent(device.device_type)
          ? "deploy"
          : "not_eligible";
        device.registered_client_id = null;
        updated = true;
      }
    }

    if (latestSnapshot.devices) {
      latestSnapshot.devices.forEach((device) => {
        const matchIp = device.ip === client.ip;
        const matchMac =
          normMac &&
          normMac !== "UNKNOWN" &&
          normalizeMac(device.mac) === normMac;
        if (matchIp || matchMac) {
          device.agent_status = "none";
          device.deployment_action = canDeployAgent(device.device_type)
            ? "deploy"
            : "not_eligible";
          device.registered_client_id = null;
          updated = true;
        }
      });
    }

    if (updated) {
      await saveScanResultsToDb(Array.from(lastScanResults.values()));
      console.log(
        `[Discovery] Reset agent status to 'none' for disconnected agent ${agentId} (${client.ip}).`,
      );
    }
  } catch (err) {
    console.warn(
      `[Discovery] Failed to handle agent disconnect discovery for ${agentId}:`,
      err.message,
    );
  }
}
