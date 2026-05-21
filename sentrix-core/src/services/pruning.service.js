import pool from "../lib/database.js";
import { log } from "../utils/logger.utils.js";
import { withDeadlockRetry } from "../utils/db.utils.js";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const SNAPSHOT_RETENTION_MS = Number(
  process.env.METRICS_SNAPSHOT_RETENTION_MS || 2 * 60 * 1000,
);
const HARDWARE_RETENTION_MS = Number(
  process.env.HARDWARE_SNAPSHOT_RETENTION_MS || 10 * 60 * 1000,
);
const configuredBatchSize = Number(process.env.PRUNE_BATCH_SIZE || 500);
const PRUNE_BATCH_SIZE = Number.isFinite(configuredBatchSize)
  ? Math.max(1, Math.floor(configuredBatchSize))
  : 500;

async function pruneTableByTimestamp(table, column, threshold) {
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
}

/**
 * Background service to prune old snapshot data.
 * This keeps the database lean without causing deadlocks during ingestion.
 */
export function startPruningService(intervalMs = DEFAULT_INTERVAL_MS) {
  log(`[PRUNER] Service started. Running every ${intervalMs / 1000}s`);

  setInterval(async () => {
    try {
      const snapshotThreshold = Date.now() - SNAPSHOT_RETENTION_MS;
      const hardwareThreshold = Date.now() - HARDWARE_RETENTION_MS;
      const historyLimit = Number(process.env.METRICS_HISTORY_LIMIT || 1440);
      const metricsThreshold = Date.now() - (historyLimit * 60 * 1000);

      log(`[PRUNER] Running background cleanup sweep...`);

      const deletedCount = await withDeadlockRetry(async () => {
        const jobs = [
          ["client_processes", "recorded_at", snapshotThreshold],
          ["client_network_connections", "recorded_at", snapshotThreshold],
          ["client_dns_logs", "recorded_at", snapshotThreshold],
          ["client_hardware_disks", "updated_at", hardwareThreshold],
          ["client_network_adapters", "updated_at", hardwareThreshold],
          ["client_usb_devices", "updated_at", hardwareThreshold],
          ["client_graphics_cards", "updated_at", hardwareThreshold],
          ["client_displays", "updated_at", hardwareThreshold],
          ["client_metric_samples", "recorded_at", metricsThreshold],
        ];

        let total = 0;
        for (const [table, column, threshold] of jobs) {
          total += await pruneTableByTimestamp(table, column, threshold);
        }
        return total;
      });
      
      if (deletedCount > 0) {
        log(`[PRUNER] Cleanup complete. Removed ${deletedCount} redundant rows across all telemetry tables.`);
      }
    } catch (error) {
      log(`[PRUNER] Error during background pruning: ${error.message}`);
    }
  }, intervalMs);
}
