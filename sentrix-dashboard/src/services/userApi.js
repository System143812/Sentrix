import { fetchJson } from "./api.js";

export async function getUsers() {
  const result = await fetchJson("/api/users");
  return result.data;
}

export async function createAdmin(email, username, password) {
  const result = await fetchJson("/api/users", {
    method: "POST",
    body: JSON.stringify({ email, username, password }),
  });
  return result.data;
}

export async function deleteAdmin(id) {
  const result = await fetchJson(`/api/users/${id}`, {
    method: "DELETE",
  });
  return result;
}

export async function updateProfile(username) {
  const result = await fetchJson("/api/users/profile", {
    method: "PUT",
    body: JSON.stringify({ username }),
  });
  return result.data;
}
