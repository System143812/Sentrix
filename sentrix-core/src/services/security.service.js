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
  // If MAC is missing from headers, try to resolve it via discovery logs/ARP
  const mac = headerMac || await resolveMacFromIp(ip);
  
  // Strict check: If ANY identifier associated with this request is actively banned, block it.
  const [rows] = await pool.query(
    `
    SELECT id FROM security_authority
    WHERE category = 'rate_limit' AND active = 1
      AND (
        (subject_type = 'ip' AND identifier = ? AND identifier IS NOT NULL AND identifier != '')
        OR (subject_type = 'mac' AND identifier = ? AND identifier IS NOT NULL AND identifier != '')
      )
    LIMIT 1
    `,
    [ip, mac]
  );
  return rows.length > 0;
}

export async function isRequestAuthorized(req) {
  const ip = getRequestIp(req);
  const headerMac = normalizeMac(getRequestMac(req));
  const agentId = req.headers?.["x-sentrix-agent-id"];
  
  // Fallback MAC for authorization too
  const mac = headerMac || await resolveMacFromIp(ip);
  
  console.log(`[SECURITY] Checking authorization for IP: ${ip}, MAC: ${mac || "UNKNOWN"}, AgentID: ${agentId || "MISSING"}`);

  // 1. Check Whitelist (Fastest)
  const [whitelistRows] = await pool.query(
    `
    SELECT id, category FROM security_authority
    WHERE category = 'whitelist' AND active = 1
      AND (
        (subject_type = 'ip' AND identifier = ? AND identifier IS NOT NULL AND identifier != '')
        OR (subject_type = 'mac' AND identifier = ? AND identifier IS NOT NULL AND identifier != '')
        OR (subject_type = 'agent_id' AND identifier = ? AND identifier IS NOT NULL AND identifier != '')
      )
    LIMIT 1
    `,
    [ip, mac, agentId]
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
      // Auto-whitelist this new IP/MAC
      await authorizeDevice(req, { label: client.hostname, type: 'agent_id', identifier: agentId });
      return true;
    } else {
      console.log(`[SECURITY] AgentID ${agentId} not found in clients table.`);
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

  // Whitelist the primary identifier
  await pool.query(
    `
    INSERT INTO security_authority (subject_type, identifier, label, category, recorded_at, active)
    VALUES (?, ?, ?, 'whitelist', ?, 1)
    ON DUPLICATE KEY UPDATE active = 1, category = 'whitelist', label = VALUES(label)
    `,
    [type, identifier, label, now]
  );

  // Whitelist current network identifiers for fast check
  if (ip && ip !== "127.0.0.1" && ip !== "::1") {
    await pool.query(
      `
      INSERT INTO security_authority (subject_type, identifier, label, category, recorded_at, active)
      VALUES ('ip', ?, ?, 'whitelist', ?, 1)
      ON DUPLICATE KEY UPDATE active = 1, category = 'whitelist'
      `,
      [ip, `IP of ${label}`, now]
    );
  }

  if (mac) {
    await pool.query(
      `
      INSERT INTO security_authority (subject_type, identifier, label, category, recorded_at, active)
      VALUES ('mac', ?, ?, 'whitelist', ?, 1)
      ON DUPLICATE KEY UPDATE active = 1, category = 'whitelist'
      `,
      [mac, `MAC of ${label}`, now]
    );
  }

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
    WHERE subject_type = 'mac'
      AND identifier = ?
      AND category = 'rate_limit'
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
    SELECT id, subject_type, identifier, label, role, reason, added_by, recorded_at, source_log_id, category
    FROM security_authority
    WHERE active = 1 AND category = ?
    ORDER BY recorded_at DESC
    `,
    [category]
  );
  return rows;
}

export async function revokeAuthority(id, { revokedBy = null, reason = "" } = {}) {
  const [[subject]] = await pool.query(
    "SELECT * FROM security_authority WHERE id = ? LIMIT 1",
    [id],
  );

  if (!subject) {
    throw new Error("Identity record not found.");
  }

  const now = Date.now();
  
  // Update the target record
  await pool.query(
    `
    UPDATE security_authority
    SET active = 0,
        revoked_at = ?,
        revoked_by = ?,
        revoke_reason = ?
    WHERE id = ?
    `,
    [now, revokedBy, reason, id],
  );

  // Unified Restore: If this is a rate limit, also restore all related records from the same "ban event"
  if (subject.category === 'rate_limit') {
    // We look for other records with the same recorded_at (+/- 2 seconds) 
    // OR records that match the identifier if it's a MAC/IP cross-reference
    await pool.query(
      `
      UPDATE security_authority
      SET active = 0,
          revoked_at = ?,
          revoked_by = ?,
          revoke_reason = 'Unified Security Restore'
      WHERE category = 'rate_limit' 
        AND active = 1
        AND recorded_at BETWEEN ? - 2000 AND ? + 2000
      `,
      [now, revokedBy, subject.recorded_at, subject.recorded_at]
    );
  }

  if (ioInstance) {
    ioInstance.to("dashboards").emit("authority:update", { category: subject.category });
  }

  return {
    ...subject,
    active: 0,
    revoked_at: now,
    revoked_by: revokedBy,
    revoke_reason: reason,
  };
}

export async function banDevice(req, { reason = "Automated rate-limit ban" } = {}) {
  const ip = getRequestIp(req);
  const mac = normalizeMac(getRequestMac(req)) || await resolveMacFromIp(ip);
  const now = Date.now();

  if (ip && ip !== "127.0.0.1") {
    await pool.query(
      `
      INSERT INTO security_authority (subject_type, identifier, label, category, reason, recorded_at, active)
      VALUES ('ip', ?, ?, 'rate_limit', ?, ?, 1)
      ON DUPLICATE KEY UPDATE 
        active = 1, 
        category = 'rate_limit', 
        reason = VALUES(reason), 
        recorded_at = VALUES(recorded_at),
        revoked_at = NULL,
        revoked_by = NULL
      `,
      [ip, `Rate Limited IP: ${ip}`, reason, now]
    );
  }

  if (mac) {
    await pool.query(
      `
      INSERT INTO security_authority (subject_type, identifier, label, category, reason, recorded_at, active)
      VALUES ('mac', ?, ?, 'rate_limit', ?, ?, 1)
      ON DUPLICATE KEY UPDATE 
        active = 1, 
        category = 'rate_limit', 
        reason = VALUES(reason), 
        recorded_at = VALUES(recorded_at),
        revoked_at = NULL,
        revoked_by = NULL
      `,
      [mac, `Rate Limited MAC: ${mac}`, reason, now]
    );
  }

  if (ioInstance) {
    ioInstance.to("dashboards").emit("authority:update", { category: "rate_limit" });
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
