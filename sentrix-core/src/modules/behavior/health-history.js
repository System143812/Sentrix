import pool from "../../lib/database.js";
import { toJson, toNumber, withDeadlockRetry } from "../../utils/db.utils.js";
import { getDeviceIssues, getHealthScore } from "../../utils/health.utils.js";
import { insertEvent } from "./software-inventory.js";

async function recentAnomalyExists(connection, clientId, alertType, timestamp) {
  const [[row]] = await connection.query(
    `
    SELECT id
    FROM anomaly_alerts
    WHERE client_id = ?
      AND alert_type = ?
      AND created_at >= ?
    LIMIT 1
    `,
    [clientId, alertType, timestamp - 10 * 60 * 1000],
  );
  return Boolean(row);
}

export async function analyzeMetrics(clientId, normalized = {}, timestamp = Date.now()) {
  if (!clientId) return;

  const processList = Array.isArray(normalized.processes) ? normalized.processes : [];
  const candidates = [
    normalized.cpu > 90 && {
      alertType: "cpu_spike",
      severity: "critical",
      title: "CPU spike detected",
      description: `CPU usage reached ${Math.round(normalized.cpu)}%.`,
      metricValue: normalized.cpu,
    },
    normalized.ram > 90 && {
      alertType: "memory_pressure",
      severity: "warning",
      title: "Memory pressure detected",
      description: `Memory usage reached ${Math.round(normalized.ram)}%.`,
      metricValue: normalized.ram,
    },
    normalized.disk > 95 && {
      alertType: "disk_pressure",
      severity: "warning",
      title: "Disk usage is critically high",
      description: `Disk usage reached ${Math.round(normalized.disk)}%.`,
      metricValue: normalized.disk,
    },
    processList.some((process) => /powershell/i.test(process.name || "") && /encodedcommand|-enc\b/i.test(process.command || "")) && {
      alertType: "suspicious_process",
      severity: "critical",
      title: "Suspicious PowerShell command detected",
      description: "A PowerShell process with encoded arguments was reported.",
      metadata: {
        processes: processList
          .filter((process) => /powershell/i.test(process.name || ""))
          .slice(0, 5),
      },
    },
  ].filter(Boolean);

  if (candidates.length === 0) return;

  await withDeadlockRetry(async () => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const alert of candidates) {
        if (await recentAnomalyExists(connection, clientId, alert.alertType, timestamp)) continue;
        await connection.query(
          `
          INSERT INTO anomaly_alerts
            (client_id, alert_type, severity, title, description, metric_value, baseline_value, metadata, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            clientId,
            alert.alertType,
            alert.severity,
            alert.title,
            alert.description,
            alert.metricValue ?? null,
            alert.baselineValue ?? null,
            toJson(alert.metadata || null),
            timestamp,
          ],
        );
        await insertEvent(connection, {
          clientId,
          eventType: alert.alertType,
          severity: alert.severity,
          title: alert.title,
          description: alert.description,
          metadata: alert.metadata || null,
          createdAt: timestamp,
        });
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  });
}

export async function saveHealthSnapshot(clientId, normalized = {}, status = "online", timestamp = Date.now()) {
  if (!clientId) return;
  const network = normalized.network || {};
  const score = getHealthScore({
    status,
    metrics: normalized,
  });

  await pool.query(
    `
    INSERT INTO device_health_snapshots
      (client_id, status, uptime_seconds, cpu_usage, ram_usage, disk_usage, latency_ms, packet_loss, stability_score, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      clientId,
      status,
      toNumber(normalized.uptime),
      toNumber(normalized.cpu),
      toNumber(normalized.ram),
      toNumber(normalized.disk),
      toNumber(network.latencyMs),
      toNumber(network.packetLoss),
      score,
      timestamp,
    ],
  );
}

export async function recordUptimeStatus(clientId, status, timestamp = Date.now()) {
  if (!clientId || !["online", "offline"].includes(status)) return;

  const [[latest]] = await pool.query(
    `
    SELECT *
    FROM uptime_logs
    WHERE client_id = ?
    ORDER BY started_at DESC
    LIMIT 1
    `,
    [clientId],
  );

  if (latest?.status === status && !latest.ended_at) return;

  if (latest && !latest.ended_at) {
    await pool.query(
      "UPDATE uptime_logs SET ended_at = ?, duration_ms = ? WHERE id = ?",
      [timestamp, Math.max(timestamp - Number(latest.started_at || timestamp), 0), latest.id],
    );
  }

  await pool.query(
    "INSERT INTO uptime_logs (client_id, status, started_at) VALUES (?, ?, ?)",
    [clientId, status, timestamp],
  );
}

export async function getHealthSummary(clientId, { startDate, endDate, limit = 200 } = {}) {
  const filters = ["client_id = ?"];
  const params = [clientId];

  if (startDate) {
    filters.push("recorded_at >= ?");
    params.push(Number(startDate));
  }
  if (endDate) {
    filters.push("recorded_at <= ?");
    params.push(Number(endDate));
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 200, 25), 1000);
  const [snapshots] = await pool.query(
    `
    SELECT *
    FROM device_health_snapshots
    WHERE ${filters.join(" AND ")}
    ORDER BY recorded_at DESC
    LIMIT ?
    `,
    [...params, safeLimit],
  );

  const uptimeFilters = ["client_id = ?"];
  const uptimeParams = [clientId];
  if (startDate) {
    uptimeFilters.push("(started_at >= ? OR ended_at >= ? OR ended_at IS NULL)");
    uptimeParams.push(Number(startDate), Number(startDate));
  }
  if (endDate) {
    uptimeFilters.push("started_at <= ?");
    uptimeParams.push(Number(endDate));
  }

  const [uptime] = await pool.query(
    `
    SELECT *
    FROM uptime_logs
    WHERE ${uptimeFilters.join(" AND ")}
    ORDER BY started_at DESC
    LIMIT 250
    `,
    uptimeParams,
  );

  let totalDuration = 0;
  let onlineDuration = 0;

  if (startDate && endDate) {
    const start = Number(startDate);
    const end = Number(endDate);
    
    for (const row of uptime) {
      const rowStart = Math.max(Number(row.started_at), start);
      const rowEnd = Math.min(row.ended_at ? Number(row.ended_at) : Date.now(), end);
      
      if (rowEnd > rowStart) {
        const duration = rowEnd - rowStart;
        totalDuration += duration;
        if (row.status === "online") {
          onlineDuration += duration;
        }
      }
    }
  } else {
    totalDuration = uptime.reduce((sum, row) => sum + Number(row.duration_ms || 0), 0);
    onlineDuration = uptime
      .filter((row) => row.status === "online")
      .reduce((sum, row) => sum + Number(row.duration_ms || 0), 0);
  }

  return {
    uptimePercent: totalDuration > 0 ? Math.round((onlineDuration / totalDuration) * 1000) / 10 : null,
    restartCount: snapshots.filter((row, index, all) => {
      const next = all[index + 1];
      return next && Number(row.uptime_seconds || 0) < Number(next.uptime_seconds || 0);
    }).length,
    latest: snapshots[0] || null,
    snapshots: snapshots.reverse().map((row) => ({
      id: row.id,
      status: row.status,
      uptimeSeconds: row.uptime_seconds,
      cpu: row.cpu_usage,
      ram: row.ram_usage,
      disk: row.disk_usage,
      latencyMs: row.latency_ms,
      packetLoss: row.packet_loss,
      stabilityScore: row.stability_score,
      recordedAt: row.recorded_at,
    })),
    uptimeLogs: uptime.map((row) => ({
      id: row.id,
      status: row.status,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      durationMs: row.duration_ms,
    })),
  };
}

export async function getAnomalyAlerts(clientId, { startDate, endDate, limit = 100 } = {}) {
  const filters = ["client_id = ?"];
  const params = [clientId];

  if (startDate) {
    filters.push("created_at >= ?");
    params.push(Number(startDate));
  }
  if (endDate) {
    filters.push("created_at <= ?");
    params.push(Number(endDate));
  }

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) as total FROM anomaly_alerts WHERE ${filters.join(" AND ")}`,
    params
  );

  const safeLimit = Math.min(Math.max(Number(limit) || 100, 10), 500);
  const [rows] = await pool.query(
    `
    SELECT *
    FROM anomaly_alerts
    WHERE ${filters.join(" AND ")}
    ORDER BY created_at DESC
    LIMIT ?
    `,
    [...params, safeLimit],
  );

  return {
    total: Number(total || 0),
    rows: rows.map((row) => ({
      id: row.id,
      alertType: row.alert_type,
      severity: row.severity,
      title: row.title,
      description: row.description,
      metricValue: row.metric_value,
      baselineValue: row.baseline_value,
      metadata: parseJson(row.metadata, null),
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
    }))
  };
}
