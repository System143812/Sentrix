import {
  average,
  maxValue,
  getDeviceLoad,
  getDeviceIssues,
  getHealthScore,
} from "../../utils/health.utils.js";

// --- Bucket & Trend Logic ---

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

export function getRange(rangeKey = "24h") {
  return ranges[rangeKey] || ranges["24h"];
}

export function buildBucketLabel(timestamp, rangeKey, isLast = false) {
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

export function createBuckets(rangeKey, now = Date.now()) {
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

export function addPointToBucket(buckets, point, fillAll = false) {
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

export function buildFallbackPoint(client) {
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

export function buildTrends(clients, samples, rangeKey) {
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

export function buildDeviceTrends(clients, samples, rangeKey) {
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
