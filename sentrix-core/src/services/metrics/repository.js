import pool from "../../lib/database.js";
import { DnsService } from "./dns.service.js";
import { withDeadlockRetry, toNumber, toJson } from "../../utils/db.utils.js";

const ACTIVE_CONNECTION_GRACE_WINDOW_MS = Number(
  process.env.ACTIVE_CONNECTION_GRACE_WINDOW_MS || 30000,
);

export async function saveProcesses(clientId, processes = [], recordedAt) {
  if (!Array.isArray(processes) || processes.length === 0) return;

  return withDeadlockRetry(async () => {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // WRITE-ONLY INGESTION: We perform a bulk insert of the new snapshot.
      // Immediate DELETEs are removed to prevent Next-Key and Gap locks (the source of deadlocks).
      const values = processes.map((p) => [
        clientId,
        toNumber(p.pid),
        p.name || null,
        p.user || null,
        toNumber(p.cpu, 0),
        toNumber(p.memoryMb, 0),
        p.command || null,
        recordedAt,
      ]);

      await connection.query(
        `
        INSERT INTO client_processes
          (client_id, pid, name, user, cpu_percent, memory_mb, command, recorded_at)
        VALUES ?
        `,
        [values],
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  });
}

export async function saveNetworkActivity(clientId, activity = {}, recordedAt) {
  const { activeConnections = [], dnsCache = [], activityChanged = true } = activity;

  return withDeadlockRetry(async () => {
    // OPTIMIZATION: If no activity changed, just refresh the TTL for existing live connections
    if (!activityChanged) {
      await pool.query(
        `UPDATE client_network_connections SET recorded_at = ? WHERE client_id = ?`,
        [recordedAt, clientId]
      );
    } else {
      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction();

        if (activeConnections.length > 0) {
          const connValues = activeConnections.map(conn => [
            clientId,
            conn.protocol || "TCP",
            conn.localAddress || null,
            toNumber(conn.localPort),
            conn.peerAddress || "",
            toNumber(conn.peerPort),
            conn.state || "ESTABLISHED",
            conn.process || "System",
            conn.domain || conn.peerAddress || "",
            conn.category || "App",
            toNumber(conn.count, 1),
            recordedAt
          ]);

          await connection.query(
            `
            INSERT INTO client_network_connections
              (client_id, protocol, local_address, local_port, remote_address, remote_port, state, process_name, domain, category, connection_count, recorded_at)
            VALUES ?
            ON DUPLICATE KEY UPDATE
              recorded_at = VALUES(recorded_at),
              connection_count = VALUES(connection_count),
              state = VALUES(state),
              category = VALUES(category),
              remote_address = VALUES(remote_address)
            `,
            [connValues]
          );

          // PERSISTENT HISTORY: Batch Upsert into activity history
          const historyValues = activeConnections
            .filter(c => (c.domain || c.peerAddress) && !(c.domain || c.peerAddress).includes("localhost"))
            .map(c => [
              clientId,
              c.domain || c.peerAddress,
              c.process || "System",
              c.category || "App",
              c.fullDomain || null,
              recordedAt,
              recordedAt,
              1 // hit_count
            ]);

          if (historyValues.length > 0) {
            await connection.query(
              `
              INSERT INTO client_activity_history
                (client_id, domain, process_name, category, full_domain, first_seen_at, last_seen_at, hit_count)
              VALUES ?
              ON DUPLICATE KEY UPDATE
                last_seen_at = VALUES(last_seen_at),
                hit_count = hit_count + 1,
                process_name = COALESCE(VALUES(process_name), process_name),
                category = VALUES(category),
                full_domain = COALESCE(VALUES(full_domain), full_domain)
              `,
              [historyValues]
            );
          }
        }

        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    }

    // Background tasks (non-transactional) - only if activity changed or we have DNS cache
    const uniqueIps = new Set();
    if (activityChanged) {
      for (const conn of activeConnections) {
        if (conn.peerAddress && !conn.peerAddress.includes(":") && conn.peerAddress !== "127.0.0.1") {
          uniqueIps.add(conn.peerAddress);
        }
      }
    }
    
    for (const ip of uniqueIps) {
      DnsService.resolveIp(ip).catch(() => {});
    }

    const validDnsCache = dnsCache.filter((dns) => dns.domain && dns.resolvedAddress);

    if (validDnsCache.length > 0) {
      const dnsValues = validDnsCache.map(dns => [clientId, dns.domain, dns.resolvedAddress, recordedAt]);
      await pool.query(
        `
        INSERT INTO client_dns_logs
          (client_id, domain, resolved_address, recorded_at)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          recorded_at = VALUES(recorded_at)
        `,
        [dnsValues],
      );

      for (const dns of validDnsCache) {
        DnsService.storeResolution(dns.resolvedAddress, {
          hostname: dns.domain,
          asn: null,
          organization: null,
          serviceLabel: dns.domain,
          forwardVerified: false,
          isCloud: false,
        }, "local_cache").catch(() => {});
      }
    }
  });
}
export async function saveMetricSample(clientId, normalized, rawMetrics, timestamp) {
  const recordedAt = timestamp;
  const createdAt = Date.now();

  return withDeadlockRetry(async () => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [sampleResult] = await connection.query(
        `
        INSERT INTO client_metric_samples
          (client_id, schema_version, recorded_at, cpu_usage, ram_usage, disk_usage, uptime_seconds, raw_metrics, created_at)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          clientId,
          normalized.schemaVersion,
          recordedAt,
          normalized.cpu,
          normalized.ram,
          normalized.disk,
          normalized.uptime,
          toJson(rawMetrics),
          createdAt,
        ],
      );

      const sampleId = sampleResult.insertId;
      const system = normalized.system || {};
      const os = system.os || {};
      const network = normalized.network || {};
      const temperature = normalized.temperature || {};

      // Sequential inserts within same transaction for stability
      await connection.query("INSERT INTO client_metric_cpu_samples (sample_id, usage_percent) VALUES (?, ?)", [sampleId, normalized.cpu]);
      await connection.query("INSERT INTO client_metric_memory_samples (sample_id, usage_percent, total_bytes, used_bytes, available_bytes) VALUES (?, ?, ?, ?, ?)", [
        sampleId,
        normalized.ram,
        toNumber(system.memory?.totalBytes),
        toNumber(system.memory?.usedBytes),
        toNumber(system.memory?.availableBytes),
      ]);
      await connection.query("INSERT INTO client_metric_disk_samples (sample_id, usage_percent, total_bytes, used_bytes, free_bytes, mount, filesystem) VALUES (?, ?, ?, ?, ?, ?, ?)", [
        sampleId,
        normalized.disk,
        toNumber(system.disk?.totalBytes),
        toNumber(system.disk?.usedBytes),
        toNumber(system.disk?.freeBytes),
        system.disk?.mount || null,
        system.disk?.filesystem || null,
      ]);
      await connection.query("INSERT INTO client_metric_network_samples (sample_id, interface_name, upload_bytes_per_sec, download_bytes_per_sec, latency_ms, packet_loss) VALUES (?, ?, ?, ?, ?, ?)", [
        sampleId,
        network.interface,
        network.uploadBytesPerSec,
        network.downloadBytesPerSec,
        network.latencyMs,
        network.packetLoss,
      ]);
      await connection.query("INSERT INTO client_metric_temperature_samples (sample_id, cpu_temperature_celsius, gpu_model, gpu_temperature_celsius) VALUES (?, ?, ?, ?)", [
        sampleId,
        temperature.cpu?.temperatureCelsius,
        temperature.gpu?.model,
        temperature.gpu?.temperatureCelsius,
      ]);
      await connection.query("INSERT INTO client_metric_system_samples (sample_id, uptime_seconds, os_platform, os_release) VALUES (?, ?, ?, ?)", [
        sampleId,
        normalized.uptime,
        os.platform || null,
        os.release || null
      ]);

      await connection.commit();
      return sampleId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  });
}

export async function getLatestClientProcesses(clientId) {
  const [rows] = await pool.query(
    `
    SELECT * FROM client_processes 
    WHERE client_id = ? 
      AND recorded_at = (SELECT MAX(recorded_at) FROM client_processes WHERE client_id = ?)
    ORDER BY cpu_percent DESC
    `,
    [clientId, clientId]
  );
  return rows.map(r => ({
    pid: r.pid,
    name: r.name,
    user: r.user,
    cpu: r.cpu_percent,
    memoryMb: r.memory_mb,
    command: r.command,
    recordedAt: r.recorded_at,
  }));
}

export async function getLatestClientNetworkActivity(clientId) {
  const [connections] = await pool.query(
    `
    SELECT c.*, intel.hostname AS resolved_hostname, intel.service_label, intel.organization, intel.is_cloud
    FROM client_network_connections c
    LEFT JOIN dns_intelligence intel ON c.remote_address = intel.ip
    WHERE c.client_id = ? 
      AND c.recorded_at >= (
        SELECT COALESCE(MAX(recorded_at), 0) - ?
        FROM client_network_connections
        WHERE client_id = ?
      )
    ORDER BY c.recorded_at DESC
    `,
    [clientId, ACTIVE_CONNECTION_GRACE_WINDOW_MS, clientId]
  );
  const [dnsLogs] = await pool.query(
    `
    SELECT *
    FROM client_dns_logs
    WHERE client_id = ?
      AND recorded_at = (SELECT MAX(recorded_at) FROM client_dns_logs WHERE client_id = ?)
    ORDER BY domain ASC
    LIMIT 100
    `,
    [clientId, clientId]
  );

  return {
    connections: connections.map(c => ({
      id: c.id,
      protocol: c.protocol,
      localAddress: c.local_address,
      localPort: c.local_port,
      peerAddress: c.remote_address,
      peerPort: c.remote_port,
      state: c.state,
      process: c.process_name,
      domain: c.service_label || c.resolved_hostname || c.domain,
      category: c.category,
      serviceLabel: c.service_label,
      organization: c.organization,
      isCloud: Boolean(c.is_cloud),
      count: c.connection_count,
      recordedAt: c.recorded_at
    })),
    dnsLogs: dnsLogs.map(d => ({
      domain: d.domain,
      resolvedAddress: d.resolved_address,
      recordedAt: d.recorded_at
    }))
  };
}

export async function getClientActivityHistory(clientId) {
  // AGGREGATION: We resolve technical domains/IPs to their High-Signal names (via dns_intelligence)
  // then group by that resolved identity and the process name. 
  // This merges multiple IPs from the same service (e.g., Facebook) into one clean history row.
  const [rows] = await pool.query(
    `
    SELECT 
      COALESCE(intel.service_label, intel.hostname, h.domain) as effective_domain,
      h.process_name,
      h.category,
      MAX(h.full_domain) as full_domain,
      MIN(h.first_seen_at) as first_seen_at,
      MAX(h.last_seen_at) as last_seen_at,
      SUM(h.hit_count) as total_hits,
      MAX(intel.organization) as organization,
      MAX(intel.is_cloud) as is_cloud
    FROM client_activity_history h
    LEFT JOIN dns_intelligence intel ON h.domain = intel.ip
    WHERE h.client_id = ? 
    GROUP BY effective_domain, h.process_name, h.category
    ORDER BY last_seen_at DESC 
    LIMIT 200
    `,
    [clientId]
  );

  return rows.map(r => ({
    domain: r.effective_domain,
    process: r.process_name,
    category: r.category,
    fullDomain: r.full_domain,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
    hitCount: r.total_hits,
    organization: r.organization,
    isCloud: Boolean(r.is_cloud)
  }));
}

export async function getGlobalTrendData(rangeStartMs) {
  const [rows] = await pool.query(
    `
    SELECT
      samples.client_id,
      samples.recorded_at AS timestamp,
      samples.cpu_usage AS cpu,
      samples.ram_usage AS ram,
      samples.disk_usage AS disk,
      samples.uptime_seconds AS uptime,
      network.upload_bytes_per_sec AS uploadBytesPerSec,
      network.download_bytes_per_sec AS downloadBytesPerSec,
      network.latency_ms AS latencyMs,
      network.packet_loss AS packetLoss,
      temperature.cpu_temperature_celsius AS cpuTemperature,
      temperature.gpu_temperature_celsius AS gpuTemperature
    FROM client_metric_samples samples
    LEFT JOIN client_metric_network_samples network ON network.sample_id = samples.id
    LEFT JOIN client_metric_temperature_samples temperature ON temperature.sample_id = samples.id
    WHERE samples.recorded_at >= ?
    ORDER BY samples.recorded_at ASC
    `,
    [rangeStartMs]
  );
  return rows;
}
