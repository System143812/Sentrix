import pool from "../lib/database.js";
import { exec } from "child_process";
import util from "util";

const execAsync = util.promisify(exec);

let ioInstance = null;

export function initSecurityService(io) {
  ioInstance = io;
}

export function normalizeMac(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-F0-9]/g, "");
}

export function formatMac(value = "") {
  const normalized = normalizeMac(value);
  if (normalized.length !== 12) return String(value || "").trim();
  return normalized.match(/.{1,2}/g).join(":");
}

export function getRequestMac(req) {
  if (!req) return null;
  const mac = (
    req.headers?.["x-client-mac"] ||
    req.headers?.["x-forwarded-mac"] ||
    req.body?.macAddress ||
    req.body?.mac ||
    null
  );
  const normalized = normalizeMac(mac);
  return normalized.length === 12 ? normalized : null;
}

export function getRequestIp(req) {
  if (!req) return "127.0.0.1";
  return (
    req.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    "127.0.0.1"
  );
}

export async function resolveMacFromIp(ip) {
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") return null;
  try {
    // Priority 1: Check Discovery Scan results (fast)
    const [[scan]] = await pool.query(
      "SELECT mac FROM discovery_scan_results WHERE ip = ? AND mac != 'Unknown' LIMIT 1",
      [ip]
    );
    if (scan?.mac) return normalizeMac(scan.mac);

    // Priority 2: Live ARP command (fallback)
    const { stdout } = await execAsync(`arp -a ${ip}`);
    const match = stdout.match(/([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})/);
    return match ? normalizeMac(match[0]) : null;
  } catch {
    return null;
  }
}

export async function isRequestRateLimited(req) {
  const ip = getRequestIp(req);
  const headerMac = normalizeMac(getRequestMac(req));
  const mac = headerMac || await resolveMacFromIp(ip);
  
  const userIds = [req.user?.id, req.user?.email].filter(Boolean);
  
  const [rows] = await pool.query(
    `
    SELECT id FROM security_authority
    WHERE category IN ('rate_limit', 'blacklist') AND active = 1
      AND (
        (ip_address = ? AND (block_target = 'ip' OR block_target = 'all'))
        OR (mac_address = ? AND (block_target = 'mac' OR block_target = 'all'))
        OR (subject_type = 'ip' AND identifier = ? AND (block_target = 'ip' OR block_target = 'all'))
        OR (subject_type = 'mac' AND identifier = ? AND (block_target = 'mac' OR block_target = 'all'))
        OR (subject_type = 'user' AND identifier IN (?))
      )
    LIMIT 1
    `,
    [ip, mac, ip, mac, userIds.length > 0 ? userIds : ['__NONE__']]
  );
  return rows.length > 0;
}

export async function isRequestAuthorized(req) {
  const ip = getRequestIp(req);
  const headerMac = normalizeMac(getRequestMac(req));
  const agentId = req.headers?.["x-sentrix-agent-id"];
  const mac = headerMac || await resolveMacFromIp(ip);
  
  const userIds = [req.user?.id, req.user?.email].filter(Boolean);
  
  console.log(`[SECURITY] Checking authorization for IP: ${ip}, MAC: ${mac || "UNKNOWN"}, AgentID: ${agentId || "MISSING"}`);

  // 1. Check Whitelist (Fastest)
  const [whitelistRows] = await pool.query(
    `
    SELECT id, category FROM security_authority
    WHERE category = 'whitelist' AND active = 1
      AND (
        (ip_address = ?)
        OR (mac_address = ?)
        OR (subject_type = 'agent_id' AND identifier = ?)
        OR (subject_type = 'ip' AND identifier = ?)
        OR (subject_type = 'mac' AND identifier = ?)
        OR (subject_type = 'user' AND identifier IN (?))
      )
    LIMIT 1
    `,
    [ip, mac, agentId, ip, mac, userIds.length > 0 ? userIds : ['__NONE__']]
  );
  if (whitelistRows.length > 0) {
    console.log(`[SECURITY] Authorized via whitelist: IP=${ip}, MAC=${mac}, AgentID=${agentId}`);
    return true;
  }

  // 2. Check Agent-ID against Clients table
  if (agentId) {
    const [[client]] = await pool.query(
      "SELECT id, hostname FROM clients WHERE agent_id = ? AND archived = 0 LIMIT 1",
      [agentId]
    );
    if (client) {
      console.log(`[SECURITY] Auto-authorizing known Agent: ${agentId} (${client.hostname})`);
      await authorizeDevice(req, { label: client.hostname, type: 'agent_id', identifier: agentId });
      return true;
    }
  }

  // 3. Check Admin Session
  if (req.user?.role === 'network_admin') {
    console.log(`[SECURITY] Authorized via Admin session: ${req.user.email}`);
    await authorizeDevice(req, { label: req.user.email, type: 'user', identifier: req.user.id });
    return true;
  }

  console.warn(`[SECURITY] No authorization rule matched for IP=${ip}, MAC=${mac}, AgentID=${agentId}`);
  return false;
}

export async function authorizeDevice(reqOrData, { label, type, identifier }) {
  const ip = reqOrData.ip || getRequestIp(reqOrData);
  const mac = normalizeMac(reqOrData.mac || getRequestMac(reqOrData)) || await resolveMacFromIp(ip);
  const now = Date.now();

  // Unified Whitelist Entry
  await pool.query(
    `
    INSERT INTO security_authority (subject_type, identifier, label, category, ip_address, mac_address, recorded_at, active)
    VALUES (?, ?, ?, 'whitelist', ?, ?, ?, 1)
    ON DUPLICATE KEY UPDATE 
      active = 1, 
      category = 'whitelist', 
      label = VALUES(label),
      ip_address = IFNULL(VALUES(ip_address), ip_address),
      mac_address = IFNULL(VALUES(mac_address), mac_address)
    `,
    [type, identifier, label, ip !== "127.0.0.1" ? ip : null, mac, now]
  );

  if (ioInstance) {
    ioInstance.to("dashboards").emit("authority:update", { category: "whitelist" });
  }
}

export async function isMacRateLimited(mac) {
  const identifier = normalizeMac(mac);
  if (!identifier) return false;

  const [[row]] = await pool.query(
    `
    SELECT id
    FROM security_authority
    WHERE mac_address = ?
      AND category = 'rate_limit'
      AND (block_target = 'mac' OR block_target = 'all')
      AND active = 1
    LIMIT 1
    `,
    [identifier],
  );

  return Boolean(row);
}

export async function isUserRateLimited(user = {}) {
  const identifiers = [user.id, user.email].filter(Boolean);
  if (identifiers.length === 0) return false;

  const [rows] = await pool.query(
    `
    SELECT id
    FROM security_authority
    WHERE subject_type = 'user'
      AND identifier IN (?)
      AND category = 'rate_limit'
      AND active = 1
    LIMIT 1
    `,
    [identifiers],
  );

  return rows.length > 0;
}

export async function assertRequestAllowed(req) {
  const mac = getRequestMac(req);
  if (await isMacRateLimited(mac)) {
    const error = new Error("Throttled");
    error.statusCode = 403;
    throw error;
  }
}

export async function getSecurityIdentities(category = 'rate_limit') {
  const [rows] = await pool.query(
    `
    SELECT id, subject_type, identifier, label, role, reason, added_by, recorded_at, source_log_id, category, ip_address, mac_address, block_target
    FROM security_authority
    WHERE active = 1 AND category = ?
    ORDER BY recorded_at DESC
    `,
    [category]
  );
  return rows;
}

export async function revokeAuthority(id, { revokedBy = null, reason = "", target = "all" } = {}) {
  const [[subject]] = await pool.query(
    "SELECT * FROM security_authority WHERE id = ? LIMIT 1",
    [id],
  );

  if (!subject) {
    throw new Error("Identity record not found.");
  }

  const now = Date.now();
  let newActive = 0;
  let newTarget = subject.block_target;

  if (target === "ip") {
    if (subject.block_target === "all") {
      newTarget = "mac";
      newActive = 1;
    } else if (subject.block_target === "ip") {
      newActive = 0;
    }
  } else if (target === "mac") {
    if (subject.block_target === "all") {
      newTarget = "ip";
      newActive = 1;
    } else if (subject.block_target === "mac") {
      newActive = 0;
    }
  } else {
    newActive = 0;
  }
  
  await pool.query(
    `
    UPDATE security_authority
    SET active = ?,
        block_target = ?,
        revoked_at = ?,
        revoked_by = ?,
        revoke_reason = ?
    WHERE id = ?
    `,
    [newActive, newTarget, now, revokedBy, reason, id],
  );

  if (ioInstance) {
    ioInstance.to("dashboards").emit("authority:update", { category: subject.category });
  }

  return {
    ...subject,
    active: newActive,
    block_target: newTarget,
    revoked_at: now,
    revoked_by: revokedBy,
    revoke_reason: reason,
  };
}

export async function banDevice(req, { reason = "Automated rate-limit ban" } = {}) {
  const ip = getRequestIp(req);
  const mac = normalizeMac(getRequestMac(req)) || await resolveMacFromIp(ip);
  const now = Date.now();

  await pool.query(
    `
    INSERT INTO security_authority (subject_type, identifier, label, category, ip_address, mac_address, block_target, reason, recorded_at, active)
    VALUES ('ip', ?, ?, 'rate_limit', ?, ?, 'all', ?, ?, 1)
    ON DUPLICATE KEY UPDATE 
      active = 1, 
      block_target = 'all',
      category = 'rate_limit', 
      reason = VALUES(reason), 
      recorded_at = VALUES(recorded_at),
      revoked_at = NULL,
      revoked_by = NULL
    `,
    [ip, `Rate Limited Device: ${ip}`, ip !== "127.0.0.1" ? ip : null, mac, reason, now]
  );

  if (ioInstance) {
    ioInstance.to("dashboards").emit("authority:update", { category: "rate_limit" });
  }
}

export async function blacklistDevice(reqOrData, { reason = "Manual security block", blockedBy = null } = {}) {
  const ip = reqOrData.ip || getRequestIp(reqOrData);
  const mac = normalizeMac(reqOrData.mac || getRequestMac(reqOrData)) || await resolveMacFromIp(ip);
  const now = Date.now();

  await pool.query(
    `
    INSERT INTO security_authority (subject_type, identifier, label, category, ip_address, mac_address, block_target, reason, added_by, recorded_at, active)
    VALUES ('ip', ?, ?, 'blacklist', ?, ?, 'all', ?, ?, ?, 1)
    ON DUPLICATE KEY UPDATE 
      active = 1, 
      block_target = 'all',
      category = 'blacklist', 
      reason = VALUES(reason), 
      added_by = VALUES(added_by),
      recorded_at = VALUES(recorded_at),
      revoked_at = NULL,
      revoked_by = NULL
    `,
    [ip, `Blacklisted Device: ${ip}`, ip !== "127.0.0.1" ? ip : null, mac, reason, blockedBy, now]
  );

  if (ioInstance) {
    ioInstance.to("dashboards").emit("authority:update", { category: "blacklist" });
  }
}

/**
 * Persistently logs a security incident (e.g., failed login).
 */
export async function recordSecurityIncident(req, eventType = 'login_failure') {
  const ip = getRequestIp(req);
  const mac = normalizeMac(getRequestMac(req)) || await resolveMacFromIp(ip);
  const now = Date.now();

  await pool.query(
    `INSERT INTO security_incidents (ip_address, mac_address, event_type, created_at) VALUES (?, ?, ?, ?)`,
    [ip, mac, eventType, now]
  );
}

/**
 * Returns the count of incidents for a specific identifier (IP or MAC) within a time window.
 */
export async function getSecurityIncidentCount(identifier, windowMs = 30 * 60 * 1000) {
  if (!identifier) return 0;
  const since = Date.now() - windowMs;

  const [[{ count }]] = await pool.query(
    `
    SELECT COUNT(*) as count FROM security_incidents
    WHERE (ip_address = ? OR mac_address = ?)
      AND created_at >= ?
    `,
    [identifier, identifier, since]
  );
  return count || 0;
}

/**
 * Clears all incidents for a specific device (IP/MAC).
 */
export async function clearSecurityIncidents(req) {
  const ip = getRequestIp(req);
  const mac = normalizeMac(getRequestMac(req)) || await resolveMacFromIp(ip);

  await pool.query(
    `DELETE FROM security_incidents WHERE ip_address = ? OR mac_address = ?`,
    [ip, mac]
  );
}
