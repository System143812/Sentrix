import { AuditRepository } from "./audit.repository.js";
import {
  getSecurityIdentities as getIdentities,
  revokeAuthority as revoke,
  authorizeDevice,
  blacklistDevice,
} from "../security/security.service.js";

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

function mapAuditLog(row) {
  return {
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
    isWhitelisted: row.authority_category === "whitelist",
    isThrottled:
      (row.authority_category === "rate_limit" ||
        row.authority_category === "blacklist") &&
      (row.authority_target === "all" ||
        (row.authority_target === "ip" && row.ip_address) ||
        (row.authority_target === "mac" && row.mac_address)),
    details:
      typeof row.details === "string"
        ? JSON.parse(row.details || "{}")
        : row.details,
    createdAt: row.created_at,
  };
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

  const logId = await AuditRepository.insertLog({
    actorId: user.id || null,
    actorEmail: user.email || null,
    actorRole: user.role || null,
    action,
    targetType,
    targetId,
    targetLabel,
    ipAddress,
    macAddress: mac,
    details,
    createdAt,
  });

  if (ioInstance) {
    const logs = await getAuditLogs({ limit: 1 });
    if (logs.length > 0 && logs[0].id === logId) {
      ioInstance.to("dashboards").emit("audit:new", logs[0]);
    } else {
      ioInstance.to("dashboards").emit("audit:new", {
        id: logId,
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

export async function getAuditLogs({
  limit = 200,
  action = "",
  actor = "",
  startDate = "",
  endDate = "",
} = {}) {
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

  const rows = await AuditRepository.findLogs({
    filters,
    params,
    limit: safeLimit,
  });

  return rows.map(mapAuditLog);
}

export async function authorizeLogSubject(
  logId,
  { req = null, reason = "", authorizedBy = null } = {},
) {
  const log = await AuditRepository.findLogById(logId);
  if (!log) throw new Error("Log entry not found.");

  const type = log.actor_id ? "user" : log.mac_address ? "mac" : "ip";
  const identifier = log.actor_id || log.mac_address || log.ip_address;
  const label = log.actor_email || log.target_label || `Device at ${log.ip_address}`;

  await authorizeDevice(
    { ip: log.ip_address, mac: log.mac_address },
    {
      label,
      type,
      identifier,
    },
  );

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

export async function blockLogSubject(
  logId,
  { req = null, reason = "Manual security block", blockedBy = null } = {},
) {
  const log = await AuditRepository.findLogById(logId);
  if (!log) throw new Error("Log entry not found.");

  const type = log.actor_id ? "user" : log.mac_address ? "mac" : "ip";
  const identifier = log.actor_id || log.mac_address || log.ip_address;
  const label = log.actor_email || log.target_label || `Device at ${log.ip_address}`;

  await blacklistDevice(
    { ip: log.ip_address, mac: log.mac_address },
    {
      reason,
      blockedBy,
    },
  );

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

export async function revokeAuthorityRecord(
  id,
  { revokedBy = null, reason = "", target = "all" } = {},
) {
  return revoke(id, { revokedBy, reason, target });
}

export async function authorizeAuditDevice(req, data) {
  return authorizeDevice(req, data);
}
