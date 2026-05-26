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

export async function blockAuditLogSubject(id, reason = "") {
  const result = await fetchJson(`/api/audit/${id}/block`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  return result.data;
}
