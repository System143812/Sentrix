import { SettingsRepository } from "./settings.repository.js";

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
  const row = await SettingsRepository.findByKey("telemetry");
  const value = parseSetting(row?.setting_value, DEFAULT_TELEMETRY);

  return {
    intervalMs: Number(value.intervalMs) || DEFAULT_TELEMETRY.intervalMs,
    updatedAt: row?.updated_at || null,
  };
}

export async function updateTelemetrySettings({ intervalMs, userId = null }) {
  const safeInterval = Math.min(
    Math.max(Number(intervalMs) || 5000, 1000),
    60000,
  );
  const now = Date.now();
  const value = { intervalMs: safeInterval };

  await SettingsRepository.upsert("telemetry", value, userId, now);

  return {
    ...value,
    updatedAt: now,
  };
}

export async function getPruningSettings() {
  const row = await SettingsRepository.findByKey("pruning");
  const value = parseSetting(row?.setting_value, DEFAULT_PRUNING);

  return {
    ...DEFAULT_PRUNING,
    ...value,
    updatedAt: row?.updated_at || null,
  };
}

export async function updatePruningSettings({ settings = {}, userId = null }) {
  const now = Date.now();
  const value = {
    enabled: settings.enabled ?? DEFAULT_PRUNING.enabled,
    intervalMinutes: Math.max(
      1,
      Number(settings.intervalMinutes) || DEFAULT_PRUNING.intervalMinutes,
    ),
    retentionDays: {
      ...DEFAULT_PRUNING.retentionDays,
      ...settings.retentionDays,
    },
  };

  await SettingsRepository.upsert("pruning", value, userId, now);

  return {
    ...value,
    updatedAt: now,
  };
}

export async function recordPruningRun() {
  await SettingsRepository.touch("pruning", Date.now());
}

export async function getUtilitySettings() {
  const row = await SettingsRepository.findByKey("utilities");
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

  await SettingsRepository.upsert("utilities", value, userId, now);

  return {
    ...value,
    updatedAt: now,
  };
}
