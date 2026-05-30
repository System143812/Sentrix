import pool from "../lib/database.js";

const DEFAULT_TELEMETRY = {
  intervalMs: Number(process.env.METRICS_INTERVAL_MS || 5000),
};

const DEFAULT_PRUNING = {
  enabled: true,
  intervalMinutes: 5,
  retentionDays: {
    telemetry: 7,
    metrics: 30,
    hardware: 14,
    audit: 90,
  },
};

const DEFAULT_UTILITIES = {
  enabledIds: [
    "network-reset",
    "system-purge",
    "time-sync",
    "workspace-reset",
    "broadcast-message",
  ],
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

export async function getPruningSettings() {
  const [[row]] = await pool.query(
    "SELECT setting_value, updated_at FROM system_settings WHERE setting_key = 'pruning' LIMIT 1",
  );

  const value = parseSetting(row?.setting_value, DEFAULT_PRUNING);
  return {
    ...DEFAULT_PRUNING,
    ...value,
    updatedAt: row?.updated_at || null,
  };
}

export async function updatePruningSettings({ settings, userId = null }) {
  const now = Date.now();
  const value = {
    enabled: settings.enabled ?? DEFAULT_PRUNING.enabled,
    intervalMinutes: Math.max(1, Number(settings.intervalMinutes) || DEFAULT_PRUNING.intervalMinutes),
    retentionDays: {
      ...DEFAULT_PRUNING.retentionDays,
      ...settings.retentionDays,
    },
  };

  await pool.query(
    `
    INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
    VALUES ('pruning', ?, ?, ?)
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

export async function recordPruningRun() {
  const now = Date.now();
  await pool.query(
    `
    UPDATE system_settings 
    SET updated_at = ? 
    WHERE setting_key = 'pruning'
    `,
    [now],
  );
}

export async function getUtilitySettings() {
  const [[row]] = await pool.query(
    "SELECT setting_value, updated_at FROM system_settings WHERE setting_key = 'utilities' LIMIT 1",
  );

  const value = parseSetting(row?.setting_value, DEFAULT_UTILITIES);
  return {
    ...DEFAULT_UTILITIES,
    ...value,
    updatedAt: row?.updated_at || null,
  };
}

export async function updateUtilitySettings({ enabledIds, userId = null }) {
  const now = Date.now();
  const value = { enabledIds: Array.isArray(enabledIds) ? enabledIds : [] };

  await pool.query(
    `
    INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
    VALUES ('utilities', ?, ?, ?)
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

