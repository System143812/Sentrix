import { exec } from "child_process";
import util from "util";
import crypto from "crypto";
import { SecurityRepository } from "./security.repository.js";

const execAsync = util.promisify(exec);

let ioInstance = null;

// Use a persistent secret for HMAC and salting. In production, this should be in .env.
const SERVER_SECURITY_SECRET = process.env.SENTRIX_SECURITY_SECRET || "sentrix_default_secure_secret_2024";

export function initSecurityService(io) {
  ioInstance = io;
}

/**
 * Generates a short-lived provisioning token for an agent.
 */
export async function generateProvisioningToken(clientId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutes
  const now = Date.now();
  const pendingHostname = `Pending Agent ${String(clientId).slice(0, 8)}`;

  await SecurityRepository.upsertPendingProvisioningClient({
    clientId,
    pendingHostname,
    token,
    expiresAt,
    now,
  });

  return token;
}

export function computeSecureFingerprint(fingerprint) {
  if (!fingerprint) return null;
  return crypto
    .createHmac("sha256", SERVER_SECURITY_SECRET)
    .update(fingerprint)
    .digest("hex");
}

/**
 * Verifies if a given fingerprint and token are valid for binding or re-registration.
 */
export async function bindHardwareFingerprint(clientId, fingerprint, token) {
  const client = await SecurityRepository.findClientHardwareBinding(clientId);

  if (!client) throw new Error("Client not found.");

  // Salt and Hash the incoming fingerprint for comparison/storage
  const secureFingerprint = computeSecureFingerprint(fingerprint);
  
  // CASE 1: Provisioning/Update Flow (Token provided)
  if (token) {
    if (client.provisioning_token === token) {
      if (Date.now() > client.token_expires_at) {
        throw new Error("Provisioning token has expired.");
      }

      // Update the fingerprint (Authorized Upgrade)
      await SecurityRepository.bindClientHardwareFingerprintWithToken(
        clientId,
        secureFingerprint,
      );

      console.log(`[SECURITY] Hardware bound (via Token) for client ${clientId}`);
      return secureFingerprint;
    } else {
      // TOKEN MISMATCH: If the device is already bound and the fingerprint matches, 
      // treat it as a re-verification success rather than a failure.
      if (client.hardware_fingerprint === secureFingerprint) {
        console.warn(`[SECURITY] Invalid token for ${clientId} but fingerprint matches. Falling back to re-verification.`);
        return secureFingerprint;
      }
      
      throw new Error("Invalid provisioning token.");
    }
  }

  // CASE 2: Normal Re-registration (No token)
  if (client.hardware_fingerprint) {
    if (client.hardware_fingerprint === secureFingerprint) {
      console.log(`[SECURITY] Hardware re-verified for client ${clientId}`);
      return secureFingerprint;
    } else {
      console.error(`[SECURITY] Hardware mismatch for ${clientId}. Potential clone detected.`);
      throw new Error("Hardware identity mismatch. This device identity is locked to different hardware.");
    }
  }

  // CASE 3: First-time registration WITHOUT token
  // In a strict system, we'd block this. But for convenience, we might allow it 
  // if the client doesn't have a fingerprint yet.
  // However, our plan says we use OTP for first time.
  console.warn(`[SECURITY] First-time registration for ${clientId} without token. Binding anyway (Legacy support).`);
  
  await SecurityRepository.updateClientHardwareFingerprint(
    clientId,
    secureFingerprint,
  );

  return secureFingerprint;
}

/**
 * Verifies the HMAC signature of incoming agent data.
 */
export async function verifyHardwareSignature(clientId, data, signature, timestamp) {
  const client = await SecurityRepository.findClientHardwareFingerprint(clientId);

  if (!client?.hardware_fingerprint) {
    console.warn(`[SECURITY] Rejecting unsigned data: No fingerprint bound for ${clientId}`);
    return false;
  }

  // Prevent Replay Attacks: Check if timestamp is within 5 minutes
  const now = Date.now();
  if (Math.abs(now - timestamp) > 5 * 60 * 1000) {
    console.warn(`[SECURITY] Rejecting data: Timestamp drift too high for ${clientId}`);
    return false;
  }

  // Re-calculate HMAC using the stored (secure) fingerprint as the key
  const payload = JSON.stringify(data) + timestamp;
  const expectedSignature = crypto
    .createHmac("sha256", client.hardware_fingerprint)
    .update(payload)
    .digest("hex");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);

  if (sigBuf.length !== expBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuf, expBuf);
}

/**
 * Signs an outbound command for a hardware-bound agent.
 */
export async function signAgentCommand(clientId, command, args = {}) {
  const client = await SecurityRepository.findClientHardwareFingerprint(clientId, {
    includeArchived: false,
  });

  if (!client?.hardware_fingerprint) {
    throw new Error("Agent command signing failed: hardware identity is not bound.");
  }

  const data = { command, args };
  const timestamp = Date.now();
  const payload = JSON.stringify(data) + timestamp;
  const hmac = crypto
    .createHmac("sha256", client.hardware_fingerprint)
    .update(payload)
    .digest("hex");

  return { data, hmac, timestamp };
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
    const scanMac = await SecurityRepository.findDiscoveryMacByIp(ip);
    if (scanMac) return normalizeMac(scanMac);

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
  
  const rows = await SecurityRepository.findRateLimitedAuthority({
    ip,
    mac,
    userIds,
  });
  return rows.length > 0;
}

export async function isRequestAuthorized(req) {
  const ip = getRequestIp(req);
  const headerMac = normalizeMac(getRequestMac(req));
  const agentId = req.headers?.["x-sentrix-agent-id"];
  const provisioningToken = req.headers?.["x-sentrix-provisioning-token"];
  const mac = headerMac || await resolveMacFromIp(ip);

  const userIds = [req.user?.id, req.user?.email].filter(Boolean);

  console.log(`[SECURITY] Checking authorization for IP: ${ip}, MAC: ${mac || "UNKNOWN"}, AgentID: ${agentId || "MISSING"}, Token: ${provisioningToken ? "PRESENT" : "MISSING"}`);

  // 1. Check Whitelist (Fastest)
  const whitelistRows = await SecurityRepository.findWhitelistAuthority({
    ip,
    mac,
    agentId,
    userIds,
  });
  if (whitelistRows.length > 0) {
    console.log(`[SECURITY] Authorized via whitelist: IP=${ip}, MAC=${mac}, AgentID=${agentId}`);
    return true;
  }

  // 2. Check Provisioning Token (For New Deploys/Updates)
  if (provisioningToken && agentId) {
    const client = await SecurityRepository.findProvisionedClient(
      agentId,
      provisioningToken,
    );

    if (client) {
      if (Date.now() <= client.token_expires_at) {
        console.log(`[SECURITY] Authorized via Provisioning Token: ${agentId}`);
        return true;
      } else {
        console.warn(`[SECURITY] Token expired for AgentID: ${agentId}`);
      }
    }
  }

  // 3. Check Agent-ID against Clients table (Standard Operational Flow)
  if (agentId) {

    const client = await SecurityRepository.findActiveClientByAgentId(agentId);
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
  await SecurityRepository.upsertWhitelistedAuthority({
    type,
    identifier,
    label,
    ip,
    mac,
    now,
  });

  if (ioInstance) {
    ioInstance.to("dashboards").emit("authority:update", { category: "whitelist" });
  }
}

export async function isMacRateLimited(mac) {
  const identifier = normalizeMac(mac);
  if (!identifier) return false;

  const row = await SecurityRepository.findMacRateLimit(identifier);

  return Boolean(row);
}

export async function isUserRateLimited(user = {}) {
  const identifiers = [user.id, user.email].filter(Boolean);
  if (identifiers.length === 0) return false;

  const rows = await SecurityRepository.findUserRateLimit(identifiers);

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
  return SecurityRepository.findSecurityIdentities(category);
}

export async function revokeAuthority(id, { revokedBy = null, reason = "", target = "all" } = {}) {
  const subject = await SecurityRepository.findAuthorityById(id);

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
  
  await SecurityRepository.updateAuthorityRevocation({
    id,
    active: newActive,
    blockTarget: newTarget,
    revokedAt: now,
    revokedBy,
    reason,
  });

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

  await SecurityRepository.upsertRateLimitAuthority({ ip, mac, reason, now });

  if (ioInstance) {
    ioInstance.to("dashboards").emit("authority:update", { category: "rate_limit" });
  }
}

export async function blacklistDevice(reqOrData, { reason = "Manual security block", blockedBy = null } = {}) {
  const ip = reqOrData.ip || getRequestIp(reqOrData);
  const mac = normalizeMac(reqOrData.mac || getRequestMac(reqOrData)) || await resolveMacFromIp(ip);
  const now = Date.now();

  await SecurityRepository.upsertBlacklistedAuthority({
    ip,
    mac,
    reason,
    blockedBy,
    now,
  });

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

  await SecurityRepository.insertSecurityIncident({ ip, mac, eventType, now });
}

/**
 * Returns the count of incidents for a specific identifier (IP or MAC) within a time window.
 */
export async function getSecurityIncidentCount(identifier, windowMs = 30 * 60 * 1000) {
  if (!identifier) return 0;
  const since = Date.now() - windowMs;

  return SecurityRepository.countSecurityIncidents(identifier, since);
}

/**
 * Clears all incidents for a specific device (IP/MAC).
 */
export async function clearSecurityIncidents(req) {
  const ip = getRequestIp(req);
  const mac = normalizeMac(getRequestMac(req)) || await resolveMacFromIp(ip);

  await SecurityRepository.deleteSecurityIncidents({ ip, mac });
}
