import pool from "../../lib/database.js";
import { parseJson, toJson, withDeadlockRetry } from "../../utils/db.utils.js";
import { normalizeString, classifyDomain } from "./helpers.js";

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
        normalizeString(item.category || classifyDomain(domain), "uncategorized"),
        Math.max(Number(item.hits ?? item.count) || 1, 1),
        Math.max(Number(item.bandwidthBytes) || 0, 0),
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

export async function getDomainSummaries(clientId, { startDate, endDate, limit = 500 } = {}) {
  const filters = ["client_id = ?"];
  const params = [clientId];

  if (startDate) {
    filters.push("last_seen_at >= ?");
    params.push(Number(startDate));
  }
  if (endDate) {
    filters.push("last_seen_at <= ?");
    params.push(Number(endDate));
  }

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) as total FROM client_domain_summaries WHERE ${filters.join(" AND ")}`,
    params
  );

  const safeLimit = Math.min(Math.max(Number(limit) || 200, 25), 1000);
  const [rows] = await pool.query(
    `
    SELECT *
    FROM client_domain_summaries
    WHERE ${filters.join(" AND ")}
    ORDER BY last_seen_at DESC
    LIMIT ?
    `,
    [...params, safeLimit],
  );

  return {
    total: Number(total || 0),
    rows: rows.map((row) => ({
      id: row.id,
      domain: row.domain,
      process: row.process_name,
      category: row.category,
      hits: Number(row.hits || 0),
      bandwidthBytes: Number(row.bandwidth_bytes || 0),
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
    }))
  };
}
