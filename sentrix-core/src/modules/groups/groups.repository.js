import pool from "../../lib/database.js";

export const GroupsRepository = {
  async findAll() {
    const [rows] = await pool.query(
      "SELECT * FROM client_groups ORDER BY name ASC",
    );
    return rows;
  },

  async findById(id) {
    const [rows] = await pool.query(
      "SELECT * FROM client_groups WHERE id = ? LIMIT 1",
      [id],
    );
    return rows[0] ?? null;
  },

  async insert({ id, name, description, now }) {
    await pool.query(
      "INSERT INTO client_groups (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [id, name, description, now, now],
    );
  },

  async update(id, { name, description, now }) {
    await pool.query(
      "UPDATE client_groups SET name = ?, description = ?, updated_at = ? WHERE id = ?",
      [name, description, now, id],
    );
  },

  async deleteById(id) {
    const [result] = await pool.query(
      "DELETE FROM client_groups WHERE id = ?",
      [id],
    );
    return result.affectedRows > 0;
  },

  async resetClientsGroup(name) {
    await pool.query(
      "UPDATE clients SET client_group = 'Unassigned' WHERE client_group = ?",
      [name],
    );
  },

  async renameClientsGroup(oldName, newName) {
    await pool.query(
      "UPDATE clients SET client_group = ? WHERE client_group = ?",
      [newName, oldName],
    );
  },
};
