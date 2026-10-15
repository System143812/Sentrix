function toNumber(value, fallback = null) {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getNestedMetric(metrics = {}, path = []) {
  return path.reduce((current, key) => current?.[key], metrics);
}

export function normalizeMetrics(metrics = {}) {
  const system = metrics.system || {};
  const network = metrics.network || {};
  const temperature = metrics.temperature || {};
  const cpu = system.cpu || {};
  const memory = system.memory || {};
  const disk = system.disk || {};

  return {
    schemaVersion: toNumber(metrics.schemaVersion, 2),
    timestamp: toNumber(metrics.timestamp, Date.now()),
    lastUpdatedAt: toNumber(metrics.lastUpdatedAt, metrics.timestamp || Date.now()),
    cpu: toNumber(cpu.usage, null),
    ram: toNumber(memory.usage, null),
    disk: toNumber(disk.usage, null),
    uptime: toNumber(system.uptimeSeconds, 0),
    system,
    network: {
      interface: network.interface || "Unknown",
      uploadBytesPerSec: toNumber(network.uploadBytesPerSec),
      downloadBytesPerSec: toNumber(network.downloadBytesPerSec),
      latencyMs: toNumber(network.latencyMs),
      packetLoss: toNumber(network.packetLoss),
    },
    temperature: {
      cpu: {
        temperatureCelsius: toNumber(
          getNestedMetric(temperature, ["cpu", "temperatureCelsius"]),
        ),
      },
      gpu: {
        model: getNestedMetric(temperature, ["gpu", "model"]) || "Unknown",
        temperatureCelsius: toNumber(
          getNestedMetric(temperature, ["gpu", "temperatureCelsius"]),
        ),
      },
    },
    processes: Array.isArray(metrics.processes) ? metrics.processes : [],
    networkActivity: metrics.networkActivity || { activeConnections: [], dnsCache: [] },
  };
}

export function buildHistoryPoint(metrics = {}, timestamp = Date.now()) {
  const normalized = normalizeMetrics(metrics);

  return {
    timestamp,
    cpu: normalized.cpu,
    ram: normalized.ram,
    disk: normalized.disk,
    uptime: normalized.uptime,
    cpuTemperature: normalized.temperature.cpu.temperatureCelsius,
    gpuTemperature: normalized.temperature.gpu.temperatureCelsius,
    uploadBytesPerSec: normalized.network.uploadBytesPerSec,
    downloadBytesPerSec: normalized.network.downloadBytesPerSec,
    latencyMs: normalized.network.latencyMs,
    packetLoss: normalized.network.packetLoss,
  };
}
