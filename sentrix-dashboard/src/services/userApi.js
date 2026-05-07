import { fetchJson } from "./api.js";

export async function getUsers() {
  const result = await fetchJson("/api/users");
  return result.data;
}

export async function createAdmin(email, password) {
  const result = await fetchJson("/api/users", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return result.data;
}

export async function deleteAdmin(id) {
  const result = await fetchJson(`/api/users/${id}`, {
    method: "DELETE",
  });
  return result;
}
