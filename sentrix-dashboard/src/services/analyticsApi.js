import { fetchJson, getApiUrl, getHeaders } from "./api.js";

function buildQuery({ range = "24h", group = "all" } = {}) {
  const params = new URLSearchParams({
    range,
    group,
  });

  return params.toString();
}

export async function getAnalytics({ range = "24h", group = "all" } = {}) {
  const result = await fetchJson(`/api/analytics?${buildQuery({ range, group })}`);
  return result.data;
}

export async function downloadAnalyticsCsv({ range = "24h", group = "all" } = {}) {
  const response = await fetch(
    `${getApiUrl()}/api/analytics/export.csv?${buildQuery({ range, group })}`,
    {
      credentials: "include",
      headers: getHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to export analytics CSV.");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "sentrix-analytics.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
