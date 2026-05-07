import { fetchJson } from "./api.js";

export async function getClients() {
  const result = await fetchJson("/api/clients");
  return result.data.clients || [];
}

export async function getClient(id) {
  const result = await fetchJson(`/api/clients/${id}`);
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
