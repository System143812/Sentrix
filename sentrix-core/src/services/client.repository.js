import pool from "../lib/database.js";

function normalizeClient(client) {
  if (!client) return client;

  ["metrics", "details"].forEach((key) => {
    if (typeof client[key] === "string") {
      try {
        client[key] = JSON.parse(client[key]);
      } catch {
        client[key] = {};
      }
    }
  });

  return client;
}

export const ClientRepository = {
  async findAll() {
    const sql = `
      SELECT 
        id, agent_id, hostname, ip, mac, os, device_type, 
        client_group AS \`group\`, status, metrics, details, 
        archived, hardware_fingerprint, provisioning_token, 
        token_expires_at, agent_version, last_seen_at, created_at, updated_at 
      FROM clients 
      WHERE archived = 0 
      ORDER BY status ASC, hostname ASC
    `.trim();
    
    const [rows] = await pool.query(sql);
    return rows.map(normalizeClient);
  },

  async findById(id) {
    const [rows] = await pool.query(
      `SELECT id, agent_id, hostname, ip, mac, os, device_type, client_group AS \`group\`, status, metrics, details, archived, hardware_fingerprint, provisioning_token, token_expires_at, agent_version, last_seen_at, created_at, updated_at FROM clients WHERE id = ? LIMIT 1`,
      [id],
    );
    return normalizeClient(rows[0] ?? null);
  },

  async upsert(id, clientData, now) {
    await pool.query(
      `
      INSERT INTO clients
        (id, agent_id, hostname, ip, mac, os, device_type, client_group, status, metrics, details, agent_version, last_seen_at, updated_at, created_at, archived)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, 'online', ?, ?, ?, ?, ?, ?, 0)
      ON DUPLICATE KEY UPDATE
        hostname = VALUES(hostname),
        ip = VALUES(ip),
        mac = VALUES(mac),
        os = VALUES(os),
        device_type = VALUES(device_type),
        metrics = COALESCE(VALUES(metrics), metrics),
        details = COALESCE(VALUES(details), details),
        agent_version = COALESCE(VALUES(agent_version), agent_version),
        status = 'online',
        last_seen_at = VALUES(last_seen_at),
        updated_at = VALUES(updated_at),
        archived = 0
      `,
      [
        id,
        id,
        clientData.hostname,
        clientData.ip,
        clientData.mac,
        clientData.os,
        clientData.device_type || "computer",
        clientData.group || "Unassigned",
        JSON.stringify(clientData.metrics || {}),
        JSON.stringify(clientData.details || {}),
        clientData.version || null,
        now,
        now,
        now,
      ],
    );
  },

  async updateMetrics(id, metrics, status, now, details = null) {
    const params = [JSON.stringify(metrics), status, now, now];
    let detailsSql = "";

    if (details) {
      detailsSql = ", details = ?";
      params.push(JSON.stringify(details));
    }

    params.push(id);

    const [rows] = await pool.query(
      `
      UPDATE clients
      SET metrics = ?,
          status = ?,
          updated_at = ?,
          last_seen_at = ?
          ${detailsSql}
      WHERE id = ? AND archived = 0
      `,
      params,
    );
    return rows.affectedRows > 0;
  },

  async updateStatus(id, status, now, metrics = null) {
    const params = [status, now, now];
    let metricsSql = "";

    if (metrics) {
      metricsSql = ", metrics = ?";
      params.push(JSON.stringify(metrics));
    }

    params.push(id);

    const [rows] = await pool.query(
      `
      UPDATE clients
      SET status = ?,
          updated_at = ?,
          last_seen_at = ?
          ${metricsSql}
      WHERE id = ? AND archived = 0
      `,
      params,
    );
    return rows.affectedRows > 0;
  },

  async updateGroup(id, group, now) {
    const [rows] = await pool.query(
      `
      UPDATE clients
      SET client_group = ?,
          updated_at = ?
      WHERE id = ? AND archived = 0
      `,
      [group || "Unassigned", now, id],
    );
    return rows.affectedRows > 0;
  },

  async archive(id, now) {
    const [rows] = await pool.query(
      `
      UPDATE clients
      SET archived = 1,
          updated_at = ?
      WHERE id = ?
      `,
      [now, id],
    );
    return rows.affectedRows > 0;
  },

  async countMissingPeripherals() {
    const [[{ total_missing }]] = await pool.query(
      "SELECT COUNT(*) as total_missing FROM client_peripheral_inventory WHERE status = 'missing'",
    );
    return total_missing || 0;
  }
};
