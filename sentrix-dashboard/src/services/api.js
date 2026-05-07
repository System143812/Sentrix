const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";

export function getApiUrl() {
  return apiUrl;
}

export function getHeaders(additional = {}) {
  return {
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
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
    throw new Error(body.message || "Request failed.");
  }

  return body;
}
