import pool from "../../lib/database.js";

export const DiscoveryRepository = {
  async findDeploymentRecords() {
    const [rows] = await pool.query("SELECT * FROM agent_deployment_records");
    return rows;
  },

  async findDeploymentRecordByIp(ip) {
    const [rows] = await pool.query(
      "SELECT * FROM agent_deployment_records WHERE ip = ? LIMIT 1",
      [ip],
    );
    return rows[0] || null;
  },

  async upsertDeploymentRecord({
    ip,
    mac = null,
    hostname = null,
    status = "requested",
    message = "",
    userId = null,
    is_processing = 0,
    operation = "deploy",
    now,
  }) {
    await pool.query(
      `
      INSERT INTO agent_deployment_records
        (ip, mac, hostname, status, message, requested_by, requested_at, updated_at, is_processing, operation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        mac = COALESCE(VALUES(mac), mac),
        hostname = COALESCE(VALUES(hostname), hostname),
        status = VALUES(status),
        message = VALUES(message),
        requested_by = COALESCE(VALUES(requested_by), requested_by),
        updated_at = VALUES(updated_at),
        is_processing = VALUES(is_processing),
        operation = VALUES(operation)
      `,
      [ip, mac, hostname, status, message, userId, now, now, is_processing ? 1 : 0, operation],
    );
  },

  async clearProcessingByIp(ip, status = "success", now = Date.now()) {
    try {
      await pool.query(
        `UPDATE agent_deployment_records SET is_processing = 0, status = ?, updated_at = ? WHERE ip = ?`,
        [status, now, ip]
      );
    } catch (err) {
      // Ignore DB errors during unit tests
    }
  },

  async clearProcessingByIpOrMac(ip, mac, status = "success", now = Date.now()) {
    try {
      const params = [status, now];
      let where = "WHERE 1=0";
      if (ip) {
        where += " OR ip = ?";
        params.push(ip);
      }
      if (mac) {
        const norm = String(mac).toUpperCase().replace(/[^A-F0-9]/g, "");
        if (norm && norm !== "UNKNOWN") {
          where += " OR REPLACE(UPPER(mac), '-', '') = ?";
          params.push(norm);
        }
      }
      await pool.query(
        `UPDATE agent_deployment_records SET is_processing = 0, status = ?, updated_at = ? ${where}`,
        params
      );
    } catch (err) {
      // Ignore DB errors during unit tests
    }
  },

  async upsertScanResults(devices, now) {
    for (const device of devices) {
      await pool.query(
        `
        INSERT INTO discovery_scan_results
          (ip, mac, hostname, vendor, device_type, device_kind, open_ports, agent_status, registered_client_id, deployment_action, last_agent_seen_at, last_scanned_at)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          mac = VALUES(mac),
          hostname = VALUES(hostname),
          vendor = VALUES(vendor),
          device_type = VALUES(device_type),
          device_kind = VALUES(device_kind),
          open_ports = VALUES(open_ports),
          agent_status = VALUES(agent_status),
          registered_client_id = VALUES(registered_client_id),
          deployment_action = VALUES(deployment_action),
          last_agent_seen_at = VALUES(last_agent_seen_at),
          last_scanned_at = VALUES(last_scanned_at)
        `,
        [
          device.ip,
          device.mac,
          device.hostname,
          device.vendor,
          device.device_type,
          device.device_kind,
          JSON.stringify(device.open_ports),
          device.agent_status || "none",
          device.registered_client_id || null,
          device.deployment_action || "not_eligible",
          device.last_agent_seen_at || null,
          now,
        ],
      );
    }
  },

  async findScanResults() {
    const [rows] = await pool.query(
      "SELECT * FROM discovery_scan_results ORDER BY last_scanned_at DESC",
    );
    return rows;
  },
};
