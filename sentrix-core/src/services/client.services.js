import { ClientRepository } from "./client.repository.js";
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
} from "./metrics/index.js";
import {
  getAnomalyAlerts,
  getDeviceEvents,
  getDomainSummaries,
  getHealthSummary,
  getSoftwareInventory,
  recordUptimeStatus,
} from "./behavior.service.js";
import {
  archivePeripheral,
  recoverPeripheral,
  resolvePeripheral,
} from "./metrics/hardware.service.js";

export async function getAllClients() {
  return await ClientRepository.findAll();
}

export async function getClientById(id) {
  return await ClientRepository.findById(id);
}

export async function registerClient(clientData) {
  const id = clientData.agentId ?? clientData.id;
  if (!id) throw new Error("Client id is required.");

  const existing = await getClientById(id);
  console.log(`[CORE] Registering agent: ${id} (${clientData.hostname})`);
  const now = Date.now();

  // 1. Determine which metrics/details to use. 
  // If the registration packet is empty (typical on restart), keep what we already have.
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

  await ClientRepository.upsert(id, {
    ...clientData,
    metrics: metricsToPersist,
    details: detailsToPersist
  }, now);

  // 2. Only trigger expensive child-table updates if new data was actually sent
  if (hasIncomingMetrics) {
    await processIncomingMetrics(id, incomingMetrics, now);
  }
  
  await recordUptimeStatus(id, "online", now);

  if (hasIncomingDetails) {
    try {
      await saveHardwareDetails(id, incomingDetails);
    } catch (err) {
      console.error(`[CORE] Initial hardware save failed for ${id}:`, err);
    }
  }

  console.log(`[CORE] Agent ${id} registered successfully. Data preservation: ${!hasIncomingMetrics}`);

  return getClientById(id);
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

  return getClientById(id);
}

export async function touchClientHeartbeat(id, metrics = null) {
  const now = Date.now();
  let normalizedMetrics = null;

  if (metrics) {
    const currentClient = await getClientById(id);
    if (!currentClient || currentClient.archived) return null;
    normalizedMetrics = await processIncomingMetrics(id, metrics, now);
  }

  const success = await ClientRepository.updateStatus(id, "online", now, normalizedMetrics);
  if (!success) return null;
  await recordUptimeStatus(id, "online", now);

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
