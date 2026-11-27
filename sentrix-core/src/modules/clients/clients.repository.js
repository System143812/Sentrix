import pool from "../../lib/database.js";

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
        c.id, c.agent_id, c.hostname, c.ip, c.mac, c.os, c.device_type,
        c.client_group AS \`group\`, c.status, c.metrics, c.details,
        c.archived, c.hardware_fingerprint, c.provisioning_token,
        c.token_expires_at, c.agent_version, c.last_seen_at, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM client_peripheral_inventory p WHERE p.client_id = c.id AND p.status = 'missing') AS missing_peripherals
      FROM clients c
      WHERE c.archived = 0
    `.trim();

    const [rows] = await pool.query(sql);
    return rows.map(normalizeClient).sort((a, b) => {
      const statusCmp = (a.status || "").localeCompare(b.status || "");
      if (statusCmp !== 0) return statusCmp;
      return (a.hostname || "").localeCompare(b.hostname || "");
    });
  },

  async findAllIncludingArchived() {
    const sql = `
      SELECT
        c.id, c.agent_id, c.hostname, c.ip, c.mac, c.os, c.device_type,
        c.client_group AS \`group\`, c.status, c.metrics, c.details,
        c.archived, c.hardware_fingerprint, c.provisioning_token,
        c.token_expires_at, c.agent_version, c.last_seen_at, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM client_peripheral_inventory p WHERE p.client_id = c.id AND p.status = 'missing') AS missing_peripherals
      FROM clients c
    `.trim();

    const [rows] = await pool.query(sql);
    return rows.map(normalizeClient).sort((a, b) => {
      const statusCmp = (a.status || "").localeCompare(b.status || "");
      if (statusCmp !== 0) return statusCmp;
      return (a.hostname || "").localeCompare(b.hostname || "");
    });
  },

  async findById(id) {
    const sql = `
      SELECT
        c.id, c.agent_id, c.hostname, c.ip, c.mac, c.os, c.device_type,
        c.client_group AS \`group\`, c.status, c.metrics, c.details,
        c.archived, c.hardware_fingerprint, c.provisioning_token,
        c.token_expires_at, c.agent_version, c.last_seen_at, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM client_peripheral_inventory p WHERE p.client_id = c.id AND p.status = 'missing') AS missing_peripherals
      FROM clients c
      WHERE c.id = ? LIMIT 1
    `.trim();
    const [rows] = await pool.query(sql, [id]);
    return normalizeClient(rows[0] ?? null);
  },

  async upsert(id, clientData, now) {
    const existing = await this.findById(id);
    const activePath = clientData.details?.activePath || existing?.details?.activePath;
    const detailsToSave = {
      ...(clientData.details || {}),
      ...(activePath ? { activePath } : {})
    };

    await pool.query(
      `
      INSERT INTO clients
        (id, agent_id, hostname, ip, mac, os, device_type, client_group, status, metrics, details, agent_version, last_seen_at, updated_at, created_at, archived)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, 'online', ?, ?, ?, ?, ?, ?, 0)
      ON DUPLICATE KEY UPDATE
        agent_id = VALUES(agent_id),
        hostname = VALUES(hostname),
        ip = VALUES(ip),
        mac = VALUES(mac),
        os = VALUES(os),
        device_type = VALUES(device_type),
        metrics = COALESCE(VALUES(metrics), metrics),
        details = JSON_SET(
          COALESCE(clients.details, '{}'),
          '$.activePath',
          COALESCE(
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(VALUES(details), '$.activePath')), 'NULL'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(clients.details, '$.activePath')), 'NULL'),
            'C:/Users/Public/Desktop'
          )
        ),
        agent_version = COALESCE(VALUES(agent_version), agent_version),
        status = 'online',
        last_seen_at = VALUES(last_seen_at),
        updated_at = VALUES(updated_at),
        archived = 0
      `,
      [
        id,
        clientData.agentId || id,
        clientData.hostname,
        clientData.ip,
        clientData.mac,
        clientData.os,
        clientData.device_type || "computer",
        clientData.group || "Unassigned",
        JSON.stringify(clientData.metrics || {}),
        JSON.stringify(detailsToSave),
        clientData.version || null,
        now,
        now,
        now,
      ],
    );
  },

  async updateActivePath(id, path, now) {
    const client = await this.findById(id);
    if (!client) return false;
    const details = client.details || {};
    details.activePath = path;
    const [rows] = await pool.query(
      `UPDATE clients SET details = ?, updated_at = ? WHERE id = ? AND archived = 0`,
      [JSON.stringify(details), now, id]
    );
    return rows.affectedRows > 0;
  },

  async updateMetrics(id, metrics, now, details = null) {
    let resolvedDetails = details;
    if (details) {
      const existing = await this.findById(id);
      const activePath = details.activePath || existing?.details?.activePath || 'C:/Users/Public/Desktop';
      resolvedDetails = {
        ...details,
        activePath,
      };
    }
    const params = [JSON.stringify(metrics), now, now];
    let detailsSql = "";

    if (resolvedDetails) {
      detailsSql = ", details = ?";
      params.push(JSON.stringify(resolvedDetails));
    }

    params.push(id);

    const [rows] = await pool.query(
      `
      UPDATE clients
      SET metrics = ?,
          updated_at = ?,
          last_seen_at = ?
          ${detailsSql}
      WHERE id = ? AND archived = 0
      `,
      params,
    );
    return rows.affectedRows > 0;
  },

  async updateStatus(id, now, metrics = null) {
    const params = [now, now];
    let metricsSql = "";

    if (metrics) {
      metricsSql = ", metrics = ?";
      params.push(JSON.stringify(metrics));
    }

    params.push(id);

    const [rows] = await pool.query(
      `
      UPDATE clients
      SET updated_at = ?,
          last_seen_at = ?
          ${metricsSql}
      WHERE id = ? AND archived = 0
      `,
      params,
    );
    return rows.affectedRows > 0;
  },

  async updateClientStatusOnly(id, status, now) {
    const [rows] = await pool.query(
      `
      UPDATE clients
      SET status = ?,
          updated_at = ?
      WHERE id = ? AND archived = 0
      `,
      [status, now, id],
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

  async archive(id, _now) {
    const [rows] = await pool.query(
      `DELETE FROM clients WHERE id = ?`,
      [id],
    );
    return rows.affectedRows > 0;
  },

  async countMissingPeripherals() {
    const [[{ total_missing }]] = await pool.query(
      "SELECT COUNT(*) as total_missing FROM client_peripheral_inventory WHERE status = 'missing'",
    );
    return total_missing || 0;
  },

  async deleteStalePendingClients(now) {
    try {
      // 24 hours threshold for ghost records created without a token or stuck indefinitely
      const maxAgeThreshold = now - (24 * 60 * 60 * 1000);
      const [result] = await pool.query(
        `DELETE FROM clients
         WHERE hardware_fingerprint IS NULL
           AND (
             (provisioning_token IS NOT NULL AND token_expires_at < ?)
             OR
             (created_at < ?)
           )`,
        [now, maxAgeThreshold]
      );
      return result.affectedRows || 0;
    } catch (err) {
      console.error("[ClientRepository] deleteStalePendingClients error:", err.message);
      return 0;
    }
  }
};
