import pool from "../../lib/database.js";

export const AuditRepository = {
  async insertLog({
    actorId,
    actorEmail,
    actorRole,
    action,
    targetType,
    targetId,
    targetLabel,
    ipAddress,
    macAddress,
    details,
    createdAt,
  }) {
    const [result] = await pool.query(
      `
      INSERT INTO audit_logs
        (actor_id, actor_email, actor_role, action, target_type, target_id, target_label, ip_address, mac_address, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        actorId,
        actorEmail,
        actorRole,
        action,
        targetType,
        targetId,
        targetLabel,
        ipAddress,
        macAddress,
        details ? JSON.stringify(details) : null,
        createdAt,
      ],
    );

    return result.insertId;
  },

  async findLogs({ filters, params, limit }) {
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const [rows] = await pool.query(
      `
      SELECT
        audit_logs.*,
        users.id AS registered_user_id,
        users.role AS registered_user_role,
        MAX(b.category) AS authority_category,
        MAX(b.block_target) AS authority_target
      FROM audit_logs
      LEFT JOIN users ON users.email = audit_logs.actor_email
      LEFT JOIN security_authority b
        ON b.active = 1
        AND (
          (b.mac_address IS NOT NULL AND b.mac_address = UPPER(REPLACE(REPLACE(audit_logs.mac_address, ':', ''), '-', '')))
          OR (b.ip_address IS NOT NULL AND b.ip_address = audit_logs.ip_address)
          OR (b.subject_type = 'user' AND b.identifier IN (users.id, audit_logs.actor_email))
        )
      ${where}
      GROUP BY audit_logs.id
      ORDER BY audit_logs.created_at DESC
      LIMIT ${limit}
      `,
      params,
    );

    return rows;
  },

  async findLogById(id) {
    const [[log]] = await pool.query("SELECT * FROM audit_logs WHERE id = ? LIMIT 1", [
      id,
    ]);
    return log ?? null;
  },
};
