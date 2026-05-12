import { getAllClients } from "./client.services.js";

const ranges = {
  "24h": {
    label: "Last 24 hours",
    durationMs: 24 * 60 * 60 * 1000,
    buckets: 6,
  },
  "7d": {
    label: "Last 7 days",
    durationMs: 7 * 24 * 60 * 60 * 1000,
    buckets: 7,
  },
  "30d": {
    label: "Last 30 days",
    durationMs: 30 * 24 * 60 * 60 * 1000,
    buckets: 6,
  },
};

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function average(values = []) {
  const usableValues = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (!usableValues.length) return 0;

  const total = usableValues.reduce((sum, value) => sum + value, 0);
  return Math.round(total / usableValues.length);
}

function getRange(rangeKey = "24h") {
  return ranges[rangeKey] || ranges["24h"];
}

function getDeviceLoad(client) {
  const metrics = client.metrics || {};
  return Math.round(
    (clamp(metrics.cpu) + clamp(metrics.ram) + clamp(metrics.disk)) / 3,
  );
}

function getDeviceIssues(client) {
  const metrics = client.metrics || {};
  const issues = [];

  if (client.status !== "online") issues.push("Offline");
  if (clamp(metrics.cpu) >= 85) issues.push("High CPU");
  if (clamp(metrics.ram) >= 85) issues.push("High RAM");
  if (clamp(metrics.disk) >= 90) issues.push("Disk pressure");

  return issues;
}

function getHealthScore(client) {
  const metrics = client.metrics || {};
  const statusPenalty = client.status === "online" ? 0 : 35;
  const cpuPenalty = Math.max(0, clamp(metrics.cpu) - 70) * 0.5;
  const ramPenalty = Math.max(0, clamp(metrics.ram) - 75) * 0.45;
  const diskPenalty = Math.max(0, clamp(metrics.disk) - 85) * 0.7;

  return clamp(
    Math.round(100 - statusPenalty - cpuPenalty - ramPenalty - diskPenalty),
  );
}

function createBuckets(rangeKey, now = Date.now()) {
  const range = getRange(rangeKey);
  const bucketSizeMs = range.durationMs / range.buckets;

  return Array.from({ length: range.buckets }, (_, index) => {
    const start = now - range.durationMs + bucketSizeMs * index;
    const end = start + bucketSizeMs;

    return {
      label: buildBucketLabel(start, rangeKey),
      start,
      end,
      values: {
        cpu: [],
        ram: [],
        disk: [],
        health: [],
        alerts: [],
      },
    };
  });
}

function buildBucketLabel(timestamp, rangeKey) {
  const date = new Date(timestamp);

  if (rangeKey === "24h") {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      hour12: true,
    });
  }

  if (rangeKey === "7d") {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function addPointToBucket(buckets, point) {
  const timestamp = Number(point.timestamp);
  const bucket = buckets.find((item, index) => {
    const isLastBucket = index === buckets.length - 1;
    const isAfterStart = timestamp >= item.start;
    const isBeforeEnd = isLastBucket ? timestamp <= item.end : timestamp < item.end;

    return isAfterStart && isBeforeEnd;
  });

  if (!bucket) return;

  bucket.values.cpu.push(point.cpu);
  bucket.values.ram.push(point.ram);
  bucket.values.disk.push(point.disk);
  bucket.values.health.push(getHealthScore({ metrics: point, status: "online" }));
  bucket.values.alerts.push(getDeviceIssues({ metrics: point, status: "online" }).length);
}

function buildTrend(clients, rangeKey, metricKey) {
  const buckets = createBuckets(rangeKey);

  clients.forEach((client) => {
    const history = Array.isArray(client.history) ? client.history : [];
    const points = history.length
      ? history
      : [{ timestamp: Date.now(), ...(client.metrics || {}) }];

    points.forEach((point) => addPointToBucket(buckets, point));
  });

  return buckets.map((bucket) => ({
    label: bucket.label,
    value: average(bucket.values[metricKey]),
  }));
}

function countAlerts(clients) {
  const alerts = clients.flatMap((client) =>
    getDeviceIssues(client).map((issue) => ({
      clientId: client.id,
      hostname: client.hostname,
      issue,
    })),
  );

  const byType = alerts.reduce((counts, alert) => {
    counts[alert.issue] = (counts[alert.issue] || 0) + 1;
    return counts;
  }, {});

  return {
    total: alerts.length,
    critical: alerts.filter((alert) => alert.issue === "Offline").length,
    byType: Object.entries(byType)
      .map(([name, count]) => ({ name, count }))
      .sort((first, second) => second.count - first.count),
    active: alerts,
  };
}

function filterClients(clients, group = "all") {
  if (!group || group === "all") return clients;

  return clients.filter((client) => (client.group || "Unassigned") === group);
}

function buildGroupStats(clients) {
  const groupNames = [
    ...new Set(clients.map((client) => client.group || "Unassigned")),
  ];

  return groupNames.map((groupName) => {
    const groupClients = clients.filter(
      (client) => (client.group || "Unassigned") === groupName,
    );

    return {
      name: groupName,
      count: groupClients.length,
      online: groupClients.filter((client) => client.status === "online").length,
      offline: groupClients.filter((client) => client.status !== "online").length,
      health: average(groupClients.map(getHealthScore)),
      load: average(groupClients.map(getDeviceLoad)),
      cpu: average(groupClients.map((client) => client.metrics?.cpu)),
      ram: average(groupClients.map((client) => client.metrics?.ram)),
      disk: average(groupClients.map((client) => client.metrics?.disk)),
    };
  });
}

function buildDeviceRows(clients) {
  return clients.map((client) => ({
    id: client.id,
    hostname: client.hostname,
    group: client.group || "Unassigned",
    status: client.status,
    lastSeenAt: client.last_seen_at,
    metrics: client.metrics || {},
    load: getDeviceLoad(client),
    health: getHealthScore(client),
    issues: getDeviceIssues(client),
  }));
}

export async function getAnalyticsSummary(options = {}) {
  const rangeKey = options.range || "24h";
  const allClients = await getAllClients();
  const clients = filterClients(allClients, options.group);
  const deviceRows = buildDeviceRows(clients);
  const alerts = countAlerts(clients);

  return {
    range: {
      key: rangeKey,
      label: getRange(rangeKey).label,
    },
    generatedAt: Date.now(),
    filters: {
      group: options.group || "all",
    },
    totals: {
      total: clients.length,
      online: clients.filter((client) => client.status === "online").length,
      offline: clients.filter((client) => client.status !== "online").length,
    },
    averages: {
      cpu: average(clients.map((client) => client.metrics?.cpu)),
      ram: average(clients.map((client) => client.metrics?.ram)),
      disk: average(clients.map((client) => client.metrics?.disk)),
      uptime: average(clients.map((client) => client.metrics?.uptime)),
      load: average(clients.map(getDeviceLoad)),
      health: average(clients.map(getHealthScore)),
    },
    alerts,
    trends: {
      cpu: buildTrend(clients, rangeKey, "cpu"),
      ram: buildTrend(clients, rangeKey, "ram"),
      disk: buildTrend(clients, rangeKey, "disk"),
      health: buildTrend(clients, rangeKey, "health"),
      alerts: buildTrend(clients, rangeKey, "alerts"),
    },
    groups: buildGroupStats(clients),
    devices: {
      topLoad: [...deviceRows]
        .sort((first, second) => second.load - first.load)
        .slice(0, 5),
      outliers: [...deviceRows]
        .sort((first, second) => first.health - second.health)
        .slice(0, 5),
      recent: [...deviceRows]
        .sort((first, second) => (second.lastSeenAt || 0) - (first.lastSeenAt || 0))
        .slice(0, 5),
      rows: deviceRows,
    },
    exportUrls: {
      csv: `/api/analytics/export.csv?range=${encodeURIComponent(rangeKey)}&group=${encodeURIComponent(options.group || "all")}`,
    },
    dataQuality: {
      realMetrics: ["status", "cpu", "ram", "disk", "uptime", "lastSeenAt"],
      storedHistory: true,
      unavailableMetrics: [
        "cpuTemperature",
        "gpuTemperature",
        "networkThroughput",
        "packetLoss",
        "latency",
      ],
      notes: [
        "Temperature and network values need agent-side collection before they can be real backend metrics.",
        "Trend history starts from the time this backend change is deployed.",
      ],
    },
  };
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function getAnalyticsCsv(options = {}) {
  const summary = await getAnalyticsSummary(options);
  const header = [
    "id",
    "hostname",
    "group",
    "status",
    "health",
    "load",
    "cpu",
    "ram",
    "disk",
    "uptime",
    "issues",
    "lastSeenAt",
  ];

  const rows = summary.devices.rows.map((device) => [
    device.id,
    device.hostname,
    device.group,
    device.status,
    device.health,
    device.load,
    device.metrics.cpu,
    device.metrics.ram,
    device.metrics.disk,
    device.metrics.uptime,
    device.issues.join("; "),
    device.lastSeenAt,
  ]);

  return [header, ...rows]
    .map((row) => row.map(escapeCsv).join(","))
    .join("\n");
}
