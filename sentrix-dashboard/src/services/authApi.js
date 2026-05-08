import { fetchJson, getAuthToken, setAuthToken } from "./api.js";

export async function login(email, password) {
  const result = await fetchJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  setAuthToken(result.data.token);
  return result.data.user;
}

export async function getCurrentUser() {
  if (!getAuthToken()) {
    return null;
  }

  const result = await fetchJson("/api/auth/me");
  return result.data;
}

export function clearSavedLogin() {
  setAuthToken(null);
}

export async function logout() {
  try {
    return await fetchJson("/api/auth/logout", {
      method: "POST",
    });
  } finally {
    setAuthToken(null);
  }
}
