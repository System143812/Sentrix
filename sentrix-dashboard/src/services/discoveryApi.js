import { fetchJson } from "./api.js";

export async function scanNetwork() {
  const result = await fetchJson("/api/discovery/scan");
  return result.data;
}

export async function getDiscoverySnapshot() {
  const result = await fetchJson("/api/discovery");
  return result.data;
}

export async function deployAgent(ip, device_type, credentials = null) {
  const result = await fetchJson("/api/discovery/deploy", {
    method: "POST",
    body: JSON.stringify({ ip, device_type, credentials }),
  });
  return result.data;
}
