import os from "os";
import si from "systeminformation";
import { getAgentIdAsync } from "../utils/agent-id.js";
import { getPrimaryNetwork } from "../utils/network.js";
import { simplifyUsbDevice, classifyPeripherals } from "../utils/peripherals.js";
import { collectCpuMetrics } from "./metrics/cpu.service.js";
import { collectDiskMetrics } from "./metrics/disk.service.js";
import { collectMemoryMetrics } from "./metrics/memory.service.js";
import { collectNetworkMetrics } from "./metrics/network.service.js";
import { collectTemperatureMetrics } from "./metrics/temperature.service.js";
import { collectProcessMetrics } from "./metrics/processes.service.js";
import { collectNetworkActivity } from "./metrics/network-activity.service.js";
import { collectUsbDevices } from "./metrics/peripherals.service.js";
import { safeString, toNumber } from "./metrics/helpers.js";

const DEFAULT_METRIC_INTERVAL_MS = Number(process.env.METRICS_INTERVAL_MS || 5000);
let globalMetricIntervalMs = DEFAULT_METRIC_INTERVAL_MS;

/**
 * Updates the frequency of metric collection.
 */
export function setGlobalMetricInterval(intervalMs) {
  globalMetricIntervalMs = Math.min(Math.max(Number(intervalMs) || DEFAULT_METRIC_INTERVAL_MS, 1000), 60000);
}

const cachedMetricSections = {
  cpu: createCachedSection({ usage: null }),
  memory: createCachedSection({ usage: null, totalBytes: null, usedBytes: null, availableBytes: null }),
  disk: createCachedSection({ usage: null, totalBytes: null, usedBytes: null, freeBytes: null, mount: os.platform() === "win32" ? "C:\\" : "/", filesystem: "Unknown" }),
  network: createCachedSection({ interface: "Unknown", uploadBytesPerSec: null, downloadBytesPerSec: null, latencyMs: null, packetLoss: null }),
  temperature: createCachedSection({ cpu: { temperatureCelsius: null }, gpu: { model: "Unknown", temperatureCelsius: null } }),
  processes: createCachedSection([]),
  activity: createCachedSection({ activeConnections: [], dnsCache: [] }),
};

function createCachedSection(initialData) {
  return { data: initialData, updatedAt: 0, collecting: false };
}

function getMetricTimestamp(sections) {
  const timestamps = Object.values(sections)
    .map((section) => Number(section.updatedAt) || 0)
    .filter(Boolean);

  return timestamps.length > 0 ? Math.max(...timestamps) : Date.now();
}

/**
 * Triggers a collection for a specific section if it's stale and not currently running.
 */
async function refreshMetricSection(sectionName, collector, intervalMs) {
  const section = cachedMetricSections[sectionName];
  const now = Date.now();

  if (section.collecting || (now - section.updatedAt < intervalMs)) return;

  section.collecting = true;
  try {
    section.data = await collector();
    section.updatedAt = Date.now();
  } finally {
    section.collecting = false;
  }
}

/**
 * Refreshes all cached metrics in parallel.
 */
async function refreshMetricsCache() {
  await Promise.all([
    refreshMetricSection("cpu", collectCpuMetrics, globalMetricIntervalMs),
    refreshMetricSection("memory", collectMemoryMetrics, globalMetricIntervalMs),
    refreshMetricSection("disk", collectDiskMetrics, globalMetricIntervalMs),
    refreshMetricSection("network", collectNetworkMetrics, globalMetricIntervalMs),
    refreshMetricSection("temperature", collectTemperatureMetrics, globalMetricIntervalMs),
    refreshMetricSection("processes", collectProcessMetrics, globalMetricIntervalMs),
    refreshMetricSection("activity", collectNetworkActivity, globalMetricIntervalMs),
  ]);
}

/**
 * Assembles the final metrics payload to be sent to the core.
 */
function buildMetricsPayload(agentId, hostname) {
  const timestamp = Date.now();
  const lastUpdatedAt = getMetricTimestamp(cachedMetricSections);

  return {
    schemaVersion: 2,
    deviceId: agentId,
    hostname,
    status: "online",
    timestamp,
    lastUpdatedAt,
    system: {
      cpu: cachedMetricSections.cpu.data,
      memory: cachedMetricSections.memory.data,
      disk: cachedMetricSections.disk.data,
      uptimeSeconds: toNumber(os.uptime(), 0),
      os: { platform: safeString(os.platform()), release: safeString(os.release()) },
    },
    network: cachedMetricSections.network.data,
    temperature: cachedMetricSections.temperature.data,
    processes: cachedMetricSections.processes.data,
    networkActivity: cachedMetricSections.activity.data,
  };
}

/**
 * Returns a basic profile of the agent (ID, hostname, OS, IP).
 */
export async function getLiveProfileSnapshot() {
  const network = getPrimaryNetwork();
  const osInfo = await si.osInfo();

  return {
    agentId: await getAgentIdAsync(),
    hostname: os.hostname(),
    os: `${osInfo.distro || os.type()} ${osInfo.release || os.release()}`,
    ip: network.ip,
    mac: network.mac,
  };
}

/**
 * Returns the full agent profile, including detailed hardware specs.
 */
export async function getAgentProfile() {
  const profile = await getLiveProfileSnapshot();
  const details = await getDeviceDetails();

  return { ...profile, device_type: "PC", details };
}

/**
 * Triggers a cache refresh and returns the latest metrics payload.
 */
export async function getMetrics() {
  const agentId = await getAgentIdAsync();
  await refreshMetricsCache();
  return buildMetricsPayload(agentId, os.hostname());
}

/**
 * Collects detailed hardware and peripheral information.
 */
export async function getDeviceDetails() {
  const [
    cpu, memory, memoryLayout, system, bios, baseboard, graphics, disks, usb, networkInterfaces,
  ] = await Promise.all([
    si.cpu(), si.mem(), si.memLayout().catch(() => []), si.system().catch(() => ({})),
    si.bios().catch(() => ({})), si.baseboard().catch(() => ({})),
    si.graphics().catch(() => ({ controllers: [], displays: [] })),
    si.diskLayout().catch(() => []), collectUsbDevices().catch(() => []),
    si.networkInterfaces().catch(() => []),
  ]);

  const usbDevices = usb.map(simplifyUsbDevice);

  return {
    specs: {
      manufacturer: system.manufacturer || "Unknown",
      model: system.model || "Unknown",
      serial: system.serial || "Unknown",
      bios: bios.version || "Unknown",
      baseboard: baseboard.model || "Unknown",
      cpu: `${cpu.manufacturer || ""} ${cpu.brand || "Unknown CPU"}`.trim(),
      cpuCores: cpu.physicalCores || cpu.cores || 0,
      cpuThreads: cpu.cores || 0,
      totalMemoryGb: Math.round((memory.total / 1024 ** 3) * 10) / 10,
      memorySlots: memoryLayout.length,
      disks: disks.map((disk) => ({
        name: disk.name || disk.device || "Disk",
        type: disk.type || "Unknown",
        sizeGb: disk.size ? Math.round((disk.size / 1024 ** 3) * 10) / 10 : 0,
      })),
      networkAdapters: networkInterfaces
        .filter((adapter) => !adapter.internal && !adapter.virtual)
        .map((adapter) => ({
          name: adapter.ifaceName || adapter.iface || "Network Adapter",
          mac: adapter.mac || "Unknown",
          ip4: adapter.ip4 || "Unknown",
          type: adapter.type || "Unknown",
        })),
    },
    peripherals: classifyPeripherals(usbDevices, graphics),
    usbDevices,
    metadata: { timestamp: Date.now(), status: "online" },
  };
}
