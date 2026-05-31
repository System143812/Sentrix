import { getAllClients } from "./client.services.js";
import { getGlobalTrendData } from "./metrics/index.js";
import pool from "../lib/database.js";
import PDFDocument from "pdfkit-table";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  VerticalAlign,
  ImageRun,
} from "docx";
import {
  clamp,
  average,
  maxValue,
  getDeviceLoad,
  getDeviceIssues,
  getHealthScore,
} from "../utils/health.utils.js";
import {
  generateLineChart,
  generateDoughnutChart,
  generateShieldLogo,
  generateFullLogo,
} from "./metrics/chart.service.js";

const ranges = {
  "24h": {
    label: "Last 24 hours",
    durationMs: 24 * 60 * 60 * 1000,
    buckets: 12,
  },
  "7d": {
    label: "Last 7 days",
    durationMs: 7 * 24 * 60 * 60 * 1000,
    buckets: 14,
  },
  "30d": {
    label: "Last 30 days",
    durationMs: 30 * 24 * 60 * 60 * 1000,
    buckets: 15,
  },
};

function getRange(rangeKey = "24h") {
  return ranges[rangeKey] || ranges["24h"];
}

function createBuckets(rangeKey, now = Date.now()) {
  const range = getRange(rangeKey);
  const bucketSizeMs = range.durationMs / range.buckets;

  return Array.from({ length: range.buckets }, (_, index) => {
    const start = now - range.durationMs + bucketSizeMs * index;
    const end = start + bucketSizeMs;

    return {
      label: buildBucketLabel(start, rangeKey, index === range.buckets - 1),
      start,
      end,
      values: {
        cpu: [],
        ram: [],
        disk: [],
        health: [],
        alerts: [],
        cpuTemperature: [],
        gpuTemperature: [],
        uploadBytesPerSec: [],
        downloadBytesPerSec: [],
        latencyMs: [],
        packetLoss: [],
      },
    };
  });
}

function buildBucketLabel(timestamp, rangeKey, isLast = false) {
  if (isLast) return "Now";
  const date = new Date(timestamp);

  if (rangeKey === "24h") {
    return date
      .toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
      .replace(":00", "");
  }

  if (rangeKey === "7d") {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function addPointToBucket(buckets, point, fillAll = false) {
  const timestamp = Number(point.timestamp);

  if (fillAll) {
    buckets.forEach((bucket) => {
      bucket.values.cpu.push(point.cpu);
      bucket.values.ram.push(point.ram);
      bucket.values.disk.push(point.disk);
      bucket.values.health.push(
        getHealthScore({ metrics: point, status: "online" }),
      );
      bucket.values.alerts.push(
        getDeviceIssues({ metrics: point, status: "online" }).length,
      );
      bucket.values.cpuTemperature.push(point.cpuTemperature);
      bucket.values.gpuTemperature.push(point.gpuTemperature);
      bucket.values.uploadBytesPerSec.push(point.uploadBytesPerSec);
      bucket.values.downloadBytesPerSec.push(point.downloadBytesPerSec);
      bucket.values.latencyMs.push(point.latencyMs);
      bucket.values.packetLoss.push(point.packetLoss);
    });
    return;
  }

  const bucket = buckets.find((item, index) => {
    const isLastBucket = index === buckets.length - 1;
    const isAfterStart = timestamp >= item.start;
    const isBeforeEnd = isLastBucket
      ? timestamp <= item.end
      : timestamp < item.end;

    return isAfterStart && isBeforeEnd;
  });

  if (!bucket) return;

  bucket.values.cpu.push(point.cpu);
  bucket.values.ram.push(point.ram);
  bucket.values.disk.push(point.disk);
  bucket.values.health.push(
    getHealthScore({ metrics: point, status: "online" }),
  );
  bucket.values.alerts.push(
    getDeviceIssues({ metrics: point, status: "online" }).length,
  );
  bucket.values.cpuTemperature.push(point.cpuTemperature);
  bucket.values.gpuTemperature.push(point.gpuTemperature);
  bucket.values.uploadBytesPerSec.push(point.uploadBytesPerSec);
  bucket.values.downloadBytesPerSec.push(point.downloadBytesPerSec);
  bucket.values.latencyMs.push(point.latencyMs);
  bucket.values.packetLoss.push(point.packetLoss);
}

function buildFallbackPoint(client) {
  const metrics = client.metrics || {};
  const network = metrics.network || {};
  const temperature = metrics.temperature || {};

  return {
    timestamp: Date.now(),
    cpu: metrics.cpu,
    ram: metrics.ram,
    disk: metrics.disk,
    uptime: metrics.uptime,
    cpuTemperature:
      temperature.cpu?.temperatureCelsius ?? metrics.cpuTemperature,
    gpuTemperature:
      temperature.gpu?.temperatureCelsius ?? metrics.gpuTemperature,
    uploadBytesPerSec: network.uploadBytesPerSec ?? metrics.uploadBytesPerSec,
    downloadBytesPerSec:
      network.downloadBytesPerSec ?? metrics.downloadBytesPerSec,
    latencyMs: network.latencyMs ?? metrics.latencyMs,
    packetLoss: network.packetLoss ?? metrics.packetLoss,
  };
}

function buildTrends(clients, samples, rangeKey) {
  const buckets = createBuckets(rangeKey);
  const clientIds = new Set(clients.map((c) => c.id));

  const relevantSamples = samples.filter((s) => clientIds.has(s.client_id));

  if (relevantSamples.length > 0) {
    relevantSamples.forEach((point) => addPointToBucket(buckets, point));
  } else {
    // If no history exists, fill all buckets with the current average to show a stable baseline.
    clients.forEach((client) => {
      addPointToBucket(buckets, buildFallbackPoint(client), true);
    });
  }

  const result = {};
  const metrics = [
    "cpu",
    "ram",
    "disk",
    "health",
    "alerts",
    "cpuTemperature",
    "gpuTemperature",
    "uploadBytesPerSec",
    "downloadBytesPerSec",
    "latencyMs",
    "packetLoss",
  ];

  metrics.forEach((m) => {
    result[m] = buckets.map((bucket) => ({
      label: bucket.label,
      value:
        m === "alerts" ? maxValue(bucket.values[m]) : average(bucket.values[m]),
    }));
  });

  return result;
}

function buildDeviceTrends(clients, samples, rangeKey) {
  const result = {};
  const clientIds = new Set(clients.map((c) => c.id));
  const relevantSamples = samples.filter((s) => clientIds.has(s.client_id));

  clients.forEach((client) => {
    const deviceBuckets = createBuckets(rangeKey);
    const deviceSamples = relevantSamples.filter(
      (s) => s.client_id === client.id,
    );

    if (deviceSamples.length > 0) {
      deviceSamples.forEach((point) => addPointToBucket(deviceBuckets, point));
    } else {
      // Steady-state fallback: Fill all buckets with current metrics if no history is recorded.
      addPointToBucket(deviceBuckets, buildFallbackPoint(client), true);
    }

    result[client.id] = {
      health: deviceBuckets.map((b) => ({
        label: b.label,
        value: average(b.values.health),
      })),
      load: deviceBuckets.map((b) => {
        const cpu = average(b.values.cpu);
        const ram = average(b.values.ram);
        const disk = average(b.values.disk);

        if (cpu === null && ram === null && disk === null) {
          return { label: b.label, value: null };
        }

        return {
          label: b.label,
          value: Math.round(((cpu ?? 0) + (ram ?? 0) + (disk ?? 0)) / 3),
        };
      }),
    };
  });

  return result;
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
      online: groupClients.filter((client) => client.status === "online")
        .length,
      offline: groupClients.filter((client) => client.status !== "online")
        .length,
      health: average(groupClients.map(getHealthScore)),
      load: average(groupClients.map(getDeviceLoad)),
      cpu: average(groupClients.map((client) => client.metrics?.cpu)),
      ram: average(groupClients.map((client) => client.metrics?.ram)),
      disk: average(groupClients.map((client) => client.metrics?.disk)),
      cpuTemperature: average(
        groupClients.map(
          (client) =>
            client.metrics?.temperature?.cpu?.temperatureCelsius ??
            client.metrics?.cpuTemperature,
        ),
      ),
      gpuTemperature: average(
        groupClients.map(
          (client) =>
            client.metrics?.temperature?.gpu?.temperatureCelsius ??
            client.metrics?.gpuTemperature,
        ),
      ),
      uploadBytesPerSec: average(
        groupClients.map(
          (client) =>
            client.metrics?.network?.uploadBytesPerSec ??
            client.metrics?.uploadBytesPerSec,
        ),
      ),
      downloadBytesPerSec: average(
        groupClients.map(
          (client) =>
            client.metrics?.network?.downloadBytesPerSec ??
            client.metrics?.downloadBytesPerSec,
        ),
      ),
      latencyMs: average(
        groupClients.map(
          (client) =>
            client.metrics?.network?.latencyMs ?? client.metrics?.latencyMs,
        ),
      ),
      packetLoss: average(
        groupClients.map(
          (client) =>
            client.metrics?.network?.packetLoss ?? client.metrics?.packetLoss,
        ),
      ),
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

export function buildPeripheralSummary(clients, inventory) {
  const clientIds = new Set(clients.map((c) => c.id));
  const relevantInventory = inventory.filter(
    (i) =>
      clientIds.has(i.client_id) &&
      !["archived", "resolved"].includes(i.status),
  );

  const byClient = relevantInventory.reduce((acc, item) => {
    if (!acc[item.client_id]) {
      acc[item.client_id] = { connected: 0, missing: 0, total: 0 };
    }
    acc[item.client_id].total++;
    if (item.status === "connected") acc[item.client_id].connected++;
    else acc[item.client_id].missing++;
    return acc;
  }, {});

  const summaryByGroup = clients.reduce((acc, client) => {
    const group = client.group || "Unassigned";
    if (!acc[group]) {
      acc[group] = {
        totalDevices: 0,
        devicesWithMissing: 0,
        totalPeripherals: 0,
        missingPeripherals: 0,
      };
    }
    acc[group].totalDevices++;
    const stats = byClient[client.id] || { connected: 0, missing: 0, total: 0 };
    acc[group].totalPeripherals += stats.total;
    acc[group].missingPeripherals += stats.missing;
    if (stats.missing > 0) acc[group].devicesWithMissing++;
    return acc;
  }, {});

  return {
    totalMissing: relevantInventory.filter((i) => i.status === "missing")
      .length,
    devicesWithMissing: Object.values(byClient).filter((c) => c.missing > 0)
      .length,
    groups: Object.entries(summaryByGroup).map(([name, stats]) => ({
      name,
      ...stats,
    })),
    byDevice: clients
      .map((client) => ({
        id: client.id,
        hostname: client.hostname,
        group: client.group || "Unassigned",
        ...(byClient[client.id] || { connected: 0, missing: 0, total: 0 }),
      }))
      .filter((d) => d.total > 0),
  };
}

export async function getAnalyticsSummary(options = {}) {
  const rangeKey = options.range || "24h";
  const allClients = await getAllClients();
  const clients = filterClients(allClients, options.group);
  const deviceRows = buildDeviceRows(clients);
  const alerts = countAlerts(clients);

  const [inventory] = await pool.query(
    "SELECT * FROM client_peripheral_inventory",
  );
  const peripheralSummary = buildPeripheralSummary(clients, inventory);

  // Deep hardware metadata for professional reports
  const [hardwareProfiles] = await pool.query(
    "SELECT * FROM client_hardware_profiles",
  );
  const profilesByClient = new Map(
    hardwareProfiles.map((p) => [p.client_id, p]),
  );

  deviceRows.forEach((row) => {
    const profile = profilesByClient.get(row.id);
    if (profile) {
      row.specs = {
        cpu: profile.cpu_model,
        ram: profile.total_memory_gb,
        manufacturer: profile.manufacturer,
        model: profile.model,
      };
    } else {
      row.specs = {
        cpu: "Unknown",
        ram: 0,
        manufacturer: "Unknown",
        model: "Unknown",
      };
    }
  });

  const range = getRange(rangeKey);
  const rangeStartMs = Date.now() - range.durationMs;
  const samples = await getGlobalTrendData(rangeStartMs);
  const trends = buildTrends(clients, samples, rangeKey);
  const deviceTrends = buildDeviceTrends(clients, samples, rangeKey);

  const hasCpuTemperature = clients.some(
    (client) =>
      client.metrics?.temperature?.cpu?.temperatureCelsius != null ||
      client.metrics?.cpuTemperature != null,
  );
  const hasGpuTemperature = clients.some(
    (client) =>
      client.metrics?.temperature?.gpu?.temperatureCelsius != null ||
      client.metrics?.gpuTemperature != null,
  );
  const hasNetwork = clients.some((client) => {
    const network = client.metrics?.network || {};
    return (
      network.uploadBytesPerSec != null ||
      network.downloadBytesPerSec != null ||
      network.latencyMs != null ||
      network.packetLoss != null ||
      client.metrics?.uploadBytesPerSec != null ||
      client.metrics?.downloadBytesPerSec != null ||
      client.metrics?.latencyMs != null ||
      client.metrics?.packetLoss != null
    );
  });

  return {
    range: {
      key: rangeKey,
      label: range.label,
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
      cpu: average(clients.map((client) => client.metrics?.cpu)) ?? 0,
      ram: average(clients.map((client) => client.metrics?.ram)) ?? 0,
      disk: average(clients.map((client) => client.metrics?.disk)) ?? 0,
      uptime: average(clients.map((client) => client.metrics?.uptime)) ?? 0,
      load: average(clients.map(getDeviceLoad)) ?? 0,
      health: average(clients.map(getHealthScore)) ?? 0,
      cpuTemperature: average(
        clients.map(
          (client) =>
            client.metrics?.temperature?.cpu?.temperatureCelsius ??
            client.metrics?.cpuTemperature,
        ),
      ),
      gpuTemperature: average(
        clients.map(
          (client) =>
            client.metrics?.temperature?.gpu?.temperatureCelsius ??
            client.metrics?.gpuTemperature,
        ),
      ),
      uploadBytesPerSec: average(
        clients.map(
          (client) =>
            client.metrics?.network?.uploadBytesPerSec ??
            client.metrics?.uploadBytesPerSec,
        ),
      ),
      downloadBytesPerSec: average(
        clients.map(
          (client) =>
            client.metrics?.network?.downloadBytesPerSec ??
            client.metrics?.downloadBytesPerSec,
        ),
      ),
      latencyMs: average(
        clients.map(
          (client) =>
            client.metrics?.network?.latencyMs ?? client.metrics?.latencyMs,
        ),
      ),
      packetLoss: average(
        clients.map(
          (client) =>
            client.metrics?.network?.packetLoss ?? client.metrics?.packetLoss,
        ),
      ),
    },
    alerts,
    trends,
    deviceTrends,
    groups: buildGroupStats(clients),
    peripherals: peripheralSummary,
    devices: {
      topLoad: [...deviceRows]
        .sort((first, second) => second.load - first.load)
        .slice(0, 5),
      outliers: [...deviceRows]
        .sort((first, second) => first.health - second.health)
        .slice(0, 5),
      recent: [...deviceRows]
        .sort(
          (first, second) => (second.lastSeenAt || 0) - (first.lastSeenAt || 0),
        )
        .slice(0, 5),
      rows: deviceRows,
    },
    exportUrls: {
      csv: `/api/analytics/export.csv?range=${encodeURIComponent(rangeKey)}&group=${encodeURIComponent(options.group || "all")}`,
      pdf: `/api/analytics/export.pdf?range=${encodeURIComponent(rangeKey)}&group=${encodeURIComponent(options.group || "all")}`,
      docx: `/api/analytics/export.docx?range=${encodeURIComponent(rangeKey)}&group=${encodeURIComponent(options.group || "all")}`,
    },
    dataQuality: {
      realMetrics: [
        "status",
        "cpu",
        "ram",
        "disk",
        "uptime",
        "lastSeenAt",
        ...(hasCpuTemperature ? ["cpuTemperature"] : []),
        ...(hasGpuTemperature ? ["gpuTemperature"] : []),
        ...(hasNetwork
          ? [
              "uploadBytesPerSec",
              "downloadBytesPerSec",
              "latencyMs",
              "packetLoss",
            ]
          : []),
      ],
      realMetricDetails: {
        temperature: {
          cpu: hasCpuTemperature,
          gpu: hasGpuTemperature,
        },
        network: hasNetwork,
      },
      storedHistory: true,
      unavailableMetrics: [
        ...(!hasCpuTemperature ? ["cpuTemperature"] : []),
        ...(!hasGpuTemperature ? ["gpuTemperature"] : []),
        ...(!hasNetwork ? ["networkThroughput", "packetLoss", "latency"] : []),
      ],
      notes: [
        hasCpuTemperature || hasGpuTemperature || hasNetwork
          ? "Temperature and network metrics are populated when updated agents report them."
          : "Temperature and network values need agent-side collection before they can be real backend metrics.",
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
    "Table",
    "Device ID",
    "Device Name",
    "Group",
    "Agent Status",
    "Manufacturer",
    "Model",
    "CPU Processor",
    "Total RAM (GB)",
    "Health Score (%)",
    "Overall Load (%)",
    "CPU Usage (%)",
    "Memory Usage (%)",
    "Disk Usage (%)",
    "Uptime Seconds",
    "CPU Temperature (C)",
    "GPU Temperature (C)",
    "Upload (bytes/sec)",
    "Download (bytes/sec)",
    "Latency (ms)",
    "Packet Loss (%)",
    "Connected Peripherals",
    "Missing Peripherals",
    "Active Issues",
    "Last Seen",
    "Export Range",
    "Generated At",
  ];

  const rows = summary.devices.rows.map((device) => {
    const metrics = device.metrics || {};
    const network = metrics.network || {};
    const temperature = metrics.temperature || {};
    const specs = device.specs || {};
    const pStats = (summary.peripherals?.byDevice || []).find(
      (d) => d.id === device.id,
    ) || { connected: 0, missing: 0 };

    return [
      "Device Metrics",
      device.id,
      device.hostname,
      device.group,
      device.status,
      specs.manufacturer || "Unknown",
      specs.model || "Unknown",
      specs.cpu || "Unknown",
      specs.ram || 0,
      device.health,
      device.load,
      metrics.cpu,
      metrics.ram,
      metrics.disk,
      metrics.uptime,
      temperature.cpu?.temperatureCelsius ?? metrics.cpuTemperature,
      temperature.gpu?.temperatureCelsius ?? metrics.gpuTemperature,
      network.uploadBytesPerSec ?? metrics.uploadBytesPerSec,
      network.downloadBytesPerSec ?? metrics.downloadBytesPerSec,
      network.latencyMs ?? metrics.latencyMs,
      network.packetLoss ?? metrics.packetLoss,
      pStats.connected,
      pStats.missing,
      device.issues.join("; "),
      device.lastSeenAt
        ? new Date(Number(device.lastSeenAt)).toISOString()
        : "",
      summary.range.label,
      new Date(Number(summary.generatedAt)).toISOString(),
    ];
  });

  const groupHeader = [
    "Table",
    "Group",
    "Total Devices",
    "Online Devices",
    "Offline Devices",
    "Health Score (%)",
    "Overall Load (%)",
    "Average CPU (%)",
    "Average Memory (%)",
    "Average Disk (%)",
    "Average Latency (ms)",
    "Packet Loss (%)",
  ];
  const groupRows = summary.groups.map((group) => [
    "Group Summary",
    group.name,
    group.count,
    group.online,
    group.offline,
    group.health,
    group.load,
    group.cpu,
    group.ram,
    group.disk,
    group.latencyMs,
    group.packetLoss,
  ]);

  return [header, ...rows, [], groupHeader, ...groupRows]
    .map((row) => row.map(escapeCsv).join(","))
    .join("\n");
}

export async function getAnalyticsPdf(options = {}) {
  const summary = await getAnalyticsSummary(options);

  const healthTrendData = summary.trends.health.map((p) => p.value);
  const loadTrendData = summary.trends.cpu.map((cpu, i) => {
    const ram = summary.trends.ram[i].value;
    const disk = summary.trends.disk[i].value;
    return Math.round(((cpu.value || 0) + (ram || 0) + (disk || 0)) / 3);
  });
  const trendLabels = summary.trends.health.map((p) => p.label);

  const [healthChart, loadChart, shieldBuffer] = await Promise.all([
    generateLineChart({
      title: "Fleet Health Trend (%)",
      labels: trendLabels,
      datasets: [
        { label: "Health Score", data: healthTrendData, color: "#10b981" },
      ],
    }),
    generateLineChart({
      title: "Resource Load Trend (%)",
      labels: trendLabels,
      datasets: [
        { label: "Aggregate Load", data: loadTrendData, color: "#3b82f6" },
      ],
    }),
    generateShieldLogo(),
  ]);

  const doc = new PDFDocument({
    margin: 40,
    size: "A4",
    bufferPages: true,
    info: {
      Title: "Sentrix Lab Analytics Report",
      Author: "Sentrix Fleet Management",
    },
  });

  const buffers = [];
  doc.on("data", (chunk) => buffers.push(chunk));

  return new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));

    // --- PAGE 1: HEADER & BRANDING ---
    // 1. Header Metadata (Absolute top)
    doc
      .fillColor("#64748b")
      .fontSize(8)
      .font("Helvetica-Bold")
      .text(
        `FOR: ${summary.filters.group.toUpperCase()}  |  PERIOD: ${summary.range.label}  |  AT: ${new Date(Number(summary.generatedAt)).toLocaleString()}`,
        40,
        20,
      );

    // 2. Dark Branding Block (Solid background)
    doc.rect(0, 40, 600, 160).fill("#0f172a");

    // 3. Logo Icon (WRAP THROUGH - drawn at absolute pos, does not advance doc.y)
    doc.image(shieldBuffer, 40, 80, { width: 45 });

    // 4. Title Text (Beside logo)
    doc
      .fillColor("#ffffff")
      .fontSize(26)
      .font("Helvetica-Bold")
      .text("Sentrix Lab Analytics", 95, 90);
    doc
      .fontSize(13)
      .font("Helvetica")
      .text("Fleet Performance & Security Report", 95, 120);
    doc.rect(95, 145, 40, 2.5).fill("#3b82f6");

    // 5. Establish cursor for main content (Below header block)
    doc.x = 40;
    doc.y = 220;

    // --- 1. DETAILED FLEET BREAKDOWN ---
    doc
      .fillColor("#0f172a")
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("Detailed Fleet breakdown", 40, doc.y, { align: "left" });
    doc.moveDown(0.3);

    const metricsTable = {
      headers: [
        { label: "Metric Type", property: "m1", align: "left" },
        { label: "Average Value", property: "v1", align: "left" },
        { label: "Metric Type", property: "m2", align: "left" },
        { label: "Average Value", property: "v2", align: "left" },
      ],
      rows: [
        [
          "Aggregate CPU Usage",
          `${Math.round(summary.averages.cpu)}%`,
          "Aggregate RAM Usage",
          `${Math.round(summary.averages.ram)}%`,
        ],
        [
          "Fleet Disk Usage",
          `${Math.round(summary.averages.disk)}%`,
          "Avg Device Uptime",
          `${(summary.averages.uptime / 3600).toFixed(1)} hrs`,
        ],
        [
          "Avg CPU Temperature",
          summary.averages.cpuTemperature
            ? `${Math.round(summary.averages.cpuTemperature)}°C`
            : "N/A",
          "Avg GPU Temperature",
          summary.averages.gpuTemperature
            ? `${Math.round(summary.averages.gpuTemperature)}°C`
            : "N/A",
        ],
        [
          "Network Latency",
          `${Math.round(summary.averages.latencyMs)} ms`,
          "Packet Loss Rate",
          `${summary.averages.packetLoss?.toFixed(2)}%`,
        ],
      ],
    };

    doc.table(metricsTable, {
      x: (595.28 - 500) / 2,
      width: 500,
      prepareHeader: () =>
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#475569"),
      prepareRow: () => doc.font("Helvetica").fontSize(8).fillColor("#1e293b"),
    });

    doc.moveDown(1);

    // --- 2. ALERT ANALYSIS ---
    doc
      .fillColor("#0f172a")
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("Active Issue Analysis", 40, doc.y, { align: "left" });
    doc.moveDown(0.4);

    if (summary.alerts.byType.length > 0) {
      const alertSummaryText = summary.alerts.byType
        .slice(0, 4)
        .map((a) => `${a.name}: ${a.count}`)
        .join("   |   ");
      doc
        .fillColor("#64748b")
        .fontSize(9)
        .font("Helvetica")
        .text(alertSummaryText, 40, doc.y, { align: "left", width: 515 });
    } else {
      doc
        .fillColor("#10b981")
        .fontSize(9)
        .font("Helvetica-Bold")
        .text(
          "System Status: OPTIMAL. No active issues detected across the fleet.",
          40,
          doc.y,
          { align: "left" },
        );
    }

    doc.moveDown(1.2);

    // --- 3. TOP OUTLIERS ---
    doc
      .fillColor("#0f172a")
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("Primary Device Outliers (Action Required)", 40, doc.y, {
        align: "left",
      });
    doc.moveDown(0.4);

    const outlierTable = {
      headers: [
        { label: "Device Hostname", property: "hostname", align: "left" },
        { label: "Group", property: "group", align: "left" },
        { label: "Health Score", property: "health", align: "left" },
        { label: "Primary Issues", property: "issues", align: "left" },
      ],
      rows: summary.devices.outliers
        .slice(0, 3)
        .map((d) => [
          d.hostname,
          d.group,
          `${d.health}%`,
          d.issues.slice(0, 2).join(", ") || "No specific issues",
        ]),
    };

    doc.table(outlierTable, {
      x: (595.28 - 500) / 2,
      width: 500,
      prepareHeader: () =>
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#475569"),
      prepareRow: (row, index) =>
        doc.font("Helvetica").fontSize(8).fillColor("#f43f5e"),
    });

    doc.moveDown(1.2);

    // --- 4. EXECUTIVE SUMMARY (KPI CARDS AT BOTTOM) ---
    doc
      .fillColor("#0f172a")
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("Executive Summary Status", 40, doc.y, { align: "left" });
    doc.rect(40, doc.y + 2, 30, 2).fill("#10b981");
    doc.moveDown(1.5);

    const cardWidth = 165;
    const gutter = 10;
    let currentX = 40;
    let startY = doc.y;

    function drawKPICard(label, value, color, x, y) {
      doc.rect(x, y, cardWidth, 60).fillAndStroke("#ffffff", "#f1f5f9");
      doc.rect(x, y, 3, 60).fill(color);
      doc
        .fillColor("#64748b")
        .fontSize(7)
        .font("Helvetica-Bold")
        .text(label.toUpperCase(), x + 12, y + 12);
      doc
        .fillColor("#1e293b")
        .fontSize(18)
        .font("Helvetica-Bold")
        .text(value, x + 12, y + 28);
    }

    drawKPICard(
      "Avg Fleet Health",
      `${summary.averages.health}%`,
      "#10b981",
      currentX,
      startY,
    );
    currentX += cardWidth + gutter;
    drawKPICard(
      "Online Units",
      `${summary.totals.online} / ${summary.totals.total}`,
      "#3b82f6",
      currentX,
      startY,
    );
    currentX += cardWidth + gutter;
    drawKPICard(
      "Critical Alerts",
      String(summary.alerts.critical),
      "#f43f5e",
      currentX,
      startY,
    );

    doc.addPage();

    // --- PAGE 2: GRAPHS ---
    doc
      .fillColor("#0f172a")
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("Performance Trend Analysis", 40, doc.y, { align: "left" });
    doc.rect(40, doc.y + 2, 30, 2).fill("#3b82f6");
    doc.moveDown(2);

    const chartWidth = 440;
    const centerX = (doc.page.width - chartWidth) / 2;

    doc.image(healthChart, centerX, doc.y, { width: chartWidth });
    doc.y += 240;
    doc.image(loadChart, centerX, doc.y, { width: chartWidth });

    doc.addPage();

    // --- PAGE 3: TABLES ---
    doc
      .fillColor("#0f172a")
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("Device Performance Details", 40, doc.y, { align: "left" });
    doc.moveDown(1);

    const deviceTable = {
      headers: [
        { label: "Hostname", property: "hostname", width: 100, align: "left" },
        { label: "Group", property: "group", width: 80, align: "left" },
        { label: "Health", property: "health", width: 40, align: "left" },
        { label: "CPU", property: "cpu", width: 40, align: "left" },
        { label: "RAM", property: "ram", width: 40, align: "left" },
        { label: "Status", property: "status", width: 60, align: "left" },
        { label: "Processor", property: "specs", width: 135, align: "left" },
      ],
      datas: summary.devices.rows.map((d) => ({
        hostname: d.hostname,
        group: d.group,
        health: `${d.health}%`,
        cpu: `${d.metrics.cpu || 0}%`,
        ram: `${d.metrics.ram || 0}%`,
        status: d.status.toUpperCase(),
        specs: d.specs?.cpu || "Unknown",
      })),
    };

    doc.table(deviceTable, {
      x: (595.28 - 495) / 2,
      prepareHeader: () =>
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#475569"),
      prepareRow: (row, index, column, rect, rectRow) => {
        doc.font("Helvetica").fontSize(8).fillColor("#1e293b");
        if (rectRow && index % 2 === 0)
          doc.addBackground(rectRow, "#f8fafc", 0.5);
      },
      padding: 8,
    });

    if (summary.groups.length > 0) {
      doc.moveDown(2);
      doc
        .fillColor("#0f172a")
        .fontSize(14)
        .font("Helvetica-Bold")
        .text("Group Distribution Analysis", 40, doc.y, { align: "left" });
      doc.moveDown(0.5);

      const groupTable = {
        headers: [
          { label: "Group", property: "group", align: "left" },
          { label: "Devices", property: "devices", align: "left" },
          { label: "Online", property: "online", align: "left" },
          { label: "Avg Health", property: "health", align: "left" },
          { label: "Avg Load", property: "load", align: "left" },
        ],
        rows: summary.groups.map((g) => [
          g.name,
          String(g.count),
          String(g.online),
          `${g.health}%`,
          `${g.load}%`,
        ]),
      };

      doc.table(groupTable, {
        x: (595.28 - 500) / 2,
        width: 500,
        prepareHeader: () =>
          doc.font("Helvetica-Bold").fontSize(8).fillColor("#475569"),
        prepareRow: () =>
          doc.font("Helvetica").fontSize(8).fillColor("#334155"),
      });
    }

    if (summary.peripherals?.byDevice?.length > 0) {
      doc.moveDown(2);
      doc
        .fillColor("#0f172a")
        .fontSize(14)
        .font("Helvetica-Bold")
        .text("Peripheral Security & Inventory", 40, doc.y, { align: "left" });
      doc.moveDown(0.5);

      const peripheralTable = {
        headers: [
          { label: "Hostname", property: "hostname", align: "left" },
          { label: "Total Items", property: "total", align: "left" },
          { label: "Connected", property: "connected", align: "left" },
          { label: "Status", property: "status", align: "left" },
        ],
        rows: summary.peripherals.byDevice.map((d) => [
          d.hostname,
          String(d.total),
          String(d.connected),
          d.missing > 0 ? `${d.missing} MISSING` : "SECURE",
        ]),
      };

      doc.table(peripheralTable, {
        x: (595.28 - 500) / 2,
        width: 500,
        prepareHeader: () =>
          doc.font("Helvetica-Bold").fontSize(8).fillColor("#475569"),
        prepareRow: (row, index) => {
          const isMissing = row[3] && String(row[3]).includes("MISSING");
          doc
            .font("Helvetica")
            .fontSize(8)
            .fillColor(isMissing ? "#f43f5e" : "#10b981");
        },
      });
    }

    // Final Footer Logic (Page Numbers)
    const rangeCount = doc.bufferedPageRange().count;
    for (let i = 0; i < rangeCount; i++) {
      doc.switchToPage(i);
      doc
        .fillColor("#94a3b8")
        .fontSize(7)
        .text(
          `Sentrix Intelligence Report | Page ${i + 1} of ${rangeCount}`,
          40,
          785,
          { align: "left" },
        );
    }

    doc.end();
  });
}

export async function getAnalyticsDocx(options = {}) {
  const summary = await getAnalyticsSummary(options);

  const healthTrendData = summary.trends.health.map((p) => p.value);
  const loadTrendData = summary.trends.cpu.map((cpu, i) => {
    const ram = summary.trends.ram[i].value;
    const disk = summary.trends.disk[i].value;
    return Math.round(((cpu.value || 0) + (ram || 0) + (disk || 0)) / 3);
  });
  const trendLabels = summary.trends.health.map((p) => p.label);

  const [healthChart, loadChart, logoBuffer] = await Promise.all([
    generateLineChart({
      title: "Fleet Health Trend (%)",
      labels: trendLabels,
      datasets: [
        { label: "Health Score", data: healthTrendData, color: "#10b981" },
      ],
    }),
    generateLineChart({
      title: "Resource Load Trend (%)",
      labels: trendLabels,
      datasets: [
        { label: "Aggregate Load", data: loadTrendData, color: "#3b82f6" },
      ],
    }),
    generateFullLogo(),
  ]);

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } }, // 0.5 inch for high density
        },
        children: [
          // --- PAGE 1: HEADER & INTRO ---
          new Paragraph({
            children: [
              new ImageRun({
                data: logoBuffer,
                transformation: { width: 180, height: 45 },
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `FOR: ${summary.filters.group.toUpperCase()}  |  PERIOD: ${summary.range.label}  |  AT: ${new Date(Number(summary.generatedAt)).toLocaleString()}`,
                size: 16,
                color: "64748b",
                bold: true,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          new Paragraph({
            text: "Sentrix Intelligence Report",
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Fleet Performance & Security Analysis",
                color: "3b82f6",
                bold: true,
                size: 28,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 800 },
          }),

          // --- 1. DETAILED FLEET BREAKDOWN ---
          new Paragraph({
            text: "Detailed Fleet Breakdown",
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 200 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: "Aggregate CPU Usage",
                        bold: true,
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: `${Math.round(summary.averages.cpu)}%`,
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: "Aggregate RAM Usage",
                        bold: true,
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: `${Math.round(summary.averages.ram)}%`,
                      }),
                    ],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({ text: "Fleet Disk Usage", bold: true }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: `${Math.round(summary.averages.disk)}%`,
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({ text: "Avg Device Uptime", bold: true }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: `${(summary.averages.uptime / 3600).toFixed(1)} hrs`,
                      }),
                    ],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({ text: "Avg CPU Temp", bold: true }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: summary.averages.cpuTemperature
                          ? `${Math.round(summary.averages.cpuTemperature)}°C`
                          : "N/A",
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({ text: "Avg GPU Temp", bold: true }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: summary.averages.gpuTemperature
                          ? `${Math.round(summary.averages.gpuTemperature)}°C`
                          : "N/A",
                      }),
                    ],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({ text: "Network Latency", bold: true }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: `${Math.round(summary.averages.latencyMs)} ms`,
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({ text: "Packet Loss Rate", bold: true }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: `${summary.averages.packetLoss?.toFixed(2)}%`,
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),

          // --- 2. ALERT ANALYSIS ---
          new Paragraph({
            text: "Active Issue Analysis",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text:
                  summary.alerts.byType.length > 0
                    ? summary.alerts.byType
                        .slice(0, 4)
                        .map((a) => `${a.name}: ${a.count}`)
                        .join("   |   ")
                    : "System Status: OPTIMAL. No active issues detected across the fleet.",
                color: summary.alerts.byType.length > 0 ? "64748b" : "10b981",
                size: 18,
              }),
            ],
          }),

          // --- 3. TOP OUTLIERS ---
          new Paragraph({
            text: "Primary Device Outliers (Action Required)",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 100 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                tableHeader: true,
                children: [
                  "Device Hostname",
                  "Group",
                  "Health Score",
                  "Primary Issues",
                ].map(
                  (text) =>
                    new TableCell({
                      children: [new Paragraph({ text, bold: true })],
                      shading: { fill: "f1f5f9" },
                    }),
                ),
              }),
              ...summary.devices.outliers.slice(0, 3).map(
                (d) =>
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [
                          new Paragraph({ text: d.hostname, color: "f43f5e" }),
                        ],
                      }),
                      new TableCell({
                        children: [new Paragraph({ text: d.group })],
                      }),
                      new TableCell({
                        children: [
                          new Paragraph({
                            text: `${d.health}%`,
                            bold: true,
                            color: "f43f5e",
                          }),
                        ],
                      }),
                      new TableCell({
                        children: [
                          new Paragraph({
                            text:
                              d.issues.slice(0, 2).join(", ") ||
                              "No specific issues",
                          }),
                        ],
                      }),
                    ],
                  }),
              ),
            ],
          }),

          // --- 4. EXECUTIVE SUMMARY (BOTTOM OF PAGE 1) ---
          new Paragraph({
            text: "Executive Summary Status",
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 600, after: 400 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: BorderStyle.NONE,
            rows: [
              new TableRow({
                children: [
                  {
                    label: "Avg Fleet Health",
                    value: `${summary.averages.health}%`,
                    color: "10b981",
                  },
                  {
                    label: "Online Units",
                    value: `${summary.totals.online} / ${summary.totals.total}`,
                    color: "3b82f6",
                  },
                  {
                    label: "Critical Alerts",
                    value: String(summary.alerts.critical),
                    color: "f43f5e",
                  },
                ].map(
                  (card) =>
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: card.label,
                              size: 16,
                              color: "64748b",
                              bold: true,
                            }),
                          ],
                        }),
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: card.value,
                              size: 36,
                              color: card.color,
                              bold: true,
                            }),
                          ],
                        }),
                      ],
                      shading: { fill: "f8fafc" },
                      margins: { top: 200, bottom: 200, left: 200, right: 200 },
                    }),
                ),
              }),
            ],
          }),

          // --- PAGE 2: TREND ANALYSIS ---
          new Paragraph({
            text: "Performance Trend Analysis",
            heading: HeadingLevel.HEADING_1,
            pageBreakBefore: true,
            spacing: { before: 400, after: 400 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Historical analysis of fleet performance over the ${summary.range.label} period.`,
                italics: true,
                color: "64748b",
              }),
            ],
            spacing: { after: 400 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Fleet Health & Stability",
                bold: true,
                size: 24,
              }),
            ],
            spacing: { before: 200, after: 100 },
          }),
          new Paragraph({
            children: [
              new ImageRun({
                data: healthChart,
                transformation: { width: 600, height: 300 },
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Resource Load Analysis",
                bold: true,
                size: 24,
              }),
            ],
            spacing: { before: 400, after: 100 },
          }),
          new Paragraph({
            children: [
              new ImageRun({
                data: loadChart,
                transformation: { width: 600, height: 300 },
              }),
            ],
            alignment: AlignmentType.CENTER,
          }),

          // --- PAGE 3: TECHNICAL TABLES ---
          new Paragraph({
            text: "Device Performance Details",
            heading: HeadingLevel.HEADING_1,
            pageBreakBefore: true,
            spacing: { before: 400, after: 400 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                tableHeader: true,
                children: [
                  "Hostname",
                  "Group",
                  "Health",
                  "CPU",
                  "RAM",
                  "Processor",
                ].map(
                  (text) =>
                    new TableCell({
                      children: [
                        new Paragraph({ text, bold: true, color: "ffffff" }),
                      ],
                      shading: { fill: "1e293b" },
                      verticalAlign: VerticalAlign.CENTER,
                    }),
                ),
              }),
              ...summary.devices.rows.map(
                (d) =>
                  new TableRow({
                    children: [
                      d.hostname,
                      d.group,
                      `${d.health}%`,
                      `${d.metrics.cpu || 0}%`,
                      `${d.metrics.ram || 0}%`,
                      d.specs?.cpu || "Unknown",
                    ].map(
                      (text) =>
                        new TableCell({
                          children: [
                            new Paragraph({ text: String(text), size: 18 }),
                          ],
                        }),
                    ),
                  }),
              ),
            ],
          }),

          new Paragraph({
            text: "Peripheral Security & Inventory",
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 800, after: 400 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                tableHeader: true,
                children: [
                  "Hostname",
                  "Total Items",
                  "Connected",
                  "Missing Status",
                ].map(
                  (text) =>
                    new TableCell({
                      children: [new Paragraph({ text, bold: true })],
                      shading: { fill: "f1f5f9" },
                    }),
                ),
              }),
              ...(summary.peripherals?.byDevice || []).map(
                (d) =>
                  new TableRow({
                    children: [
                      d.hostname,
                      String(d.total),
                      String(d.connected),
                      {
                        text: d.missing > 0 ? `${d.missing} MISSING` : "SECURE",
                        color: d.missing > 0 ? "f43f5e" : "10b981",
                      },
                    ].map(
                      (cell) =>
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text:
                                    typeof cell === "string" ? cell : cell.text,
                                  bold: typeof cell !== "string",
                                  color:
                                    typeof cell !== "string"
                                      ? cell.color
                                      : undefined,
                                  size: 18,
                                }),
                              ],
                            }),
                          ],
                        }),
                    ),
                  }),
              ),
            ],
          }),
        ],
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
