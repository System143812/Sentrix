import { getAllClients } from "./client.services.js";
import { getGlobalTrendData } from "./metrics/index.js";
import pool from "../lib/database.js";
import PDFDocument from "pdfkit-table";
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, BorderStyle, VerticalAlign } from "docx";
import { clamp, average, getDeviceLoad, getDeviceIssues, getHealthScore } from "../utils/health.utils.js";


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
      label: buildBucketLabel(start, rangeKey),
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
    uploadBytesPerSec:
      network.uploadBytesPerSec ?? metrics.uploadBytesPerSec,
    downloadBytesPerSec:
      network.downloadBytesPerSec ?? metrics.downloadBytesPerSec,
    latencyMs: network.latencyMs ?? metrics.latencyMs,
    packetLoss: network.packetLoss ?? metrics.packetLoss,
  };
}

function buildTrends(clients, samples, rangeKey) {
  const buckets = createBuckets(rangeKey);
  const clientIds = new Set(clients.map(c => c.id));
  
  const relevantSamples = samples.filter(s => clientIds.has(s.client_id));

  if (relevantSamples.length > 0) {
    relevantSamples.forEach((point) => addPointToBucket(buckets, point));
  } else {
    clients.forEach((client) => {
      addPointToBucket(buckets, buildFallbackPoint(client));
    });
  }

  const result = {};
  const metrics = [
    "cpu", "ram", "disk", "health", "alerts", 
    "cpuTemperature", "gpuTemperature", 
    "uploadBytesPerSec", "downloadBytesPerSec", 
    "latencyMs", "packetLoss"
  ];

  metrics.forEach(m => {
    result[m] = buckets.map((bucket) => ({
      label: bucket.label,
      value: average(bucket.values[m]),
    }));
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
      online: groupClients.filter((client) => client.status === "online").length,
      offline: groupClients.filter((client) => client.status !== "online").length,
      health: average(groupClients.map(getHealthScore)),
      load: average(groupClients.map(getDeviceLoad)),
      cpu: average(groupClients.map((client) => client.metrics?.cpu)),
      ram: average(groupClients.map((client) => client.metrics?.ram)),
      disk: average(groupClients.map((client) => client.metrics?.disk)),
      cpuTemperature: average(groupClients.map((client) => client.metrics?.temperature?.cpu?.temperatureCelsius ?? client.metrics?.cpuTemperature)),
      gpuTemperature: average(groupClients.map((client) => client.metrics?.temperature?.gpu?.temperatureCelsius ?? client.metrics?.gpuTemperature)),
      uploadBytesPerSec: average(groupClients.map((client) => client.metrics?.network?.uploadBytesPerSec ?? client.metrics?.uploadBytesPerSec)),
      downloadBytesPerSec: average(groupClients.map((client) => client.metrics?.network?.downloadBytesPerSec ?? client.metrics?.downloadBytesPerSec)),
      latencyMs: average(groupClients.map((client) => client.metrics?.network?.latencyMs ?? client.metrics?.latencyMs)),
      packetLoss: average(groupClients.map((client) => client.metrics?.network?.packetLoss ?? client.metrics?.packetLoss)),
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
  const clientIds = new Set(clients.map(c => c.id));
  const relevantInventory = inventory.filter(i => clientIds.has(i.client_id));
  
  const byClient = relevantInventory.reduce((acc, item) => {
    if (!acc[item.client_id]) {
      acc[item.client_id] = { connected: 0, missing: 0, total: 0 };
    }
    acc[item.client_id].total++;
    if (item.status === 'connected') acc[item.client_id].connected++;
    else acc[item.client_id].missing++;
    return acc;
  }, {});

  const summaryByGroup = clients.reduce((acc, client) => {
    const group = client.group || "Unassigned";
    if (!acc[group]) {
      acc[group] = { totalDevices: 0, devicesWithMissing: 0, totalPeripherals: 0, missingPeripherals: 0 };
    }
    acc[group].totalDevices++;
    const stats = byClient[client.id] || { connected: 0, missing: 0, total: 0 };
    acc[group].totalPeripherals += stats.total;
    acc[group].missingPeripherals += stats.missing;
    if (stats.missing > 0) acc[group].devicesWithMissing++;
    return acc;
  }, {});

  return {
    totalMissing: relevantInventory.filter(i => i.status === 'missing').length,
    devicesWithMissing: Object.values(byClient).filter(c => c.missing > 0).length,
    groups: Object.entries(summaryByGroup).map(([name, stats]) => ({ name, ...stats })),
    byDevice: clients.map(client => ({
      id: client.id,
      hostname: client.hostname,
      group: client.group || "Unassigned",
      ... (byClient[client.id] || { connected: 0, missing: 0, total: 0 })
    })).filter(d => d.total > 0)
  };
}

export async function getAnalyticsSummary(options = {}) {
  const rangeKey = options.range || "24h";
  const allClients = await getAllClients();
  const clients = filterClients(allClients, options.group);
  const deviceRows = buildDeviceRows(clients);
  const alerts = countAlerts(clients);
  
  const [inventory] = await pool.query("SELECT * FROM client_peripheral_inventory");
  const peripheralSummary = buildPeripheralSummary(clients, inventory);

  const range = getRange(rangeKey);
  const rangeStartMs = Date.now() - range.durationMs;
  const samples = await getGlobalTrendData(rangeStartMs);
  const trends = buildTrends(clients, samples, rangeKey);

  const hasCpuTemperature = clients.some((client) => client.metrics?.temperature?.cpu?.temperatureCelsius != null || client.metrics?.cpuTemperature != null);
  const hasGpuTemperature = clients.some((client) => client.metrics?.temperature?.gpu?.temperatureCelsius != null || client.metrics?.gpuTemperature != null);
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
      cpu: average(clients.map((client) => client.metrics?.cpu)),
      ram: average(clients.map((client) => client.metrics?.ram)),
      disk: average(clients.map((client) => client.metrics?.disk)),
      uptime: average(clients.map((client) => client.metrics?.uptime)),
      load: average(clients.map(getDeviceLoad)),
      health: average(clients.map(getHealthScore)),
      cpuTemperature: average(clients.map((client) => client.metrics?.temperature?.cpu?.temperatureCelsius ?? client.metrics?.cpuTemperature)),
      gpuTemperature: average(clients.map((client) => client.metrics?.temperature?.gpu?.temperatureCelsius ?? client.metrics?.gpuTemperature)),
      uploadBytesPerSec: average(clients.map((client) => client.metrics?.network?.uploadBytesPerSec ?? client.metrics?.uploadBytesPerSec)),
      downloadBytesPerSec: average(clients.map((client) => client.metrics?.network?.downloadBytesPerSec ?? client.metrics?.downloadBytesPerSec)),
      latencyMs: average(clients.map((client) => client.metrics?.network?.latencyMs ?? client.metrics?.latencyMs)),
      packetLoss: average(clients.map((client) => client.metrics?.network?.packetLoss ?? client.metrics?.packetLoss)),
    },
    alerts,
    trends,
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
        .sort((first, second) => (second.lastSeenAt || 0) - (first.lastSeenAt || 0))
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
        ...(hasNetwork ? [
          "uploadBytesPerSec",
          "downloadBytesPerSec",
          "latencyMs",
          "packetLoss",
        ] : []),
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
    "Active Issues",
    "Last Seen",
    "Export Range",
    "Generated At",
  ];

  const rows = summary.devices.rows.map((device) => {
    const metrics = device.metrics || {};
    const network = metrics.network || {};
    const temperature = metrics.temperature || {};

    return [
      "Device Metrics",
      device.id,
      device.hostname,
      device.group,
      device.status,
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
      device.issues.join("; "),
      device.lastSeenAt ? new Date(Number(device.lastSeenAt)).toISOString() : "",
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
  const doc = new PDFDocument({ margin: 30, size: "A4" });
  
  const buffers = [];
  doc.on("data", (chunk) => buffers.push(chunk));
  
  return new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));

    // Header
    doc.fillColor("#1e293b").fontSize(20).text("Sentrix Lab Analytics Report", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor("#64748b").text(`Generated on ${new Date(Number(summary.generatedAt)).toLocaleString()}`, { align: "center" });
    doc.text(`Range: ${summary.range.label} | Group: ${summary.filters.group}`, { align: "center" });
    doc.moveDown(2);

    // Summary Cards
    doc.fillColor("#0f172a").fontSize(14).text("System Overview", { underline: true });
    doc.moveDown(1);
    
    const cardWidth = 160;
    const startX = 30;
    const startY = doc.y;

    // Total Devices Card
    doc.rect(startX, startY, cardWidth, 60).fillAndStroke("#f8fafc", "#e2e8f0");
    doc.fillColor("#64748b").fontSize(8).text("TOTAL DEVICES", startX + 10, startY + 10);
    doc.fillColor("#0f172a").fontSize(18).text(String(summary.totals.total), startX + 10, startY + 25);

    // Health Card
    doc.rect(startX + cardWidth + 15, startY, cardWidth, 60).fillAndStroke("#f0fdf4", "#dcfce7");
    doc.fillColor("#166534").fontSize(8).text("AVG HEALTH SCORE", startX + cardWidth + 25, startY + 10);
    doc.fillColor("#14532d").fontSize(18).text(`${summary.averages.health}%`, startX + cardWidth + 25, startY + 25);

    // Alerts Card
    doc.rect(startX + (cardWidth + 15) * 2, startY, cardWidth, 60).fillAndStroke("#fef2f2", "#fee2e2");
    doc.fillColor("#991b1b").fontSize(8).text("CRITICAL ALERTS", startX + (cardWidth + 15) * 2 + 10, startY + 10);
    doc.fillColor("#7f1d1d").fontSize(18).text(String(summary.alerts.critical), startX + (cardWidth + 15) * 2 + 10, startY + 25);

    doc.moveDown(5);

    // Device Table
    const deviceTable = {
      title: "Device Performance Details",
      headers: ["Hostname", "Group", "Status", "Health", "Load", "CPU", "RAM"],
      rows: summary.devices.rows.map(d => [
        d.hostname,
        d.group,
        d.status,
        `${d.health}%`,
        `${d.load}%`,
        `${d.metrics.cpu || 0}%`,
        `${d.metrics.ram || 0}%`
      ])
    };

    doc.table(deviceTable, {
      prepareHeader: () => doc.font("Helvetica-Bold").fontSize(9).fillColor("#1e293b"),
      prepareRow: (row, index, column, rect, rectRow, rectCell) => {
        doc.font("Helvetica").fontSize(8).fillColor("#334155");
      },
      width: 535,
    });

    doc.moveDown(2);

    // Group Summary Table
    const groupTable = {
      title: "Group Summary",
      headers: ["Group Name", "Units", "Online", "Offline", "Avg Health", "Avg Load"],
      rows: summary.groups.map(g => [
        g.name,
        String(g.count),
        String(g.online),
        String(g.offline),
        `${g.health}%`,
        `${g.load}%`
      ])
    };

    doc.table(groupTable, {
      prepareHeader: () => doc.font("Helvetica-Bold").fontSize(9).fillColor("#1e293b"),
      prepareRow: () => doc.font("Helvetica").fontSize(8).fillColor("#334155"),
      width: 535,
    });

    doc.addPage();
    doc.fillColor("#0f172a").fontSize(14).text("Peripheral Inventory Status", { underline: true });
    doc.moveDown(1);

    const peripheralTable = {
      title: "Device Peripheral Details",
      headers: ["Hostname", "Group", "Total Items", "Connected", "Missing"],
      rows: (summary.peripherals?.byDevice || []).map(d => [
        d.hostname,
        d.group,
        String(d.total),
        String(d.connected),
        String(d.missing)
      ])
    };

    doc.table(peripheralTable, {
      prepareHeader: () => doc.font("Helvetica-Bold").fontSize(9).fillColor("#1e293b"),
      prepareRow: () => doc.font("Helvetica").fontSize(8).fillColor("#334155"),
      width: 535,
    });

    doc.end();
  });
}

export async function getAnalyticsDocx(options = {}) {
  const summary = await getAnalyticsSummary(options);
  
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          text: "Sentrix Lab Analytics Report",
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `Generated on: ${new Date(Number(summary.generatedAt)).toLocaleString()}`,
              color: "64748b",
            }),
          ],
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `Range: ${summary.range.label} | Group: ${summary.filters.group}`,
              color: "64748b",
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        }),

        new Paragraph({
          text: "System Overview",
          heading: HeadingLevel.HEADING_1,
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `Total Registered Devices: `, bold: true }),
            new TextRun(`${summary.totals.total}`),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `Average Fleet Health: `, bold: true }),
            new TextRun(`${summary.averages.health}%`),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `Active Critical Alerts: `, bold: true }),
            new TextRun(`${summary.alerts.critical}`),
          ],
          spacing: { after: 400 },
        }),

        new Paragraph({
          text: "Device Performance Details",
          heading: HeadingLevel.HEADING_2,
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: ["Hostname", "Group", "Status", "Health", "Load", "CPU", "RAM"].map(text => 
                new TableCell({
                  children: [new Paragraph({ text, bold: true })],
                  shading: { fill: "f8fafc" },
                  verticalAlign: VerticalAlign.CENTER,
                })
              ),
            }),
            ...summary.devices.rows.map(d => 
              new TableRow({
                children: [
                  d.hostname, d.group, d.status, 
                  `${d.health}%`, `${d.load}%`, 
                  `${d.metrics.cpu || 0}%`, `${d.metrics.ram || 0}%`
                ].map(text => 
                  new TableCell({
                    children: [new Paragraph({ text: String(text) })],
                  })
                ),
              })
            ),
          ],
        }),

        new Paragraph({
          text: "Group Summary",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400 },
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: ["Group Name", "Units", "Online", "Offline", "Avg Health", "Avg Load"].map(text => 
                new TableCell({
                  children: [new Paragraph({ text, bold: true })],
                  shading: { fill: "f8fafc" },
                })
              ),
            }),
            ...summary.groups.map(g => 
              new TableRow({
                children: [
                  g.name, String(g.count), String(g.online), String(g.offline), 
                  `${g.health}%`, `${g.load}%`
                ].map(text => 
                  new TableCell({
                    children: [new Paragraph({ text: String(text) })],
                  })
                ),
              })
            ),
          ],
        }),

        new Paragraph({
          text: "Peripheral Inventory Status",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400 },
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: ["Hostname", "Group", "Total Items", "Connected", "Missing"].map(text => 
                new TableCell({
                  children: [new Paragraph({ text, bold: true })],
                  shading: { fill: "f8fafc" },
                })
              ),
            }),
            ...(summary.peripherals?.byDevice || []).map(d => 
              new TableRow({
                children: [
                  d.hostname, d.group, String(d.total), String(d.connected), String(d.missing)
                ].map(text => 
                  new TableCell({
                    children: [new Paragraph({ text: String(text) })],
                  })
                ),
              })
            ),
          ],
        }),
      ],
    }],
  });

  return await Packer.toBuffer(doc);
}
