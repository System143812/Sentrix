import pool from "../../lib/database.js";

export const SecurityRepository = {
  async upsertPendingProvisioningClient({
    clientId,
    pendingHostname,
    token,
    expiresAt,
    now,
  }) {
    await pool.query(
      `
      INSERT INTO clients
        (id, agent_id, hostname, ip, mac, os, device_type, client_group, status, metrics, details, provisioning_token, token_expires_at, last_seen_at, created_at, updated_at, archived)
      VALUES
        (?, ?, ?, NULL, NULL, NULL, 'PC', 'Unassigned', 'offline', ?, ?, ?, ?, NULL, ?, ?, 0)
      ON DUPLICATE KEY UPDATE
        provisioning_token = VALUES(provisioning_token),
        token_expires_at = VALUES(token_expires_at),
        updated_at = VALUES(updated_at),
        archived = 0
      `,
      [
        clientId,
        clientId,
        pendingHostname,
        JSON.stringify({}),
        JSON.stringify({}),
        token,
        expiresAt,
        now,
        now,
      ],
    );
  },

  async findClientHardwareBinding(clientId) {
    const [[client]] = await pool.query(
      "SELECT hardware_fingerprint, provisioning_token, token_expires_at FROM clients WHERE id = ?",
      [clientId],
    );
    return client ?? null;
  },

  async updateClientHardwareFingerprint(clientId, secureFingerprint) {
    await pool.query(
      "UPDATE clients SET hardware_fingerprint = ? WHERE id = ?",
      [secureFingerprint, clientId],
    );
  },

  async bindClientHardwareFingerprintWithToken(clientId, secureFingerprint) {
    await pool.query(
      "UPDATE clients SET hardware_fingerprint = ?, provisioning_token = NULL, token_expires_at = NULL WHERE id = ?",
      [secureFingerprint, clientId],
    );
  },

  async findClientHardwareFingerprint(clientId, { includeArchived = true } = {}) {
    const sql = includeArchived
      ? "SELECT hardware_fingerprint FROM clients WHERE id = ?"
      : "SELECT hardware_fingerprint FROM clients WHERE id = ? AND archived = 0 LIMIT 1";
    const [[client]] = await pool.query(sql, [clientId]);
    return client ?? null;
  },

  async findDiscoveryMacByIp(ip) {
    const [[scan]] = await pool.query(
      "SELECT mac FROM discovery_scan_results WHERE ip = ? AND mac != 'Unknown' LIMIT 1",
      [ip],
    );
    return scan?.mac ?? null;
  },

  async findRateLimitedAuthority({ ip, mac, userIds }) {
    const [rows] = await pool.query(
      `
      SELECT id FROM security_authority
      WHERE category IN ('rate_limit', 'blacklist') AND active = 1
        AND (
          (ip_address = ? AND (block_target = 'ip' OR block_target = 'all'))
          OR (mac_address = ? AND (block_target = 'mac' OR block_target = 'all'))
          OR (subject_type = 'ip' AND identifier = ? AND (block_target = 'ip' OR block_target = 'all'))
          OR (subject_type = 'mac' AND identifier = ? AND (block_target = 'mac' OR block_target = 'all'))
          OR (subject_type = 'user' AND identifier IN (?))
        )
      LIMIT 1
      `,
      [ip, mac, ip, mac, userIds.length > 0 ? userIds : ["__NONE__"]],
    );
    return rows;
  },

  async findWhitelistAuthority({ ip, mac, agentId, userIds }) {
    const [rows] = await pool.query(
      `
      SELECT id, category FROM security_authority
      WHERE category = 'whitelist' AND active = 1
        AND (
          (ip_address = ?)
          OR (mac_address = ?)
          OR (subject_type = 'agent_id' AND identifier = ?)
          OR (subject_type = 'ip' AND identifier = ?)
          OR (subject_type = 'mac' AND identifier = ?)
          OR (subject_type = 'user' AND identifier IN (?))
        )
      LIMIT 1
      `,
      [ip, mac, agentId, ip, mac, userIds.length > 0 ? userIds : ["__NONE__"]],
    );
    return rows;
  },

  async findProvisionedClient(agentId, provisioningToken) {
    const [[client]] = await pool.query(
      "SELECT id, token_expires_at FROM clients WHERE id = ? AND provisioning_token = ? LIMIT 1",
      [agentId, provisioningToken],
    );
    return client ?? null;
  },

  async findActiveClientByAgentId(agentId) {
    const [[client]] = await pool.query(
      "SELECT id, hostname FROM clients WHERE agent_id = ? AND archived = 0 LIMIT 1",
      [agentId],
    );
    return client ?? null;
  },

  async upsertWhitelistedAuthority({ type, identifier, label, ip, mac, now }) {
    await pool.query(
      `
      INSERT INTO security_authority (subject_type, identifier, label, category, ip_address, mac_address, recorded_at, active)
      VALUES (?, ?, ?, 'whitelist', ?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE 
        active = 1, 
        category = 'whitelist', 
        label = VALUES(label),
        ip_address = IFNULL(VALUES(ip_address), ip_address),
        mac_address = IFNULL(VALUES(mac_address), mac_address)
      `,
      [type, identifier, label, ip !== "127.0.0.1" ? ip : null, mac, now],
    );
  },

  async findMacRateLimit(mac) {
    const [[row]] = await pool.query(
      `
      SELECT id
      FROM security_authority
      WHERE mac_address = ?
        AND category = 'rate_limit'
        AND (block_target = 'mac' OR block_target = 'all')
        AND active = 1
      LIMIT 1
      `,
      [mac],
    );
    return row ?? null;
  },

  async findUserRateLimit(identifiers) {
    const [rows] = await pool.query(
      `
      SELECT id
      FROM security_authority
      WHERE subject_type = 'user'
        AND identifier IN (?)
        AND category = 'rate_limit'
        AND active = 1
      LIMIT 1
      `,
      [identifiers],
    );
    return rows;
  },

  async findSecurityIdentities(category) {
    const [rows] = await pool.query(
      `
      SELECT id, subject_type, identifier, label, role, reason, added_by, recorded_at, source_log_id, category, ip_address, mac_address, block_target
      FROM security_authority
      WHERE active = 1 AND category = ?
      ORDER BY recorded_at DESC
      `,
      [category],
    );
    return rows;
  },

  async findAuthorityById(id) {
    const [[subject]] = await pool.query(
      "SELECT * FROM security_authority WHERE id = ? LIMIT 1",
      [id],
    );
    return subject ?? null;
  },

  async updateAuthorityRevocation({ id, active, blockTarget, revokedAt, revokedBy, reason }) {
    await pool.query(
      `
      UPDATE security_authority
      SET active = ?,
          block_target = ?,
          revoked_at = ?,
          revoked_by = ?,
          revoke_reason = ?
      WHERE id = ?
      `,
      [active, blockTarget, revokedAt, revokedBy, reason, id],
    );
  },

  async upsertRateLimitAuthority({ ip, mac, reason, now }) {
    await pool.query(
      `
      INSERT INTO security_authority (subject_type, identifier, label, category, ip_address, mac_address, block_target, reason, recorded_at, active)
      VALUES ('ip', ?, ?, 'rate_limit', ?, ?, 'all', ?, ?, 1)
      ON DUPLICATE KEY UPDATE 
        active = 1, 
        block_target = 'all',
        category = 'rate_limit', 
        reason = VALUES(reason), 
        recorded_at = VALUES(recorded_at),
        revoked_at = NULL,
        revoked_by = NULL
      `,
      [ip, `Rate Limited Device: ${ip}`, ip !== "127.0.0.1" ? ip : null, mac, reason, now],
    );
  },

  async upsertBlacklistedAuthority({ ip, mac, reason, blockedBy, now }) {
    await pool.query(
      `
      INSERT INTO security_authority (subject_type, identifier, label, category, ip_address, mac_address, block_target, reason, added_by, recorded_at, active)
      VALUES ('ip', ?, ?, 'blacklist', ?, ?, 'all', ?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE 
        active = 1, 
        block_target = 'all',
        category = 'blacklist', 
        reason = VALUES(reason), 
        added_by = VALUES(added_by),
        recorded_at = VALUES(recorded_at),
        revoked_at = NULL,
        revoked_by = NULL
      `,
      [
        ip,
        `Blacklisted Device: ${ip}`,
        ip !== "127.0.0.1" ? ip : null,
        mac,
        reason,
        blockedBy,
        now,
      ],
    );
  },

  async insertSecurityIncident({ ip, mac, eventType, now }) {
    await pool.query(
      "INSERT INTO security_incidents (ip_address, mac_address, event_type, created_at) VALUES (?, ?, ?, ?)",
      [ip, mac, eventType, now],
    );
  },

  async countSecurityIncidents(identifier, since) {
    const [[{ count }]] = await pool.query(
      `
      SELECT COUNT(*) as count FROM security_incidents
      WHERE (ip_address = ? OR mac_address = ?)
        AND created_at >= ?
      `,
      [identifier, identifier, since],
    );
    return count || 0;
  },

  async deleteSecurityIncidents({ ip, mac }) {
    await pool.query(
      "DELETE FROM security_incidents WHERE ip_address = ? OR mac_address = ?",
      [ip, mac],
    );
  },
};
