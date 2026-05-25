import pool from "../lib/database.js";

function getRequestIp(req) {
  return (
    req.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    null
  );
}

function getRequestMac(req) {
  return (
    req?.headers?.["x-client-mac"] ||
    req?.headers?.["x-forwarded-mac"] ||
    req?.body?.macAddress ||
    req?.body?.mac ||
    null
  );
}

export async function logAuditEvent({
  req = null,
  action,
  targetType = null,
  targetId = null,
  targetLabel = null,
  macAddress = null,
  details = null,
  actor = null,
}) {
  if (!action) return;

  const user = actor || req?.user || {};
  await pool.query(
    `
    INSERT INTO audit_logs
      (actor_id, actor_email, actor_role, action, target_type, target_id, target_label, ip_address, mac_address, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      user.id || null,
      user.email || null,
      user.role || null,
      action,
      targetType,
      targetId,
      targetLabel,
      getRequestIp(req),
      macAddress || getRequestMac(req),
      details ? JSON.stringify(details) : null,
      Date.now(),
    ],
  );
}

export async function getAuditLogs({ limit = 200, action = "", actor = "" } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 25), 500);
  const filters = [];
  const params = [];

  if (action) {
    filters.push("action LIKE ?");
    params.push(`%${action}%`);
  }

  if (actor) {
    filters.push("(actor_email LIKE ? OR actor_role LIKE ?)");
    params.push(`%${actor}%`, `%${actor}%`);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const [rows] = await pool.query(
    `
    SELECT *
    FROM audit_logs
    ${where}
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
    `,
    params,
  );

  return rows.map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    actorEmail: row.actor_email,
    actorRole: row.actor_role,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    targetLabel: row.target_label,
    ipAddress: row.ip_address,
    macAddress: row.mac_address,
    details: typeof row.details === "string" ? JSON.parse(row.details || "{}") : row.details,
    createdAt: row.created_at,
  }));
}
