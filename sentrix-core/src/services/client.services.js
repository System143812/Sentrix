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

export async function getAllClients() {
  return await ClientRepository.findAll();
}

export async function getClientById(id) {
  return await ClientRepository.findById(id);
}

export async function registerClient(clientData) {
  const id = clientData.agentId ?? clientData.id;
  if (!id) throw new Error("Client id is required.");

  console.log(`[CORE] Registering agent: ${id} (${clientData.hostname})`);
  const now = Date.now();
  const metrics = clientData.metrics ?? {};
  const details = clientData.details ?? {};

  // 1. First, ensure the client record exists (Primary Table)
  // We use a basic normalization here for the main table record
  const initialNormalized = await normalizeMetrics(metrics);
  
  await ClientRepository.upsert(id, {
    ...clientData,
    metrics: initialNormalized,
    details
  }, now);

  // 2. Now that the client exists, we can process detailed metrics (Child Tables)
  // This handles processes, network activity, etc. which have FK constraints.
  await processIncomingMetrics(id, metrics, now);

  await saveHardwareDetails(id, details);
  console.log(`[CORE] Agent ${id} registered successfully.`);

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

export async function getClientPeripheralHistory(id) {
  return await getClientPeripheralHistoryFromRepo(id);
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

  const hardware = await getClientHardware(id);

  // Fallback to client.details if structured hardware tables are empty
  if (!hardware.profile && !hardware.peripherals && client.details) {
    return {
      profile: client.details.specs || null,
      peripherals: client.details.peripherals || null,
      disks: client.details.specs?.disks || [],
      networkAdapters: client.details.specs?.networkAdapters || [],
      usbDevices: client.details.usbDevices || [],
      graphicsCards: client.details.peripherals?.graphicsCards || [],
      displays: client.details.peripherals?.displays || [],
    };
  }

  return hardware;
}
