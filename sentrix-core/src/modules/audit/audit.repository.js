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
        users.role AS registered_user_role
      FROM audit_logs
      LEFT JOIN users ON users.email = audit_logs.actor_email
      ${where}
      LIMIT ${Number(limit) * 5}
      `,
      params,
    );

    return rows
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
      .slice(0, limit);
  },

  async findLogById(id) {
    const [[log]] = await pool.query("SELECT * FROM audit_logs WHERE id = ? LIMIT 1", [
      id,
    ]);
    return log ?? null;
  },
};
