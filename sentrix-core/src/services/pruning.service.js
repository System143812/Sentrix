import pool from "../lib/database.js";
import { log } from "../utils/logger.utils.js";
import { withDeadlockRetry } from "../utils/db.utils.js";
import { getPruningSettings, recordPruningRun } from "./settings.service.js";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const configuredBatchSize = Number(process.env.PRUNE_BATCH_SIZE || 500);
const PRUNE_BATCH_SIZE = Number.isFinite(configuredBatchSize)
  ? Math.max(1, Math.floor(configuredBatchSize))
  : 500;

async function pruneTableByTimestamp(table, column, threshold) {
  try {
    const [result] = await pool.query(
      `
      DELETE FROM ${table}
      WHERE ${column} < ?
      ORDER BY ${column} ASC
      LIMIT ${PRUNE_BATCH_SIZE}
      `,
      [threshold],
    );

    return result.affectedRows || 0;
  } catch (error) {
    log(`[PRUNER] Error pruning ${table}: ${error.message}`);
    return 0;
  }
}

/**
 * Aggressive TTL pruning for live connections to keep the table size small and reactive.
 */
export async function pruneLiveConnections() {
  const threshold = Date.now() - 90000; // 90 second grace period
  try {
    const [result] = await pool.query(
      `DELETE FROM client_network_connections WHERE recorded_at < ?`,
      [threshold],
    );
    return result.affectedRows || 0;
  } catch (error) {
    log(`[PRUNER] Error during live pruning: ${error.message}`);
    return 0;
  }
}

/**
 * Executes a single pruning sweep across all configured tables.
 */
export async function runPruneSweep() {
  const settings = await getPruningSettings();
  if (!settings.enabled) {
    log(`[PRUNER] Pruning is disabled in settings. Skipping sweep.`);
    return 0;
  }

  const now = Date.now();
  const msInDay = 24 * 60 * 60 * 1000;

  const telemetryThreshold = now - (settings.retentionDays.telemetry * msInDay);
  const metricsThreshold = now - (settings.retentionDays.metrics * msInDay);
  const hardwareThreshold = now - (settings.retentionDays.hardware * msInDay);
  const auditThreshold = now - (settings.retentionDays.audit * msInDay);

  log(`[PRUNER] Running manual/scheduled cleanup sweep...`);

  const deletedCount = await withDeadlockRetry(async () => {
    const jobs = [
      ["client_processes", "recorded_at", settings.retentionDays.telemetry, telemetryThreshold],
      ["client_network_connections", "recorded_at", settings.retentionDays.telemetry, telemetryThreshold],
      ["client_dns_logs", "recorded_at", settings.retentionDays.telemetry, telemetryThreshold],
      ["client_metric_samples", "recorded_at", settings.retentionDays.metrics, metricsThreshold],
      ["client_hardware_disks", "updated_at", settings.retentionDays.hardware, hardwareThreshold],
      ["client_network_adapters", "updated_at", settings.retentionDays.hardware, hardwareThreshold],
      ["client_usb_devices", "updated_at", settings.retentionDays.hardware, hardwareThreshold],
      ["client_graphics_cards", "updated_at", settings.retentionDays.hardware, hardwareThreshold],
      ["client_displays", "updated_at", settings.retentionDays.hardware, hardwareThreshold],
      ["audit_logs", "created_at", settings.retentionDays.audit, auditThreshold],
      ["security_incidents", "created_at", settings.retentionDays.telemetry, telemetryThreshold],
    ];

    let total = 0;
    for (const [table, column, days, threshold] of jobs) {
      if (days > 0) {
        total += await pruneTableByTimestamp(table, column, threshold);
      }
    }
    
    // Record the successful run
    await recordPruningRun();
    
    return total;
  });

  return deletedCount;
}

let pruningTimer = null;
let livePruningTimer = null;

/**
 * Background service to prune old snapshot data.
 */
export function startPruningService() {
  if (pruningTimer) {
    clearInterval(pruningTimer);
    pruningTimer = null;
  }
  if (livePruningTimer) {
    clearInterval(livePruningTimer);
    livePruningTimer = null;
  }

  // Live Pruning: Every 60 seconds
  livePruningTimer = setInterval(async () => {
    await pruneLiveConnections();
  }, 60000);

  getPruningSettings().then((settings) => {
    const intervalMs = settings.intervalMinutes * 60 * 1000;
    log(`[PRUNER] Service started. Running every ${settings.intervalMinutes}m`);

    pruningTimer = setInterval(async () => {
      try {
        const deletedCount = await runPruneSweep();
        if (deletedCount > 0) {
          log(`[PRUNER] Cleanup complete. Removed ${deletedCount} rows.`);
        }
      } catch (error) {
        log(`[PRUNER] Error during background pruning: ${error.message}`);
      }
    }, intervalMs);
  }).catch(err => {
    log(`[PRUNER] Failed to start service: ${err.message}`);
    // Fallback to default interval if DB is unreachable
    pruningTimer = setInterval(runPruneSweep, DEFAULT_INTERVAL_MS);
  });
}
