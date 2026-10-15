import crypto from "crypto";
import pool from "../../lib/database.js";
import { parseJson, toJson, toNumber, withDeadlockRetry } from "../../utils/db.utils.js";
import { normalizeString } from "./helpers.js";

const SOFTWARE_RISK_PATTERNS = [
  /utorrent|bittorrent|qbittorrent/i,
  /cheat engine/i,
  /keygen|crack|patcher/i,
  /anydesk|teamviewer/i,
];

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

export async function insertEvent(connection, {
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
