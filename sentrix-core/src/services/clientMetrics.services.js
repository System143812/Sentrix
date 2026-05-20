import pool from "../lib/database.js";

const HISTORY_SAMPLE_INTERVAL_MS = Number(
  process.env.METRICS_HISTORY_SAMPLE_INTERVAL_MS || 60000,
);
const MAX_HISTORY_POINTS = Number(process.env.METRICS_HISTORY_LIMIT || 1440);

function toNumber(value, fallback = null) {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toJson(value) {
  return JSON.stringify(value ?? null);
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
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
    cpu: toNumber(cpu.usage, 0),
    ram: toNumber(memory.usage, 0),
    disk: toNumber(disk.usage, 0),
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

export function appendMetricsHistory(currentHistory = [], metrics = {}, timestamp = Date.now()) {
  const history = Array.isArray(currentHistory) ? currentHistory : [];
  const lastPoint = history[history.length - 1];

  if (
    lastPoint &&
    timestamp - Number(lastPoint.timestamp || 0) < HISTORY_SAMPLE_INTERVAL_MS
  ) {
    return history;
  }

  return [...history, buildHistoryPoint(metrics, timestamp)].slice(
    -MAX_HISTORY_POINTS,
  );
}

async function shouldStoreSample(clientId, timestamp) {
  const [[latestSample]] = await pool.query(
    `
    SELECT recorded_at
    FROM client_metric_samples
    WHERE client_id = ?
    ORDER BY recorded_at DESC
    LIMIT 1
    `,
    [clientId],
  );

  return (
    !latestSample ||
    timestamp - Number(latestSample.recorded_at || 0) >= HISTORY_SAMPLE_INTERVAL_MS
  );
}

async function pruneOldSamples(clientId) {
  await pool.query(
    `
    DELETE FROM client_metric_samples
    WHERE client_id = ?
      AND id NOT IN (
        SELECT id FROM (
          SELECT id
          FROM client_metric_samples
          WHERE client_id = ?
          ORDER BY recorded_at DESC
          LIMIT ?
        ) recent_samples
      )
    `,
    [clientId, clientId, MAX_HISTORY_POINTS],
  );
}

export async function saveMetricSample(clientId, metrics = {}, timestamp = Date.now()) {
  if (!(await shouldStoreSample(clientId, timestamp))) {
    return null;
  }

  const normalized = normalizeMetrics(metrics);
  const recordedAt = timestamp;
  const createdAt = Date.now();

  const [sampleResult] = await pool.query(
    `
    INSERT INTO client_metric_samples
      (client_id, schema_version, recorded_at, cpu_usage, ram_usage, disk_usage, uptime_seconds, raw_metrics, created_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      clientId,
      normalized.schemaVersion,
      recordedAt,
      normalized.cpu,
      normalized.ram,
      normalized.disk,
      normalized.uptime,
      toJson(metrics),
      createdAt,
    ],
  );

  const sampleId = sampleResult.insertId;
  const cpu = normalized.system.cpu || {};
  const memory = normalized.system.memory || {};
  const disk = normalized.system.disk || {};
  const os = normalized.system.os || {};
  const network = normalized.network;
  const temperature = normalized.temperature;

  await pool.query(
    `
    INSERT INTO client_metric_cpu_samples (sample_id, usage_percent)
    VALUES (?, ?)
    `,
    [sampleId, normalized.cpu],
  );

  await pool.query(
    `
    INSERT INTO client_metric_memory_samples
      (sample_id, usage_percent, total_bytes, used_bytes, available_bytes)
    VALUES
      (?, ?, ?, ?, ?)
    `,
    [
      sampleId,
      normalized.ram,
      toNumber(memory.totalBytes),
      toNumber(memory.usedBytes),
      toNumber(memory.availableBytes),
    ],
  );

  await pool.query(
    `
    INSERT INTO client_metric_disk_samples
      (sample_id, usage_percent, total_bytes, used_bytes, free_bytes, mount, filesystem)
    VALUES
      (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      sampleId,
      normalized.disk,
      toNumber(disk.totalBytes),
      toNumber(disk.usedBytes),
      toNumber(disk.freeBytes),
      disk.mount || null,
      disk.filesystem || null,
    ],
  );

  await pool.query(
    `
    INSERT INTO client_metric_network_samples
      (sample_id, interface_name, upload_bytes_per_sec, download_bytes_per_sec, latency_ms, packet_loss)
    VALUES
      (?, ?, ?, ?, ?, ?)
    `,
    [
      sampleId,
      network.interface,
      network.uploadBytesPerSec,
      network.downloadBytesPerSec,
      network.latencyMs,
      network.packetLoss,
    ],
  );

  await pool.query(
    `
    INSERT INTO client_metric_temperature_samples
      (sample_id, cpu_temperature_celsius, gpu_model, gpu_temperature_celsius)
    VALUES
      (?, ?, ?, ?)
    `,
    [
      sampleId,
      temperature.cpu.temperatureCelsius,
      temperature.gpu.model,
      temperature.gpu.temperatureCelsius,
    ],
  );

  await pool.query(
    `
    INSERT INTO client_metric_system_samples
      (sample_id, uptime_seconds, os_platform, os_release)
    VALUES
      (?, ?, ?, ?)
    `,
    [sampleId, normalized.uptime, os.platform || null, os.release || null],
  );

  await pruneOldSamples(clientId);

  return sampleId;
}

async function replaceChildRows(tableName, clientId, rows, insertSql, mapRow) {
  await pool.query(`DELETE FROM ${tableName} WHERE client_id = ?`, [clientId]);

  for (const row of rows) {
    await pool.query(insertSql, mapRow(row));
  }
}

export async function saveHardwareDetails(clientId, details = {}) {
  if (!details || typeof details !== "object") return;

  const specs = details.specs || {};
  const peripherals = details.peripherals || {};
  const now = Date.now();

  await pool.query(
    `
    INSERT INTO client_hardware_profiles
      (client_id, manufacturer, model, serial, bios, baseboard, cpu_model, cpu_cores, cpu_threads, total_memory_gb, memory_slots, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      manufacturer = VALUES(manufacturer),
      model = VALUES(model),
      serial = VALUES(serial),
      bios = VALUES(bios),
      baseboard = VALUES(baseboard),
      cpu_model = VALUES(cpu_model),
      cpu_cores = VALUES(cpu_cores),
      cpu_threads = VALUES(cpu_threads),
      total_memory_gb = VALUES(total_memory_gb),
      memory_slots = VALUES(memory_slots),
      updated_at = VALUES(updated_at)
    `,
    [
      clientId,
      specs.manufacturer || null,
      specs.model || null,
      specs.serial || null,
      specs.bios || null,
      specs.baseboard || null,
      specs.cpu || null,
      toNumber(specs.cpuCores),
      toNumber(specs.cpuThreads),
      toNumber(specs.totalMemoryGb),
      toNumber(specs.memorySlots),
      now,
    ],
  );

  await pool.query(
    `
    INSERT INTO client_peripherals
      (client_id, mouse, keyboard, wifi_dongle, bluetooth_dongle, webcam, storage, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      mouse = VALUES(mouse),
      keyboard = VALUES(keyboard),
      wifi_dongle = VALUES(wifi_dongle),
      bluetooth_dongle = VALUES(bluetooth_dongle),
      webcam = VALUES(webcam),
      storage = VALUES(storage),
      updated_at = VALUES(updated_at)
    `,
    [
      clientId,
      Boolean(peripherals.mouse),
      Boolean(peripherals.keyboard),
      Boolean(peripherals.wifiDongle),
      Boolean(peripherals.bluetoothDongle),
      Boolean(peripherals.webcam),
      Boolean(peripherals.storage),
      now,
    ],
  );

  await replaceChildRows(
    "client_hardware_disks",
    clientId,
    Array.isArray(specs.disks) ? specs.disks : [],
    `
    INSERT INTO client_hardware_disks
      (client_id, name, disk_type, size_gb, updated_at)
    VALUES
      (?, ?, ?, ?, ?)
    `,
    (disk) => [
      clientId,
      disk.name || null,
      disk.type || null,
      toNumber(disk.sizeGb),
      now,
    ],
  );

  await replaceChildRows(
    "client_network_adapters",
    clientId,
    Array.isArray(specs.networkAdapters) ? specs.networkAdapters : [],
    `
    INSERT INTO client_network_adapters
      (client_id, name, mac, ip4, adapter_type, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?)
    `,
    (adapter) => [
      clientId,
      adapter.name || null,
      adapter.mac || null,
      adapter.ip4 || null,
      adapter.type || null,
      now,
    ],
  );

  await replaceChildRows(
    "client_usb_devices",
    clientId,
    Array.isArray(details.usbDevices) ? details.usbDevices : [],
    `
    INSERT INTO client_usb_devices
      (client_id, name, device_type, vendor, external_id, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?)
    `,
    (device) => [
      clientId,
      device.name || null,
      device.type || null,
      device.vendor || null,
      device.id || null,
      now,
    ],
  );

  await replaceChildRows(
    "client_graphics_cards",
    clientId,
    Array.isArray(peripherals.graphicsCards) ? peripherals.graphicsCards : [],
    `
    INSERT INTO client_graphics_cards
      (client_id, model, vendor, vram_mb, updated_at)
    VALUES
      (?, ?, ?, ?, ?)
    `,
    (card) => [
      clientId,
      card.model || null,
      card.vendor || null,
      toNumber(card.vram),
      now,
    ],
  );

  await replaceChildRows(
    "client_displays",
    clientId,
    Array.isArray(peripherals.displays) ? peripherals.displays : [],
    `
    INSERT INTO client_displays
      (client_id, model, resolution, updated_at)
    VALUES
      (?, ?, ?, ?)
    `,
    (display) => [
      clientId,
      display.model || null,
      display.resolution || null,
      now,
    ],
  );
}

function buildMetricRow(row) {
  return {
    id: row.id,
    recordedAt: row.recorded_at,
    schemaVersion: row.schema_version,
    cpu: toNumber(row.cpu_usage, 0),
    ram: toNumber(row.ram_usage, 0),
    disk: toNumber(row.disk_usage, 0),
    uptime: toNumber(row.uptime_seconds, 0),
    system: {
      os: {
        platform: row.os_platform,
        release: row.os_release,
      },
    },
    network: {
      interface: row.interface_name,
      uploadBytesPerSec: toNumber(row.upload_bytes_per_sec),
      downloadBytesPerSec: toNumber(row.download_bytes_per_sec),
      latencyMs: toNumber(row.latency_ms),
      packetLoss: toNumber(row.packet_loss),
    },
    temperature: {
      cpu: {
        temperatureCelsius: toNumber(row.cpu_temperature_celsius),
      },
      gpu: {
        model: row.gpu_model,
        temperatureCelsius: toNumber(row.gpu_temperature_celsius),
      },
    },
    rawMetrics: parseJson(row.raw_metrics, null),
  };
}

function getRangeStart(range = "24h") {
  const durations = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };

  return Date.now() - (durations[range] || durations["24h"]);
}

export async function getClientMetricHistory(clientId, options = {}) {
  const range = options.range || "24h";
  const limit = Math.min(Number(options.limit) || MAX_HISTORY_POINTS, MAX_HISTORY_POINTS);
  const rangeStart = getRangeStart(range);

  const [rows] = await pool.query(
    `
    SELECT
      samples.id,
      samples.schema_version,
      samples.recorded_at,
      samples.cpu_usage,
      samples.ram_usage,
      samples.disk_usage,
      samples.uptime_seconds,
      samples.raw_metrics,
      network.interface_name,
      network.upload_bytes_per_sec,
      network.download_bytes_per_sec,
      network.latency_ms,
      network.packet_loss,
      temperature.cpu_temperature_celsius,
      temperature.gpu_model,
      temperature.gpu_temperature_celsius,
      system_sample.os_platform,
      system_sample.os_release
    FROM client_metric_samples samples
    LEFT JOIN client_metric_network_samples network ON network.sample_id = samples.id
    LEFT JOIN client_metric_temperature_samples temperature ON temperature.sample_id = samples.id
    LEFT JOIN client_metric_system_samples system_sample ON system_sample.sample_id = samples.id
    WHERE samples.client_id = ?
      AND samples.recorded_at >= ?
    ORDER BY samples.recorded_at DESC
    LIMIT ?
    `,
    [clientId, rangeStart, limit],
  );

  const history = rows.map(buildMetricRow).reverse();

  return {
    range,
    limit,
    generatedAt: Date.now(),
    latest: history[history.length - 1] || null,
    history,
  };
}

async function getRows(tableName, clientId) {
  const [rows] = await pool.query(
    `SELECT * FROM ${tableName} WHERE client_id = ? ORDER BY id ASC`,
    [clientId],
  );

  return rows;
}

export async function getClientHardware(clientId) {
  const [[profile]] = await pool.query(
    `SELECT * FROM client_hardware_profiles WHERE client_id = ? LIMIT 1`,
    [clientId],
  );
  const [[peripherals]] = await pool.query(
    `SELECT * FROM client_peripherals WHERE client_id = ? LIMIT 1`,
    [clientId],
  );
  const disks = await getRows("client_hardware_disks", clientId);
  const networkAdapters = await getRows("client_network_adapters", clientId);
  const usbDevices = await getRows("client_usb_devices", clientId);
  const graphicsCards = await getRows("client_graphics_cards", clientId);
  const displays = await getRows("client_displays", clientId);

  return {
    profile: profile
      ? {
          manufacturer: profile.manufacturer,
          model: profile.model,
          serial: profile.serial,
          bios: profile.bios,
          baseboard: profile.baseboard,
          cpu: profile.cpu_model,
          cpuCores: profile.cpu_cores,
          cpuThreads: profile.cpu_threads,
          totalMemoryGb: profile.total_memory_gb,
          memorySlots: profile.memory_slots,
          updatedAt: profile.updated_at,
        }
      : null,
    peripherals: peripherals
      ? {
          mouse: Boolean(peripherals.mouse),
          keyboard: Boolean(peripherals.keyboard),
          wifiDongle: Boolean(peripherals.wifi_dongle),
          bluetoothDongle: Boolean(peripherals.bluetooth_dongle),
          webcam: Boolean(peripherals.webcam),
          storage: Boolean(peripherals.storage),
          updatedAt: peripherals.updated_at,
        }
      : null,
    disks: disks.map((disk) => ({
      name: disk.name,
      type: disk.disk_type,
      sizeGb: disk.size_gb,
    })),
    networkAdapters: networkAdapters.map((adapter) => ({
      name: adapter.name,
      mac: adapter.mac,
      ip4: adapter.ip4,
      type: adapter.adapter_type,
    })),
    usbDevices: usbDevices.map((device) => ({
      name: device.name,
      type: device.device_type,
      vendor: device.vendor,
      id: device.external_id,
    })),
    graphicsCards: graphicsCards.map((card) => ({
      model: card.model,
      vendor: card.vendor,
      vram: card.vram_mb,
    })),
    displays: displays.map((display) => ({
      model: display.model,
      resolution: display.resolution,
    })),
  };
}
