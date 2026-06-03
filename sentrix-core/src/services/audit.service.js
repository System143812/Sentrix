import pool from "../lib/database.js";
import { 
  getSecurityIdentities as getIdentities, 
  revokeAuthority as revoke, 
  authorizeDevice,
  blacklistDevice
} from "./security.service.js";

let ioInstance = null;

export function initAuditService(io) {
  ioInstance = io;
}

function getRequestIp(req) {
  if (!req) return "127.0.0.1";
  return (
    req.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    "127.0.0.1"
  );
}

function getRequestMac(req) {
  if (!req) return null;
  return (
    req.headers?.["x-client-mac"] ||
    req.headers?.["x-forwarded-mac"] ||
    req.body?.macAddress ||
    req.body?.mac ||
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
  const createdAt = Date.now();
  const ipAddress = getRequestIp(req);
  const mac = macAddress || getRequestMac(req);

  const [result] = await pool.query(
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
      ipAddress,
      mac,
      details ? JSON.stringify(details) : null,
      createdAt,
    ],
  );

  if (ioInstance) {
    // Fetch the full log with joins to ensure consistent real-time data
    const logs = await getAuditLogs({ limit: 1 });
    if (logs.length > 0 && logs[0].id === result.insertId) {
      ioInstance.to("dashboards").emit("audit:new", logs[0]);
    } else {
      // Fallback to basic data if fetching fails or isn't latest
      ioInstance.to("dashboards").emit("audit:new", {
        id: result.insertId,
        actorId: user.id || null,
        actorEmail: user.email || null,
        actorRole: user.role || null,
        action,
        targetType,
        targetId,
        targetLabel,
        ipAddress,
        macAddress: mac,
        details: details || {},
        createdAt,
      });
    }
  }
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
      b_mac.category AS mac_category,
      b_user.category AS user_category,
      b_ip.category AS ip_category
    FROM audit_logs
    LEFT JOIN users ON users.email = audit_logs.actor_email
    LEFT JOIN security_authority b_mac
      ON b_mac.subject_type = 'mac'
      AND b_mac.identifier = UPPER(REPLACE(REPLACE(audit_logs.mac_address, ':', ''), '-', ''))
      AND b_mac.active = 1
    LEFT JOIN security_authority b_user
      ON b_user.subject_type = 'user'
      AND b_user.identifier IN (users.id, audit_logs.actor_email)
      AND b_user.active = 1
    LEFT JOIN security_authority b_ip
      ON b_ip.subject_type = 'ip'
      AND b_ip.identifier = audit_logs.ip_address
      AND b_ip.active = 1
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
    isWhitelisted: row.mac_category === 'whitelist' || row.user_category === 'whitelist' || row.ip_category === 'whitelist',
    isThrottled: row.mac_category === 'rate_limit' || row.user_category === 'rate_limit' || row.ip_category === 'rate_limit',
    details: typeof row.details === "string" ? JSON.parse(row.details || "{}") : row.details,
    createdAt: row.created_at,
  }));
}

export async function authorizeLogSubject(logId, { req = null, reason = "", authorizedBy = null } = {}) {
  const [[log]] = await pool.query("SELECT * FROM audit_logs WHERE id = ? LIMIT 1", [logId]);
  if (!log) throw new Error("Log entry not found.");

  const type = log.actor_id ? 'user' : (log.mac_address ? 'mac' : 'ip');
  const identifier = log.actor_id || log.mac_address || log.ip_address;
  const label = log.actor_email || log.target_label || `Device at ${log.ip_address}`;

  await authorizeDevice({ ip: log.ip_address, mac: log.mac_address }, {
    label,
    type,
    identifier
  });

  await logAuditEvent({
    req,
    action: "AUTHORIZE_DEVICE",
    targetType: type,
    targetId: identifier,
    targetLabel: label,
    details: { reason, source_log_id: logId, authorized_by: authorizedBy },
  });

  return { type, identifier, label };
}

export async function blockLogSubject(logId, { req = null, reason = "Manual security block", blockedBy = null } = {}) {
  const [[log]] = await pool.query("SELECT * FROM audit_logs WHERE id = ? LIMIT 1", [logId]);
  if (!log) throw new Error("Log entry not found.");

  const type = log.actor_id ? 'user' : (log.mac_address ? 'mac' : 'ip');
  const identifier = log.actor_id || log.mac_address || log.ip_address;
  const label = log.actor_email || log.target_label || `Device at ${log.ip_address}`;

  await blacklistDevice({ ip: log.ip_address, mac: log.mac_address }, {
    reason,
    blockedBy
  });

  await logAuditEvent({
    req,
    action: "BLOCK_IDENTITY",
    targetType: type,
    targetId: identifier,
    targetLabel: label,
    details: { reason, source_log_id: logId, blocked_by: blockedBy },
  });

  return { type, identifier, label };
}

export async function getBlockedSubjects(category) {
  return getIdentities(category);
}

export async function revokeAuthorityRecord(id, { revokedBy = null, reason = "" } = {}) {
  return revoke(id, { revokedBy, reason });
}

export async function authorizeAuditDevice(req, data) {
  return authorizeDevice(req, data);
}
