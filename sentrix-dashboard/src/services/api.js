function resolveApiUrl() {
  const port = import.meta.env.VITE_API_PORT || "4000";
  if (typeof window !== "undefined" && window.location.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:${port}`;
  }

  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  return `https://localhost:${port}`;
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
  let response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      credentials: "include",
      ...options,
      headers: getHeaders(options.headers),
    });
  } catch (netErr) {
    throw new Error("Cannot reach Sentrix core server. Please check if the core server is running.");
  }

  let body = {};
  try {
    body = await response.json();
  } catch {
    // Non-JSON response fallback
  }

  if (!response.ok || body?.success === false) {
    if (response.status === 401) {
      setAuthToken(null);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("sentrix:unauthorized"));
      }
      throw new Error("Session expired. Please log in again.");
    }
    if (response.status === 504) {
      throw new Error("Agent did not respond in time (Unresponsive / Timeout).");
    }

    const error = new Error(body.message || `Request failed with status ${response.status}.`);
    error.data = body;
    throw error;
  }

  return body;
}
