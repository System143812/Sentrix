import pool from "../lib/database.js";

const DEFAULT_TELEMETRY = {
  intervalMs: Number(process.env.METRICS_INTERVAL_MS || 5000),
};

function parseSetting(value, fallback) {
  if (!value) return fallback;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function getTelemetrySettings() {
  const [[row]] = await pool.query(
    "SELECT setting_value, updated_at FROM system_settings WHERE setting_key = 'telemetry' LIMIT 1",
  );

  const value = parseSetting(row?.setting_value, DEFAULT_TELEMETRY);
  return {
    intervalMs: Number(value.intervalMs) || DEFAULT_TELEMETRY.intervalMs,
    updatedAt: row?.updated_at || null,
  };
}

export async function updateTelemetrySettings({ intervalMs, userId = null }) {
  const safeInterval = Math.min(Math.max(Number(intervalMs) || 5000, 1000), 60000);
  const now = Date.now();
  const value = { intervalMs: safeInterval };

  await pool.query(
    `
    INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
    VALUES ('telemetry', ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      setting_value = VALUES(setting_value),
      updated_by = VALUES(updated_by),
      updated_at = VALUES(updated_at)
    `,
    [JSON.stringify(value), userId, now],
  );

  return {
    ...value,
    updatedAt: now,
  };
}
