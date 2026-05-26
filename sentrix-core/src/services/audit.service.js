import pool from "../lib/database.js";
import { blockAuditSubject } from "./security.service.js";

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

export async function getAuditLogs({ limit = 200, action = "", actor = "", startDate = "", endDate = "" } = {}) {
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

  if (startDate) {
    filters.push("audit_logs.created_at >= ?");
    params.push(Number(startDate));
  }

  if (endDate) {
    filters.push("audit_logs.created_at <= ?");
    params.push(Number(endDate));
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const [rows] = await pool.query(
    `
    SELECT
      audit_logs.*,
      users.id AS registered_user_id,
      users.role AS registered_user_role,
      blocked_mac.id AS blocked_mac_id,
      blocked_user.id AS blocked_user_id
    FROM audit_logs
    LEFT JOIN users ON users.email = audit_logs.actor_email
    LEFT JOIN blocked_subjects blocked_mac
      ON blocked_mac.subject_type = 'mac'
      AND blocked_mac.identifier = UPPER(REPLACE(REPLACE(audit_logs.mac_address, ':', ''), '-', ''))
      AND blocked_mac.active = 1
    LEFT JOIN blocked_subjects blocked_user
      ON blocked_user.subject_type = 'user'
      AND blocked_user.identifier IN (users.id, audit_logs.actor_email)
      AND blocked_user.active = 1
    ${where}
    ORDER BY audit_logs.created_at DESC
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
    registeredUserId: row.registered_user_id,
    registeredUserRole: row.registered_user_role,
    blocked: Boolean(row.blocked_mac_id || row.blocked_user_id),
    details: typeof row.details === "string" ? JSON.parse(row.details || "{}") : row.details,
    createdAt: row.created_at,
  }));
}

export async function blockLogSubject(logId, { reason = "", blockedBy = null } = {}) {
  return blockAuditSubject(logId, { reason, blockedBy });
}
