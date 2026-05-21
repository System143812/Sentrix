import pool from "../../lib/database.js";
import {
  normalizeMetrics,
  buildHistoryPoint,
} from "./normalizer.js";
import {
  saveMetricSample,
  saveProcesses,
  saveNetworkActivity,
} from "./repository.js";
import { getSnapshotPersistencePlan } from "./snapshot-buffer.js";

const HISTORY_SAMPLE_INTERVAL_MS = Number(
  process.env.METRICS_HISTORY_SAMPLE_INTERVAL_MS || 60000,
);
const MAX_HISTORY_POINTS = Number(process.env.METRICS_HISTORY_LIMIT || 1440);

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

export async function processIncomingMetrics(clientId, metrics = {}, timestamp = Date.now()) {
  const normalized = normalizeMetrics(metrics);

  const persistence = getSnapshotPersistencePlan(clientId, normalized, timestamp);
  const networkActivity = normalized.networkActivity || {};
  const networkPayload = {
    activeConnections: persistence.networkActivity
      ? networkActivity.activeConnections || []
      : [],
    dnsCache: persistence.dnsCache ? networkActivity.dnsCache || [] : [],
  };

  const snapshotWrites = [];
  if (persistence.processes) {
    snapshotWrites.push(saveProcesses(clientId, normalized.processes, timestamp));
  }
  if (persistence.networkActivity || persistence.dnsCache) {
    snapshotWrites.push(saveNetworkActivity(clientId, networkPayload, timestamp));
  }

  await Promise.all(snapshotWrites);

  // Save time-series sample if interval reached
  if (await shouldStoreSample(clientId, timestamp)) {
    await saveMetricSample(clientId, normalized, metrics, timestamp);
  }

  return normalized;
}
