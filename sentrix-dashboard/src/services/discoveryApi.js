import { fetchJson } from "./api.js";

export async function scanNetwork(subnet = null) {
  const result = await fetchJson("/api/discovery/scan", {
    method: "POST",
    body: JSON.stringify({ subnet }),
  });
  return result.data;
}

export async function getInterfaces() {
  const result = await fetchJson("/api/discovery/interfaces");
  return result.data;
}

export async function getDiscoverySnapshot() {
  const result = await fetchJson("/api/discovery");
  return result.data;
}

export async function deployAgent(ip, device_type, credentials = null, action = "deploy") {
  const result = await fetchJson("/api/discovery/deploy", {
    method: "POST",
    body: JSON.stringify({ ip, device_type, credentials, action }),
  });
  return result.data;
}
