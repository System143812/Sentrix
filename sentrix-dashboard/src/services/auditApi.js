import { fetchJson } from "./api.js";

export async function getAuditLogs(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });

  const suffix = search.toString() ? `?${search.toString()}` : "";
  const result = await fetchJson(`/api/audit${suffix}`);
  return result.data;
}

export async function authorizeLogSubject(id, reason = "") {
  const result = await fetchJson(`/api/audit/${id}/authorize`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  return result.data;
}

export async function getAuthorityRecords(category = "rate_limit") {
  const result = await fetchJson(`/api/audit/authority?category=${category}`);
  return result.data;
}

export async function revokeAuthority(id, reason = "") {
  const result = await fetchJson(`/api/audit/authority/${id}/revoke`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  return result.data;
}

export async function addToWhitelist(data) {
  const result = await fetchJson("/api/audit/whitelist", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return result.data;
}
