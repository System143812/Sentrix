import pool from "../lib/database.js";

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
  return (
    req?.headers?.["x-client-mac"] ||
    req?.headers?.["x-forwarded-mac"] ||
    req?.body?.macAddress ||
    req?.body?.mac ||
    null
  );
}

export async function isMacBlocked(mac) {
  const identifier = normalizeMac(mac);
  if (!identifier) return false;

  const [[row]] = await pool.query(
    `
    SELECT id
    FROM blocked_subjects
    WHERE subject_type = 'mac'
      AND identifier = ?
      AND active = 1
    LIMIT 1
    `,
    [identifier],
  );

  return Boolean(row);
}

export async function isUserBlocked(user = {}) {
  const identifiers = [user.id, user.email].filter(Boolean);
  if (identifiers.length === 0) return false;

  const [rows] = await pool.query(
    `
    SELECT id
    FROM blocked_subjects
    WHERE subject_type = 'user'
      AND identifier IN (?)
      AND active = 1
    LIMIT 1
    `,
    [identifiers],
  );

  return rows.length > 0;
}

export async function assertRequestAllowed(req) {
  const mac = getRequestMac(req);
  if (await isMacBlocked(mac)) {
    const error = new Error("Failed");
    error.statusCode = 403;
    throw error;
  }
}

export async function blockAuditSubject(logId, { reason = "", blockedBy = null } = {}) {
  const [[log]] = await pool.query(
    "SELECT * FROM audit_logs WHERE id = ? LIMIT 1",
    [logId],
  );

  if (!log) {
    throw new Error("Audit log not found.");
  }

  const [[registeredUser]] = log.actor_email
    ? await pool.query(
        "SELECT id, email, role FROM users WHERE email = ? LIMIT 1",
        [log.actor_email],
      )
    : [[]];

  const now = Date.now();
  const subjects = [];
  const normalizedMac = normalizeMac(log.mac_address);

  if (normalizedMac) {
    subjects.push({
      type: "mac",
      identifier: normalizedMac,
      label: formatMac(normalizedMac),
      role: registeredUser?.role || null,
    });
  }

  if (registeredUser?.id) {
    subjects.push({
      type: "user",
      identifier: registeredUser.id,
      label: registeredUser.email,
      role: registeredUser.role,
    });
  }

  if (!subjects.length && log.actor_email) {
    subjects.push({
      type: "user",
      identifier: log.actor_email,
      label: log.actor_email,
      role: log.actor_role || null,
    });
  }

  if (!subjects.length) {
    throw new Error("This log does not contain a blockable user or MAC address.");
  }

  for (const subject of subjects) {
    await pool.query(
      `
      INSERT INTO blocked_subjects
        (subject_type, identifier, label, role, reason, source_log_id, blocked_by, blocked_at, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE
        label = VALUES(label),
        role = VALUES(role),
        reason = VALUES(reason),
        source_log_id = VALUES(source_log_id),
        blocked_by = VALUES(blocked_by),
        blocked_at = VALUES(blocked_at),
        active = 1
      `,
      [
        subject.type,
        subject.identifier,
        subject.label,
        subject.role,
        reason,
        log.id,
        blockedBy,
        now,
      ],
    );
  }

  return {
    blocked: subjects,
    registeredUser: registeredUser
      ? {
          id: registeredUser.id,
          email: registeredUser.email,
          role: registeredUser.role,
        }
      : null,
  };
}
