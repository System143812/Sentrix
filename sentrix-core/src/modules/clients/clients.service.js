import { ClientRepository } from "./clients.repository.js";
import {
  authorizeDevice,
  bindHardwareFingerprint,
  computeSecureFingerprint,
} from "../security/security.service.js";
import {
  getClientHardware,
  saveHardwareDetails,
  processIncomingMetrics,
  getLatestClientProcesses,
  getLatestClientNetworkActivity,
  getClientActivityHistory as getClientActivityHistoryFromRepo,
  getClientPeripheralHistory as getClientPeripheralHistoryFromRepo,
  getClientMetricHistory,
  normalizeMetrics,
} from "../metrics/index.js";
import {
  getAnomalyAlerts,
  getDeviceEvents,
  getDomainSummaries,
  getHealthSummary,
  getSoftwareInventory,
  recordUptimeStatus,
} from "../behavior/behavior.service.js";
import {
  archivePeripheral,
  recoverPeripheral,
  resolvePeripheral,
} from "../metrics/hardware.service.js";
import { DiscoveryRepository } from "../discovery/discovery.repository.js";
import { clearDeploymentCacheState } from "../discovery/discovery.service.js";

function normalizeMac(mac = "") {
  return String(mac || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-F0-9]/g, "");
}

function formatClient(client) {
  if (!client) return null;

  // Explicitly return only safe fields.
  // DO NOT spread (...client) to avoid leaking hardware_fingerprint or provisioning_token literal strings.
  return {
    id: client.id,
    agentId: client.agent_id,
    hostname: client.hostname,
    ip: client.ip,
    mac: client.mac,
    os: client.os,
    deviceType: client.device_type,
    group: client.group,
    status: client.status,
    metrics: client.metrics,
    details: client.details,
    archived: client.archived,
    lastSeenAt: client.last_seen_at,
    createdAt: client.created_at,
    updatedAt: client.updated_at,
    agentVersion: client.agent_version,
    hardwareFingerprint: client.hardware_fingerprint,
    security: {
      isHardwareBound: Boolean(client.hardware_fingerprint),
      hasPendingUpdate: Boolean(client.provisioning_token),
      tokenExpiresAt: client.token_expires_at || null
    }
  };
}

export async function getAllClients() {
  const clients = await ClientRepository.findAll();
  return clients.map(formatClient);
}

export async function getClientById(id) {
  const client = await ClientRepository.findById(id);
  return formatClient(client);
}

export async function registerClient(clientData) {
  const incomingId = clientData.agentId ?? clientData.id;
  if (!incomingId) throw new Error("Client id is required.");

  const now = Date.now();
  const allClientsRaw = await ClientRepository.findAllIncludingArchived();
  const allClients = allClientsRaw.map(formatClient);

  const incomingMacNorm = normalizeMac(clientData.mac);
  const incomingFingerprint = clientData.fingerprint || clientData.details?.specs?.fingerprint;
  const incomingSecureFingerprint = incomingFingerprint ? computeSecureFingerprint(incomingFingerprint) : null;

  console.log(`[CORE DEBUG] Registering client incomingId: ${incomingId}, incomingMac: ${clientData.mac} (norm: ${incomingMacNorm}), incomingFingerprint present: ${Boolean(incomingFingerprint)}`);

  // 1. Check if an existing client matches by ID
  let match = allClients.find(c => c.id === incomingId);
  if (match) console.log(`[CORE DEBUG] Matched by ID: ${match.id}`);

  // 2. If not by ID, check by hardware fingerprint or normalized MAC address
  if (!match) {
    // Priority A: Hardware fingerprint match (secure hash or specs fingerprint)
    match = allClients.find(c => {
      const secureMatch = incomingSecureFingerprint && c.hardwareFingerprint === incomingSecureFingerprint;
      const specsMatch = incomingFingerprint && c.details?.specs?.fingerprint === incomingFingerprint;
      if (secureMatch || specsMatch) {
        console.log(`[CORE DEBUG] Matched by Fingerprint on client ${c.id}`);
      }
      return secureMatch || specsMatch;
    });

    // Priority B: Normalized MAC address match (if no fingerprint match)
    if (!match) {
      match = allClients.find(c => {
        const cMacNorm = normalizeMac(c.mac);
        const macMatch = incomingMacNorm && incomingMacNorm !== "" && incomingMacNorm !== "UNKNOWN" && cMacNorm === incomingMacNorm;
        if (macMatch) {
          console.log(`[CORE DEBUG] Matched by MAC: ${c.mac} (norm: ${cMacNorm}) on client ${c.id}`);
        }
        return macMatch;
      });
    }
  }

  if (!match) {
    console.log(`[CORE DEBUG] NO MATCH FOUND. Existing clients in DB:`, allClients.map(c => ({ id: c.id, agentId: c.agentId, mac: c.mac, normMac: normalizeMac(c.mac), hasFingerprint: Boolean(c.hardwareFingerprint) })));
  }

  const effectiveId = match ? match.id : incomingId;
  const existing = match ? match : await getClientById(incomingId);

  if (match && match.id !== incomingId) {
    console.log(`[CORE] Identity Grafting: Reusing existing record ${match.id} (MAC: ${match.mac}) for new agent ID ${incomingId}. Unarchiving & updating in place.`);
  }

  console.log(`[CORE] Registering agent: ${effectiveId} (incoming ID: ${incomingId}, hostname: ${clientData.hostname})`);

  // Auto-authorize the device
  await authorizeDevice({
    ip: clientData.ip,
    mac: clientData.mac,
    headers: { "x-sentrix-agent-id": effectiveId }
  }, { label: clientData.hostname, type: 'agent_id', identifier: effectiveId });

  // 1. Determine which metrics/details to use.
  const incomingMetrics = clientData.metrics || {};
  const incomingDetails = clientData.details || {};

  const hasIncomingMetrics = Object.keys(incomingMetrics).length > 0;
  const hasIncomingDetails = Object.keys(incomingDetails).length > 0;

  // For the main table, we want normalized metrics
  const metricsToPersist = hasIncomingMetrics
    ? await normalizeMetrics(incomingMetrics)
    : (existing?.metrics || await normalizeMetrics({}));

  const detailsToPersist = hasIncomingDetails
    ? incomingDetails
    : (existing?.details || {});

  // 2. Create or Update the client record FIRST (Source of Truth) using effectiveId
  await ClientRepository.upsert(effectiveId, {
    ...clientData,
    agentId: incomingId,
    metrics: metricsToPersist,
    details: detailsToPersist
  }, now);

  // Clear any active deployment processing record for this IP or MAC upon successful registration
  try {
    await DiscoveryRepository.clearProcessingByIpOrMac(clientData.ip, clientData.mac, "success", now);
    clearDeploymentCacheState(clientData.ip, clientData.mac);
  } catch (err) {
    // ignore
  }

  // 3. Hardware Binding (Security Overhaul Phase 2)
  // Now that the record exists, we can safely bind the hardware fingerprint.
  let secureFingerprint = null;
  if (clientData.fingerprint) {
    try {
      secureFingerprint = await bindHardwareFingerprint(effectiveId, clientData.fingerprint, clientData.provisioningToken);
      console.log(`[CORE] Hardware bound successfully for ${effectiveId}`);
    } catch (err) {
      console.error(`[CORE] Hardware binding failed for ${effectiveId}:`, err.message);
      // NOTE: We don't throw here to avoid a total registration crash,
      // but the agent won't get a secureKey back, so it won't be able to send signed data.
    }
  }

  // 4. Update child-table records
  if (hasIncomingMetrics) {
    await processIncomingMetrics(effectiveId, incomingMetrics, now);
  }

  await recordUptimeStatus(effectiveId, "online", now);

  if (hasIncomingDetails) {
    try {
      await saveHardwareDetails(effectiveId, incomingDetails);
    } catch (err) {
      console.error(`[CORE] Initial hardware save failed for ${effectiveId}:`, err);
    }
  }

  console.log(`[CORE] Agent ${effectiveId} registered successfully. Data preservation: ${!hasIncomingMetrics}`);

  const client = await getClientById(effectiveId);
  return { ...client, secureKey: secureFingerprint };
}

export async function updateClientMetrics(id, metrics = {}, details = null) {
  const now = Date.now();
  const currentClient = await getClientById(id);

  if (!currentClient || currentClient.archived) {
    console.warn(`[CORE] Metrics update failed: Agent ${id} not found or archived.`);
    return null;
  }

  console.log(`[CORE] Updating metrics for agent: ${id} (${currentClient.hostname})`);
  const normalizedMetrics = await processIncomingMetrics(id, metrics, now);
  await recordUptimeStatus(id, "online", now);
  
  if (details) {
    try {
      await saveHardwareDetails(id, details);
    } catch (err) {
      console.error(`[Core] Hardware save failed for ${id}:`, err);
    }
  }

  const success = await ClientRepository.updateMetrics(id, normalizedMetrics, "online", now, details);
  if (!success) return null;

  if (currentClient.ip) {
    try {
      await DiscoveryRepository.clearProcessingByIp(currentClient.ip, "success", now);
    } catch (err) {}
  }

  return getClientById(id);
}

export async function touchClientHeartbeat(id, metrics = null) {
  const now = Date.now();
  const currentClient = await getClientById(id);
  if (!currentClient || currentClient.archived) return null;

  let normalizedMetrics = null;

  const hasTelemetry = metrics && (
    metrics.system !== undefined ||
    metrics.cpu !== undefined ||
    metrics.network !== undefined ||
    metrics.temperature !== undefined ||
    metrics.processes !== undefined
  );

  if (metrics && hasTelemetry) {
    normalizedMetrics = await processIncomingMetrics(id, metrics, now);
  }

  const success = await ClientRepository.updateStatus(id, "online", now, normalizedMetrics);
  if (!success) return null;
  await recordUptimeStatus(id, "online", now);

  if (currentClient.ip) {
    try {
      await DiscoveryRepository.clearProcessingByIp(currentClient.ip, "success", now);
    } catch (err) {}
  }

  return getClientById(id);
}

export async function getClientProcesses(id) {
  return await getLatestClientProcesses(id);
}

export async function getClientNetworkActivity(id) {
  return await getLatestClientNetworkActivity(id);
}

export async function getClientActivityHistory(id) {
  return await getClientActivityHistoryFromRepo(id);
}

export async function getClientPeripheralHistory(id, options = {}) {
  return await getClientPeripheralHistoryFromRepo(id, options);
}

export async function resolveClientPeripheral(id, key, note = "") {
  return resolvePeripheral(id, key, note);
}

export async function archiveClientPeripheral(id, key, note = "") {
  return archivePeripheral(id, key, note);
}

export async function recoverClientPeripheral(id, key, note = "") {
  return recoverPeripheral(id, key, note);
}

export async function getClientEvents(id, options = {}) {
  return getDeviceEvents(id, options);
}

export async function getClientDomains(id, options = {}) {
  return getDomainSummaries(id, options);
}

export async function getClientSoftware(id) {
  return getSoftwareInventory(id);
}

export async function getClientHealth(id, options = {}) {
  return getHealthSummary(id, options);
}

export async function getClientAnomalies(id, options = {}) {
  return getAnomalyAlerts(id, options);
}

export async function updateClientGroup(id, group) {
  const now = Date.now();
  const success = await ClientRepository.updateGroup(id, group, now);
  if (!success) return null;

  return getClientById(id);
}

export async function archiveClient(id) {
  const now = Date.now();
  return await ClientRepository.archive(id, now);
}

export async function markClientOffline(id) {
  const now = Date.now();
  const success = await ClientRepository.updateStatus(id, "offline", now);
  if (!success) return null;
  await recordUptimeStatus(id, "offline", now);

  return getClientById(id);
}

export async function markClientOnline(id) {
  const now = Date.now();
  const success = await ClientRepository.updateClientStatusOnly(id, "online", now);
  if (!success) return null;
  await recordUptimeStatus(id, "online", now);

  return getClientById(id);
}

export async function getClientSummary() {
  const clients = await getAllClients();
  const online = clients.filter((client) => client.status === "online").length;
  const offline = clients.filter((client) => client.status === "offline").length;
  const missingPeripherals = await ClientRepository.countMissingPeripherals();

  return {
    total: clients.length,
    online,
    offline,
    missingPeripherals,
    clients,
  };
}

export async function getClientMetrics(id, options = {}) {
  const client = await getClientById(id);
  if (!client || client.archived) return null;

  return getClientMetricHistory(id, options);
}

export async function getClientHardwareDetails(id) {
  const client = await getClientById(id);
  if (!client || client.archived) return null;

  // Use the atomic details JSON snapshot as the primary source for specifications.
  // This prevents "flickering" caused by partial updates to child tables.
  const details = client.details || {};
  const specs = details.specs || {};
  const agentPeripherals = details.peripherals || {};

  // We still fetch live inventory tracking to get 'missing' vs 'connected' statuses.
  const inventoryData = await getClientPeripheralHistory(id).catch(() => ({ inventory: [] }));
  const inventory = inventoryData.inventory || [];

  return {
    profile: {
      manufacturer: specs.manufacturer || null,
      model: specs.model || null,
      serial: specs.serial || null,
      bios: specs.bios || null,
      baseboard: specs.baseboard || null,
      cpu: specs.cpu || null,
      cpuCores: specs.cpuCores || 0,
      cpuThreads: specs.cpuThreads || 0,
      totalMemoryGb: specs.totalMemoryGb || 0,
      memorySlots: specs.memorySlots || 0,
    },
    peripherals: {
      mouse: Boolean(agentPeripherals.mouse),
      keyboard: Boolean(agentPeripherals.keyboard),
      wifiDongle: Boolean(agentPeripherals.wifiDongle),
      bluetoothDongle: Boolean(agentPeripherals.bluetoothDongle),
      webcam: Boolean(agentPeripherals.webcam),
      storage: Boolean(agentPeripherals.storage),
    },
    disks: (specs.disks || []).map(d => ({
      name: d.name,
      type: d.type || d.disk_type,
      sizeGb: d.sizeGb || d.size_gb,
    })),
    networkAdapters: (specs.networkAdapters || []).map(a => ({
      name: a.name,
      mac: a.mac,
      ip4: a.ip4,
      type: a.type || a.adapter_type,
    })),
    usbDevices: (details.usbDevices || []).map(u => ({
      name: u.name,
      type: u.type || u.device_type,
      vendor: u.manufacturer || u.vendor,
      id: u.deviceId || u.external_id || u.id,
    })),
    graphicsCards: (agentPeripherals.graphicsCards || []).map(g => ({
      model: g.model,
      vendor: g.vendor,
      vram: g.vram || g.vram_mb,
    })),
    displays: (agentPeripherals.displays || []).map(d => ({
      model: d.model,
      resolution: d.resolution,
    })),
    // Attach live inventory for status tracking in the UI
    inventory: inventory.map(item => ({
      key: item.key,
      name: item.name,
      category: item.category,
      status: item.status,
      lastSeenAt: item.last_seen_at || item.lastSeenAt,
    })),
  };
}
