import pool from "../../lib/database.js";

const SAFE_USER_FIELDS = "id, email, role, active, created_at, updated_at";

export const UsersRepository = {
  async findByEmail(email) {
    const [rows] = await pool.query(
      `SELECT ${SAFE_USER_FIELDS} FROM users WHERE email = ? LIMIT 1`,
      [email],
    );
    return rows[0] ?? null;
  },

  async findForAuth(email) {
    const [rows] = await pool.query(
      "SELECT * FROM users WHERE email = ? LIMIT 1",
      [email],
    );
    return rows[0] ?? null;
  },

  async findById(id) {
    const [rows] = await pool.query(
      `SELECT ${SAFE_USER_FIELDS} FROM users WHERE id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ?? null;
  },

  async findRawById(id) {
    const [rows] = await pool.query(
      "SELECT * FROM users WHERE id = ? LIMIT 1",
      [id],
    );
    return rows[0] ?? null;
  },

  async findAll() {
    const [rows] = await pool.query(
      `SELECT ${SAFE_USER_FIELDS} FROM users ORDER BY email ASC`,
    );
    return rows;
  },

  async count() {
    const [rows] = await pool.query("SELECT COUNT(*) AS count FROM users");
    return rows[0]?.count ?? 0;
  },

  async insert({ id, email, passwordHash, role, now }) {
    await pool.query(
      "INSERT INTO users (id, email, password_hash, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
      [id, email, passwordHash, role, now, now],
    );
  },

  async deleteById(id) {
    const [result] = await pool.query("DELETE FROM users WHERE id = ?", [id]);
    return result.affectedRows > 0;
  },

  async updatePassword(id, passwordHash, now) {
    await pool.query(
      "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
      [passwordHash, now, id],
    );
  },
};
