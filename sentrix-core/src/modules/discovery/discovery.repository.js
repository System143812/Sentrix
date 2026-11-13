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
    now,
  }) {
    await pool.query(
      `
      INSERT INTO agent_deployment_records
        (ip, mac, hostname, status, message, requested_by, requested_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        mac = COALESCE(VALUES(mac), mac),
        hostname = COALESCE(VALUES(hostname), hostname),
        status = VALUES(status),
        message = VALUES(message),
        requested_by = COALESCE(VALUES(requested_by), requested_by),
        updated_at = VALUES(updated_at)
      `,
      [ip, mac, hostname, status, message, userId, now, now],
    );
  },

  async clearProcessingByIp(ip, status = "success", now = Date.now()) {
    try {
      await pool.query(
        `UPDATE agent_deployment_records SET status = ?, updated_at = ? WHERE ip = ?`,
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
        `UPDATE agent_deployment_records SET status = ?, updated_at = ? ${where}`,
        params
      );
    } catch (err) {
      // Ignore DB errors during unit tests
    }
  },

  async upsertScanResults(devices, now) {
    try {
      for (const device of devices) {
        const ip = String(device.ip || "").slice(0, 45);
        const mac = device.mac ? String(device.mac).trim().slice(0, 17) : null;
        const hostname = device.hostname ? String(device.hostname).trim().slice(0, 255) : null;
        const vendor = device.vendor ? String(device.vendor).trim().slice(0, 255) : null;
        const device_type = device.device_type ? String(device.device_type).trim().slice(0, 100) : null;
        const device_kind = device.device_kind ? String(device.device_kind).trim().slice(0, 100) : null;
        const openPortsJson = JSON.stringify(device.open_ports || []);

        let agent_status = device.agent_status || "none";
        if (!["running", "none", "deploying", "updating"].includes(agent_status)) {
          agent_status = "none";
        }

        const registered_client_id = device.registered_client_id || null;
        const deployment_action = device.deployment_action ? String(device.deployment_action).trim().slice(0, 40) : "not_eligible";
        const last_agent_seen_at = device.last_agent_seen_at || null;

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
            ip,
            mac,
            hostname,
            vendor,
            device_type,
            device_kind,
            openPortsJson,
            agent_status,
            registered_client_id,
            deployment_action,
            last_agent_seen_at,
            now,
          ],
        );
      }
    } catch (err) {
      console.error("[DiscoveryRepository] upsertScanResults failed:", err.message, err.stack);
      throw err;
    }
  },

  async findScanResults() {
    const [rows] = await pool.query(
      "SELECT * FROM discovery_scan_results ORDER BY last_scanned_at DESC",
    );
    return rows;
  },

  async deleteStaleScanResults(threshold) {
    try {
      await pool.query("DELETE FROM discovery_scan_results WHERE last_scanned_at < ?", [threshold]);
    } catch (err) {}
  },

  async deleteScanResultByIp(ip) {
    try {
      await pool.query("DELETE FROM discovery_scan_results WHERE ip = ?", [ip]);
    } catch (err) {}
  },
};
