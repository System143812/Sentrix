import crypto from "crypto";
import pool from "../lib/database.js";
import { parseJson, toJson, toNumber, withDeadlockRetry } from "../utils/db.utils.js";
import { getDeviceIssues, getHealthScore } from "../utils/health.utils.js";

const SOFTWARE_RISK_PATTERNS = [
  /utorrent|bittorrent|qbittorrent/i,
  /cheat engine/i,
  /keygen|crack|patcher/i,
  /anydesk|teamviewer/i,
];

function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function softwareKey(item = {}) {
  const raw = [
    item.name,
    item.publisher,
    item.installLocation,
  ]
    .filter(Boolean)
    .join("|")
    .toLowerCase();

  return crypto.createHash("sha1").update(raw || JSON.stringify(item)).digest("hex");
}

function classifyDomain(domain = "") {
  const value = domain.toLowerCase();
  if (/youtube|tiktok|netflix|spotify/.test(value)) return "media";
  if (/discord|facebook|instagram|messenger|telegram/.test(value)) return "social";
  if (/steam|epicgames|riotgames|roblox/.test(value)) return "gaming";
  if (/github|gitlab|npmjs|microsoft|stackoverflow/.test(value)) return "developer";
  if (/google|cloudflare|akamai|amazonaws|azure/.test(value)) return "cloud";
  return "uncategorized";
}

async function insertEvent(connection, {
  clientId,
  eventType,
  severity = "info",
  title,
  description = "",
  metadata = null,
  createdAt = Date.now(),
}) {
  if (!eventType || !title) return;

  await connection.query(
    `
    INSERT INTO event_log
      (device_id, event_type, severity, title, description, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [clientId, eventType, severity, title, description, toJson(metadata), createdAt],
  );
}

export async function saveDeviceEvents(clientId, events = []) {
  const validEvents = Array.isArray(events) ? events : [];
  if (!clientId || validEvents.length === 0) return;

  await withDeadlockRetry(async () => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const event of validEvents.slice(0, 250)) {
        await insertEvent(connection, {
          clientId,
          eventType: normalizeString(event.eventType || event.type, "event"),
          severity: ["info", "warning", "critical"].includes(event.severity)
            ? event.severity
            : "info",
          title: normalizeString(event.title, "Device event"),
          description: normalizeString(event.description),
          metadata: event.metadata || event.details || null,
          createdAt: toNumber(event.createdAt || event.timestamp, Date.now()),
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

export async function saveDomainSummaries(clientId, summaries = [], timestamp = Date.now()) {
  const rows = Array.isArray(summaries) ? summaries : [];
  if (!clientId || rows.length === 0) return;

  const values = rows
    .filter((item) => item.domain || item.peerAddress)
    .slice(0, 300)
    .map((item) => {
      const domain = normalizeString(item.domain || item.peerAddress).toLowerCase();
      return [
        clientId,
        domain,
        normalizeString(item.process || item.processName),
        classifyDomain(domain),
        Math.max(toNumber(item.hits ?? item.count, 1), 1),
        Math.max(toNumber(item.bandwidthBytes, 0), 0),
        timestamp,
        timestamp,
      ];
    });

  if (values.length === 0) return;

  await pool.query(
    `
    INSERT INTO client_domain_summaries
      (client_id, domain, process_name, category, hits, bandwidth_bytes, first_seen_at, last_seen_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      category = VALUES(category),
      hits = hits + VALUES(hits),
      bandwidth_bytes = bandwidth_bytes + VALUES(bandwidth_bytes),
      last_seen_at = VALUES(last_seen_at)
    `,
    [values],
  );
}

export async function saveSoftwareInventory(clientId, software = [], timestamp = Date.now()) {
  const items = Array.isArray(software) ? software : [];
  if (!clientId || items.length === 0) return { count: 0, flagged: 0 };

  return withDeadlockRetry(async () => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [existingRows] = await connection.query(
        "SELECT * FROM client_software_inventory WHERE client_id = ?",
        [clientId],
      );
      const existingByKey = new Map(existingRows.map((row) => [row.software_key, row]));
      const seenKeys = new Set();
      let flagged = 0;

      for (const item of items.slice(0, 1000)) {
        const name = normalizeString(item.name);
        if (!name) continue;

        const key = item.key || softwareKey(item);
        seenKeys.add(key);
        const riskLevel = SOFTWARE_RISK_PATTERNS.some((pattern) => pattern.test(name))
          ? "warning"
          : "normal";
        if (riskLevel !== "normal") flagged++;

        const existing = existingByKey.get(key);
        await connection.query(
          `
          INSERT INTO client_software_inventory
            (client_id, software_key, name, version, publisher, install_date, status, risk_level, first_seen_at, last_seen_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'installed', ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            version = VALUES(version),
            publisher = VALUES(publisher),
            install_date = VALUES(install_date),
            status = 'installed',
            risk_level = VALUES(risk_level),
            last_seen_at = VALUES(last_seen_at),
            updated_at = VALUES(updated_at)
          `,
          [
            clientId,
            key,
            name,
            item.version || null,
            item.publisher || null,
            item.installDate || null,
            riskLevel,
            timestamp,
            timestamp,
            timestamp,
          ],
        );

        const changedVersion = existing && existing.version !== (item.version || null);
        const eventType = !existing || existing.status === "removed"
          ? "installed"
          : changedVersion
            ? "updated"
            : riskLevel !== "normal"
              ? "flagged"
              : null;

        if (eventType) {
          await connection.query(
            `
            INSERT INTO client_software_events
              (client_id, software_key, name, version, publisher, event_type, observed_at, details)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
              clientId,
              key,
              name,
              item.version || null,
              item.publisher || null,
              eventType,
              timestamp,
              toJson({ riskLevel, previousVersion: existing?.version || null }),
            ],
          );

          await insertEvent(connection, {
            clientId,
            eventType: `software_${eventType}`,
            severity: riskLevel === "normal" ? "info" : "warning",
            title: `${name} ${eventType}`,
            description: item.version ? `Version ${item.version}` : "",
            metadata: { publisher: item.publisher || null, riskLevel },
            createdAt: timestamp,
          });
        }
      }

      for (const row of existingRows) {
        if (seenKeys.has(row.software_key) || row.status === "removed") continue;
        await connection.query(
          `
          UPDATE client_software_inventory
          SET status = 'removed', updated_at = ?, last_seen_at = ?
          WHERE id = ?
          `,
          [timestamp, timestamp, row.id],
        );
        await connection.query(
          `
          INSERT INTO client_software_events
            (client_id, software_key, name, version, publisher, event_type, observed_at, details)
          VALUES (?, ?, ?, ?, ?, 'removed', ?, ?)
          `,
          [
            clientId,
            row.software_key,
            row.name,
            row.version,
            row.publisher,
            timestamp,
            toJson({ lastSeenAt: row.last_seen_at }),
          ],
        );
      }

      await connection.commit();
      return { count: seenKeys.size, flagged };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  });
}

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

export async function getDeviceEvents(clientId, { startDate, endDate, limit = 200 } = {}) {
  const filters = ["device_id = ?"];
  const params = [clientId];

  if (startDate) {
    filters.push("created_at >= ?");
    params.push(Number(startDate));
  }

  if (endDate) {
    filters.push("created_at <= ?");
    params.push(Number(endDate));
  }

  params.push(Math.min(Math.max(Number(limit) || 200, 25), 500));
  const [rows] = await pool.query(
    `
    SELECT *
    FROM event_log
    WHERE ${filters.join(" AND ")}
    ORDER BY created_at DESC
    LIMIT ?
    `,
    params,
  );

  return rows.map((row) => ({
    id: row.id,
    deviceId: row.device_id,
    eventType: row.event_type,
    severity: row.severity,
    title: row.title,
    description: row.description,
    metadata: parseJson(row.metadata, null),
    createdAt: row.created_at,
  }));
}

export async function getDomainSummaries(clientId, { limit = 200 } = {}) {
  const [rows] = await pool.query(
    `
    SELECT *
    FROM client_domain_summaries
    WHERE client_id = ?
    ORDER BY last_seen_at DESC
    LIMIT ?
    `,
    [clientId, Math.min(Math.max(Number(limit) || 200, 25), 500)],
  );

  return rows.map((row) => ({
    id: row.id,
    domain: row.domain,
    process: row.process_name,
    category: row.category,
    hits: Number(row.hits || 0),
    bandwidthBytes: Number(row.bandwidth_bytes || 0),
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  }));
}

export async function getSoftwareInventory(clientId) {
  const [inventory] = await pool.query(
    `
    SELECT *
    FROM client_software_inventory
    WHERE client_id = ?
    ORDER BY risk_level DESC, name ASC
    `,
    [clientId],
  );
  const [events] = await pool.query(
    `
    SELECT *
    FROM client_software_events
    WHERE client_id = ?
    ORDER BY observed_at DESC
    LIMIT 100
    `,
    [clientId],
  );

  return {
    inventory: inventory.map((row) => ({
      id: row.id,
      key: row.software_key,
      name: row.name,
      version: row.version,
      publisher: row.publisher,
      installDate: row.install_date,
      status: row.status,
      riskLevel: row.risk_level,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      updatedAt: row.updated_at,
    })),
    events: events.map((row) => ({
      id: row.id,
      key: row.software_key,
      name: row.name,
      version: row.version,
      publisher: row.publisher,
      eventType: row.event_type,
      observedAt: row.observed_at,
      details: parseJson(row.details, null),
    })),
  };
}

export async function getHealthSummary(clientId, { limit = 200 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 25), 500);
  const [snapshots] = await pool.query(
    `
    SELECT *
    FROM device_health_snapshots
    WHERE client_id = ?
    ORDER BY recorded_at DESC
    LIMIT ?
    `,
    [clientId, safeLimit],
  );
  const [uptime] = await pool.query(
    `
    SELECT *
    FROM uptime_logs
    WHERE client_id = ?
    ORDER BY started_at DESC
    LIMIT 100
    `,
    [clientId],
  );

  const totalDuration = uptime.reduce(
    (sum, row) => sum + Number(row.duration_ms || 0),
    0,
  );
  const onlineDuration = uptime
    .filter((row) => row.status === "online")
    .reduce((sum, row) => sum + Number(row.duration_ms || 0), 0);

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

export async function getAnomalyAlerts(clientId, { limit = 100 } = {}) {
  const [rows] = await pool.query(
    `
    SELECT *
    FROM anomaly_alerts
    WHERE client_id = ?
    ORDER BY created_at DESC
    LIMIT ?
    `,
    [clientId, Math.min(Math.max(Number(limit) || 100, 10), 300)],
  );

  return rows.map((row) => ({
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
  }));
}
