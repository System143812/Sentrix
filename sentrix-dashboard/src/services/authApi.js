import { fetchJson } from "./api.js";

export async function login(email, password) {
  const result = await fetchJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  return result.data.user;
}

export async function getCurrentUser() {
  const result = await fetchJson("/api/auth/me");
  return result.data;
}

export async function logout() {
  const result = await fetchJson("/api/auth/logout", {
    method: "POST",
  });
  return result;
}
