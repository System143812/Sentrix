import bcrypt from "bcryptjs";
import pool from "../lib/database.js";
import { v4 as uuidv4 } from "uuid";

export async function getUserByEmail(email) {
  const [rows] = await pool.query(
    `SELECT id, email, role, active, created_at, updated_at FROM users WHERE email = ? LIMIT 1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function getUserForAuth(email) {
  const [rows] = await pool.query(
    `SELECT * FROM users WHERE email = ? LIMIT 1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function getUserById(id) {
  const [rows] = await pool.query(
    `SELECT id, email, role, active, created_at, updated_at FROM users WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getAllAdmins() {
  const [rows] = await pool.query(
    `SELECT id, email, role, active, created_at, updated_at FROM users ORDER BY email ASC`,
  );
  return rows;
}

export async function countUsers() {
  const [rows] = await pool.query(`SELECT COUNT(*) AS count FROM users`);
  return rows[0]?.count ?? 0;
}

export async function createUser({ email, password, role }) {
  if (!email || !password) {
    throw new Error("Email and password are required.");
  }

  if (!["admin", "network_admin"].includes(role)) {
    throw new Error("Invalid user role.");
  }

  const id = uuidv4();
  const now = Date.now();
  const passwordHash = await bcrypt.hash(password, 10);

  await pool.query(
    `INSERT INTO users (id, email, password_hash, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`,
    [id, email, passwordHash, role, now, now],
  );

  return getUserById(id);
}

export async function deleteUser(id) {
  const [result] = await pool.query(`DELETE FROM users WHERE id = ?`, [id]);
  return result.affectedRows > 0;
}

export async function validatePassword(user, password) {
  return bcrypt.compare(password, user.password_hash);
}

export async function seedInitialAdmin({ email, password }) {
  const total = await countUsers();
  if (total > 0) {
    return null;
  }

  const id = uuidv4();
  const now = Date.now();
  const passwordHash = await bcrypt.hash(password, 10);

  await pool.query(
    `INSERT INTO users (id, email, password_hash, role, active, created_at, updated_at) VALUES (?, ?, ?, 'network_admin', 1, ?, ?)`,
    [id, email, passwordHash, now, now],
  );

  return getUserById(id);
}
