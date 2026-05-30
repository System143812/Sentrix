import { fetchJson } from "./api.js";

export async function getTelemetrySettings() {
  const result = await fetchJson("/api/settings/telemetry");
  return result.data;
}

export async function updateTelemetrySettings(intervalMs) {
  const result = await fetchJson("/api/settings/telemetry", {
    method: "PATCH",
    body: JSON.stringify({ intervalMs }),
  });
  return result.data;
}

export async function getPruningSettings() {
  const result = await fetchJson("/api/settings/pruning");
  return result.data;
}

export async function updatePruningSettings(settings) {
  const result = await fetchJson("/api/settings/pruning", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
  return result.data;
}

export async function triggerPruning() {
  const result = await fetchJson("/api/settings/pruning/trigger", {
    method: "POST",
  });
  return result.data;
}

export async function getUtilityConfig() {
  const result = await fetchJson("/api/settings/utilities");
  return result.data;
}

export async function updateUtilityConfig(enabledIds) {
  const result = await fetchJson("/api/settings/utilities", {
    method: "PATCH",
    body: JSON.stringify({ enabledIds }),
  });
  return result.data;
}

