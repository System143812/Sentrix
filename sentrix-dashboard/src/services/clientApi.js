import { fetchJson } from "./api.js";

export async function getClients() {
  const result = await fetchJson("/api/clients");
  return result.data.clients || [];
}

export async function getClient(id) {
  const result = await fetchJson(`/api/clients/${id}`);
  return result.data;
}

export async function getClientMetrics(id, { range = "24h", limit = 1440 } = {}) {
  const params = new URLSearchParams({
    range,
    limit: String(limit),
  });
  const result = await fetchJson(`/api/clients/${id}/metrics?${params.toString()}`);
  return result.data;
}

export async function getClientHardware(id) {
  const result = await fetchJson(`/api/clients/${id}/hardware`);
  return result.data;
}

export async function getClientProcesses(id) {
  const result = await fetchJson(`/api/clients/${id}/processes`);
  return result.data;
}

export async function getClientNetworkActivity(id) {
  const result = await fetchJson(`/api/clients/${id}/network-activity`);
  return result.data;
}

export async function getClientActivityHistory(id) {
  const result = await fetchJson(`/api/clients/${id}/activity-history`);
  return result.data;
}

export async function getClientPeripheralHistory(id) {
  const result = await fetchJson(`/api/clients/${id}/peripherals/history`);
  return result.data;
}

export async function getClientPeripheralHistoryFiltered(id, params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const suffix = search.toString() ? `?${search.toString()}` : "";
  const result = await fetchJson(`/api/clients/${id}/peripherals/history${suffix}`);
  return result.data;
}

export async function updatePeripheralStatus(id, key, action, note = "") {
  const result = await fetchJson(`/api/clients/${id}/peripherals/${encodeURIComponent(key)}/${action}`, {
    method: "PATCH",
    body: JSON.stringify({ note }),
  });
  return result.data;
}

export async function getClientEvents(id, params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const suffix = search.toString() ? `?${search.toString()}` : "";
  const result = await fetchJson(`/api/clients/${id}/events${suffix}`);
  return result.data;
}

export async function getClientDomains(id) {
  const result = await fetchJson(`/api/clients/${id}/domains`);
  return result.data;
}

export async function getClientSoftware(id) {
  const result = await fetchJson(`/api/clients/${id}/software`);
  return result.data;
}

export async function getClientHealth(id) {
  const result = await fetchJson(`/api/clients/${id}/health`);
  return result.data;
}

export async function getClientAnomalies(id) {
  const result = await fetchJson(`/api/clients/${id}/anomalies`);
  return result.data;
}

export async function updateClientGroup(id, group) {
  const result = await fetchJson(`/api/clients/${id}/group`, {
    method: "PATCH",
    body: JSON.stringify({ group }),
  });

  return result.data;
}

export async function archiveClient(id) {
  const result = await fetchJson(`/api/clients/${id}`, {
    method: "DELETE",
  });
  return result;
}

export async function killClientProcess(id, pid) {
  const result = await fetchJson(`/api/clients/${id}/processes/${pid}/kill`, {
    method: "POST",
  });
  return result;
}

export async function sendDeviceCommand(id, command, payload = {}) {
  const result = await fetchJson(`/api/clients/${id}/command`, {
    method: "POST",
    body: JSON.stringify({ command, payload }),
  });
  return result;
}
