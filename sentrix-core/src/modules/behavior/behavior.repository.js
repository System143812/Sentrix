import pool from "../../lib/database.js";

export const BehaviorRepository = {
  async findDeviceEvents({ filters, params, limit }) {
    const [rows] = await pool.query(
      `
      SELECT *
      FROM event_log
      WHERE ${filters.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT ?
      `,
      [...params, limit],
    );

    return rows;
  },
};
