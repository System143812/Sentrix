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
