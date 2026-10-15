import { toNumber } from "../../utils/db.utils.js";

const SNAPSHOT_REFRESH_INTERVAL_MS = Number(
  process.env.METRICS_SNAPSHOT_REFRESH_INTERVAL_MS || 60000,
);
const CACHE_ENTRY_TTL_MS = Number(
  process.env.METRICS_SNAPSHOT_CACHE_TTL_MS || 30 * 60 * 1000,
);

const snapshots = new Map();

function normalizeString(value, fallback = "") {
  if (value == null) return fallback;
  return String(value).trim();
}

function processSignature(process = {}) {
  return [
    toNumber(process.pid, 0),
    normalizeString(process.name),
    normalizeString(process.user),
    toNumber(process.cpu, 0),
    toNumber(process.memoryMb, 0),
    normalizeString(process.command),
  ];
}

function connectionSignature(connection = {}) {
  return [
    normalizeString(connection.protocol, "TCP"),
    normalizeString(connection.localAddress),
    toNumber(connection.localPort, 0),
    normalizeString(connection.peerAddress),
    toNumber(connection.peerPort, 0),
    normalizeString(connection.state, "ESTABLISHED"),
    normalizeString(connection.process, "System"),
    normalizeString(connection.domain || connection.peerAddress),
    normalizeString(connection.fullDomain),
    toNumber(connection.count, 1),
  ];
}

function dnsSignature(entry = {}) {
  return [
    normalizeString(entry.domain).toLowerCase(),
    normalizeString(entry.resolvedAddress),
  ];
}

function stableSignature(items, itemSignature) {
  if (!Array.isArray(items) || items.length === 0) return "[]";

  return JSON.stringify(
    items
      .map(itemSignature)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
}

function getClientSnapshot(clientId) {
  let snapshot = snapshots.get(clientId);
  if (!snapshot) {
    snapshot = {};
    snapshots.set(clientId, snapshot);
  }
  return snapshot;
}

function shouldPersistSection(clientId, section, signature, timestamp) {
  const snapshot = getClientSnapshot(clientId);
  const previous = snapshot[section];
  const changed = previous?.signature !== signature;
  const refreshDue =
    !previous ||
    timestamp - Number(previous.lastPersistedAt || 0) >= SNAPSHOT_REFRESH_INTERVAL_MS;

  snapshot.lastSeenAt = timestamp;

  if (changed || refreshDue) {
    snapshot[section] = {
      signature,
      lastPersistedAt: timestamp,
    };
    return true;
  }

  return false;
}

export function getSnapshotPersistencePlan(clientId, normalized, timestamp = Date.now()) {
  const activeConnections = normalized.networkActivity?.activeConnections || [];
  const dnsCache = normalized.networkActivity?.dnsCache || [];

  cleanupSnapshotCache(timestamp);

  return {
    processes: shouldPersistSection(
      clientId,
      "processes",
      stableSignature(normalized.processes, processSignature),
      timestamp,
    ),
    networkActivity: shouldPersistSection(
      clientId,
      "networkActivity",
      stableSignature(activeConnections, connectionSignature),
      timestamp,
    ),
    dnsCache: shouldPersistSection(
      clientId,
      "dnsCache",
      stableSignature(dnsCache, dnsSignature),
      timestamp,
    ),
  };
}

export function cleanupSnapshotCache(now = Date.now()) {
  for (const [clientId, snapshot] of snapshots.entries()) {
    if (now - Number(snapshot.lastSeenAt || 0) > CACHE_ENTRY_TTL_MS) {
      snapshots.delete(clientId);
    }
  }
}
