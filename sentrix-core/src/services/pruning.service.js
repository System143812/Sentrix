import pool from "../lib/database.js";
import { log } from "../utils/logger.utils.js";

/**
 * Background service to prune old snapshot data.
 * This keeps the database lean without causing deadlocks during ingestion.
 */
export function startPruningService(intervalMs = 5 * 60 * 1000) {
  log(`[PRUNER] Service started. Running every ${intervalMs / 1000}s`);

  setInterval(async () => {
    try {
      // 1. High-frequency Snapshot Cleanup
      // We keep data from the last 2 minutes for real-time dashboard views.
      const snapshotThreshold = Date.now() - (2 * 60 * 1000);
      
      // 2. Hardware History Cleanup
      // Hardware changes rarely, but we keep 10 mins of history to ensure we never 
      // prune the "latest" while it's being fetched.
      const hardwareThreshold = Date.now() - (10 * 60 * 1000);

      // 3. Metrics History Cleanup
      // We keep 24 hours of high-resolution metric samples.
      const historyLimit = Number(process.env.METRICS_HISTORY_LIMIT || 1440);
      const metricsThreshold = Date.now() - (historyLimit * 60 * 1000);

      log(`[PRUNER] Running background cleanup sweep...`);

      const results = await Promise.all([
        // Snapshots
        pool.query("DELETE FROM client_processes WHERE recorded_at < ?", [snapshotThreshold]),
        pool.query("DELETE FROM client_network_connections WHERE recorded_at < ?", [snapshotThreshold]),
        pool.query("DELETE FROM client_dns_logs WHERE recorded_at < ?", [snapshotThreshold]),
        
        // Hardware Child Tables (Write-Only History)
        pool.query("DELETE FROM client_hardware_disks WHERE updated_at < ?", [hardwareThreshold]),
        pool.query("DELETE FROM client_network_adapters WHERE updated_at < ?", [hardwareThreshold]),
        pool.query("DELETE FROM client_usb_devices WHERE updated_at < ?", [hardwareThreshold]),
        pool.query("DELETE FROM client_graphics_cards WHERE updated_at < ?", [hardwareThreshold]),
        pool.query("DELETE FROM client_displays WHERE updated_at < ?", [hardwareThreshold]),

        // Metric Samples (Cascade will handle children)
        pool.query("DELETE FROM client_metric_samples WHERE recorded_at < ?", [metricsThreshold])
      ]);

      const deletedCount = results.reduce((sum, [res]) => sum + (res.affectedRows || 0), 0);
      
      if (deletedCount > 0) {
        log(`[PRUNER] Cleanup complete. Removed ${deletedCount} redundant rows across all telemetry tables.`);
      }
    } catch (error) {
      log(`[PRUNER] Error during background pruning: ${error.message}`);
    }
  }, intervalMs);
}
