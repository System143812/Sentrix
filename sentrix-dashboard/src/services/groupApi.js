import { fetchJson } from "./api.js";

export async function getGroups() {
  const result = await fetchJson("/api/groups");
  return result.data;
}

export async function createGroup(name, description) {
  const result = await fetchJson("/api/groups", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
  return result.data;
}

export async function updateGroup(id, name, description) {
  const result = await fetchJson(`/api/groups/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name, description }),
  });
  return result.data;
}

export async function deleteGroup(id) {
  const result = await fetchJson(`/api/groups/${id}`, {
    method: "DELETE",
  });
  return result;
}
