import pool from "../../lib/database.js";

export const SettingsRepository = {
  async findByKey(settingKey) {
    const [[row]] = await pool.query(
      "SELECT setting_value, updated_at FROM system_settings WHERE setting_key = ? LIMIT 1",
      [settingKey],
    );
    return row ?? null;
  },

  async upsert(settingKey, value, userId, now) {
    await pool.query(
      `
      INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        setting_value = VALUES(setting_value),
        updated_by = VALUES(updated_by),
        updated_at = VALUES(updated_at)
      `,
      [settingKey, JSON.stringify(value), userId, now],
    );
  },

  async touch(settingKey, now) {
    await pool.query(
      `
      UPDATE system_settings
      SET updated_at = ?
      WHERE setting_key = ?
      `,
      [now, settingKey],
    );
  },
};
