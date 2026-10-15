import { parseJson } from "../../utils/db.utils.js";
import {
  saveDomainSummaries,
  getDomainSummaries,
} from "./network-intelligence.js";
import {
  saveSoftwareInventory,
  getSoftwareInventory,
  insertEvent,
  saveDeviceEvents,
} from "./software-inventory.js";
import {
  analyzeMetrics,
  saveHealthSnapshot,
  recordUptimeStatus,
  getHealthSummary,
  getAnomalyAlerts,
} from "./health-history.js";
import { BehaviorRepository } from "./behavior.repository.js";

export {
  saveDomainSummaries,
  getDomainSummaries,
  saveSoftwareInventory,
  getSoftwareInventory,
  insertEvent,
  saveDeviceEvents,
  analyzeMetrics,
  saveHealthSnapshot,
  recordUptimeStatus,
  getHealthSummary,
  getAnomalyAlerts,
};

export async function getDeviceEvents(clientId, { startDate, endDate, limit = 200 } = {}) {
  const filters = ["device_id = ?"];
  const params = [clientId];

  if (startDate) {
    filters.push("created_at >= ?");
    params.push(Number(startDate));
  }

  if (endDate) {
    filters.push("created_at <= ?");
    params.push(Number(endDate));
  }

  const rows = await BehaviorRepository.findDeviceEvents({
    filters,
    params,
    limit: Math.min(Math.max(Number(limit) || 200, 25), 500),
  });

  return rows.map((row) => ({
    id: row.id,
    deviceId: row.device_id,
    eventType: row.event_type,
    severity: row.severity,
    title: row.title,
    description: row.description,
    metadata: parseJson(row.metadata, null),
    createdAt: row.created_at,
  }));
}
