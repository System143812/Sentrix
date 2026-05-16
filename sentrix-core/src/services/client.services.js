import pool from "../lib/database.js";
import {
  appendMetricsHistory,
  getClientHardware,
  getClientMetricHistory,
  normalizeMetrics,
  saveHardwareDetails,
  saveMetricSample,
} from "./clientMetrics.services.js";

const HEARTBEAT_TIMEOUT_MS = Number(process.env.HEARTBEAT_TIMEOUT_MS || 60000);

function normalizeClient(client) {
  if (!client) return client;

  if (typeof client.metrics === "string") {
    try {
      client.metrics = JSON.parse(client.metrics);
    } catch {
      // keep original if parse fails
    }
  }

  if (typeof client.details === "string") {
    try {
      client.details = JSON.parse(client.details);
    } catch {
      // keep original if parse fails
    }
  }

  if (typeof client.history === "string") {
    try {
      client.history = JSON.parse(client.history);
    } catch {
      // keep original if parse fails
    }
  }

  return client;
}

export async function getAllClients() {
  const [rows] = await pool.query(
    `SELECT id, agent_id, hostname, ip, mac, os, device_type, client_group AS \`group\`, status, metrics, details, history, archived, last_seen_at, created_at, updated_at FROM clients WHERE archived = 0 ORDER BY hostname ASC`,
  );

  return rows.map(normalizeClient);
}

export async function getClientById(id) {
  const [rows] = await pool.query(
    `SELECT id, agent_id, hostname, ip, mac, os, device_type, client_group AS \`group\`, status, metrics, details, history, archived, last_seen_at, created_at, updated_at FROM clients WHERE id = ? LIMIT 1`,
    [id],
  );

  return normalizeClient(rows[0] ?? null);
}

export async function registerClient(clientData) {
  const id = clientData.agentId ?? clientData.id;

  if (!id) {
    throw new Error("Client id is required.");
  }

  const now = Date.now();
  const clientGroup = clientData.group ?? "Unassigned";
  const metrics = clientData.metrics ?? {
    cpu: 0,
    ram: 0,
    disk: 0,
    uptime: 0,
  };
  const normalizedMetrics = normalizeMetrics(metrics);
  const details = clientData.details ?? {};
  const history = clientData.history ?? [];

  await pool.query(
    `
    INSERT INTO clients
      (id, agent_id, hostname, ip, mac, os, device_type, client_group, status, metrics, details, history, last_seen_at, updated_at, created_at, archived)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, 'online', ?, ?, ?, ?, ?, ?, 0)
    ON DUPLICATE KEY UPDATE
      hostname = VALUES(hostname),
      ip = VALUES(ip),
      mac = VALUES(mac),
      os = VALUES(os),
      device_type = VALUES(device_type),
      client_group = COALESCE(VALUES(client_group), client_group),
      metrics = COALESCE(VALUES(metrics), metrics),
      details = COALESCE(VALUES(details), details),
      history = COALESCE(VALUES(history), history),
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
      clientGroup,
      JSON.stringify(normalizedMetrics),
      JSON.stringify(details),
      JSON.stringify(history),
      now,
      now,
      now,
    ],
  );

  await saveHardwareDetails(id, details);

  return getClientById(id);
}

export async function updateClientMetrics(id, metrics = {}, details = null) {
  const now = Date.now();
  const currentClient = await getClientById(id);

  if (!currentClient || currentClient.archived) return null;

  const normalizedMetrics = normalizeMetrics(metrics);
  const history = appendMetricsHistory(currentClient.history, normalizedMetrics, now);
  const params = [
    JSON.stringify(normalizedMetrics),
    JSON.stringify(history),
    now,
    now,
  ];
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
        history = ?,
        status = 'online',
        updated_at = ?,
        last_seen_at = ?
        ${detailsSql}
    WHERE id = ? AND archived = 0
    `,
    params,
  );

  if (rows.affectedRows === 0) return null;

  await saveMetricSample(id, normalizedMetrics, now);
  await saveHardwareDetails(id, details);

  return getClientById(id);
}

export async function touchClientHeartbeat(id, metrics = null) {
  const now = Date.now();
  const params = [now, now];
  let metricsSql = "";

  if (metrics) {
    const currentClient = await getClientById(id);

    if (!currentClient || currentClient.archived) return null;

    const normalizedMetrics = normalizeMetrics(metrics);
    const history = appendMetricsHistory(currentClient.history, normalizedMetrics, now);
    metricsSql = ", metrics = ?, history = ?";
    params.push(JSON.stringify(normalizedMetrics));
    params.push(JSON.stringify(history));
    await saveMetricSample(id, normalizedMetrics, now);
  }

  params.push(id);

  const [rows] = await pool.query(
    `
    UPDATE clients
    SET status = 'online',
        updated_at = ?,
        last_seen_at = ?
        ${metricsSql}
    WHERE id = ? AND archived = 0
    `,
    params,
  );

  if (rows.affectedRows === 0) return null;

  return getClientById(id);
}

export async function updateClientGroup(id, group) {
  const now = Date.now();
  const [rows] = await pool.query(
    `
    UPDATE clients
    SET client_group = ?,
        updated_at = ?
    WHERE id = ? AND archived = 0
    `,
    [group || "Unassigned", now, id],
  );

  if (rows.affectedRows === 0) return null;

  return getClientById(id);
}

export async function archiveClient(id) {
  const now = Date.now();
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
}

export async function markClientOffline(id) {
  const now = Date.now();
  const [rows] = await pool.query(
    `
    UPDATE clients
    SET status = 'offline',
        updated_at = ?
    WHERE id = ?
    `,
    [now, id],
  );

  if (rows.affectedRows === 0) return null;

  return getClientById(id);
}

export async function getClientSummary() {
  const clients = await getAllClients();
  const online = clients.filter((client) => client.status === "online").length;
  const offline = clients.filter(
    (client) => client.status === "offline",
  ).length;

  return {
    total: clients.length,
    online,
    offline,
    clients,
  };
}

export async function getClientMetrics(id, options = {}) {
  const client = await getClientById(id);

  if (!client || client.archived) return null;

  return getClientMetricHistory(id, options);
}

export async function getClientHardwareDetails(id) {
  const client = await getClientById(id);

  if (!client || client.archived) return null;

  const hardware = await getClientHardware(id);

  if (
    !hardware.profile &&
    !hardware.peripherals &&
    client.details &&
    typeof client.details === "object"
  ) {
    return {
      profile: client.details.specs || null,
      peripherals: client.details.peripherals || null,
      disks: client.details.specs?.disks || [],
      networkAdapters: client.details.specs?.networkAdapters || [],
      usbDevices: client.details.usbDevices || [],
      graphicsCards: client.details.peripherals?.graphicsCards || [],
      displays: client.details.peripherals?.displays || [],
    };
  }

  return hardware;
}

export function startOfflineWatcher(io) {
  setInterval(async () => {
    let changed = false;
    const now = Date.now();

    const clients = await getAllClients();

    for (const client of clients) {
      const timedOut = now - client.last_seen_at > HEARTBEAT_TIMEOUT_MS;

      if (timedOut && client.status !== "offline") {
        await markClientOffline(client.id);
        changed = true;
      }
    }

    if (changed) {
      io.to("dashboards").emit("devices:update", await getClientSummary());
    }
  }, 5000);
}
