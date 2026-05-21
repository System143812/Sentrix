import pool from "../../lib/database.js";
import { toNumber, parseJson } from "../../utils/db.utils.js";

const MAX_HISTORY_POINTS = Number(process.env.METRICS_HISTORY_LIMIT || 1440);

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

export async function getClientMetricHistory(clientId, options = {}) {
  const range = options.range || "24h";
  const limit = Math.min(Number(options.limit) || MAX_HISTORY_POINTS, MAX_HISTORY_POINTS);
  
  const durations = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };
  const rangeStart = Date.now() - (durations[range] || durations["24h"]);

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
