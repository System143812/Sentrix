import pool from "../lib/database.js";
import { v4 as uuidv4 } from "uuid";

export async function getAllGroups() {
  const [rows] = await pool.query(
    `SELECT * FROM client_groups ORDER BY name ASC`,
  );
  return rows;
}

export async function getGroupById(id) {
  const [rows] = await pool.query(
    `SELECT * FROM client_groups WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function createGroup({ name, description }) {
  if (!name || !name.trim()) {
    throw new Error("Group name is required.");
  }

  const id = uuidv4();
  const now = Date.now();

  await pool.query(
    `INSERT INTO client_groups (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [id, name.trim(), description || "", now, now],
  );

  return getGroupById(id);
}

export async function deleteGroup(id) {
  const [result] = await pool.query(`DELETE FROM client_groups WHERE id = ?`, [
    id,
  ]);
  return result.affectedRows > 0;
}

export async function updateGroup(id, { name, description }) {
  if (!name || !name.trim()) {
    throw new Error("Group name is required.");
  }

  const now = Date.now();
  await pool.query(
    `UPDATE client_groups SET name = ?, description = ?, updated_at = ? WHERE id = ?`,
    [name.trim(), description || "", now, id],
  );

  return getGroupById(id);
}

export async function resetClientsGroup(name) {
  await pool.query(
    `UPDATE clients SET client_group = 'Unassigned' WHERE client_group = ?`,
    [name],
  );
}

export async function renameClientsGroup(oldName, newName) {
  await pool.query(`UPDATE clients SET client_group = ? WHERE client_group = ?`, [
    newName,
    oldName,
  ]);
}
