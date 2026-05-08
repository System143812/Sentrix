function resolveApiUrl() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  if (typeof window !== "undefined" && window.location.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }

  return "http://localhost:4000";
}

const apiUrl = resolveApiUrl();
const authTokenKey = "sentrix_auth_token";

export function getApiUrl() {
  return apiUrl;
}

export function getAuthToken() {
  return localStorage.getItem(authTokenKey);
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem(authTokenKey, token);
    return;
  }

  localStorage.removeItem(authTokenKey);
}

export function getHeaders(additional = {}) {
  const token = getAuthToken();

  return {
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...additional,
  };
}

export async function fetchJson(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    credentials: "include",
    ...options,
    headers: getHeaders(options.headers),
  });

  const body = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      setAuthToken(null);
    }

    throw new Error(body.message || "Request failed.");
  }

  return body;
}
