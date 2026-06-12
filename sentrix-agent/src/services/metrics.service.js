import os from "os";
import si from "systeminformation";
import crypto from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { getAgentIdAsync } from "../utils/agent-id.js";
import { getPrimaryNetwork } from "../utils/network.js";
import { simplifyUsbDevice, classifyPeripherals } from "../utils/peripherals.js";

// Load version safely (Avoid import.meta.url which is undefined in CJS/pkg)
const VERSION = "1.0.0"; // Hardcoded as primary source for the bundled agent
import { collectCpuMetrics } from "./metrics/cpu.service.js";
import { collectDiskMetrics } from "./metrics/disk.service.js";
import { collectMemoryMetrics } from "./metrics/memory.service.js";
import { collectNetworkMetrics } from "./metrics/network.service.js";
import { collectTemperatureMetrics } from "./metrics/temperature.service.js";
import { collectProcessMetrics } from "./metrics/processes.service.js";
import { collectNetworkActivity } from "./metrics/network-activity.service.js";
import { collectUsbDevices, collectSolidUsbDevices, collectSolidDisplays } from "./metrics/peripherals.service.js";
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

function isFallbackData(sectionName, data) {
  if (data == null) return true;
  switch (sectionName) {
    case "cpu":
      return data.usage === null;
    case "memory":
      return data.usage === null;
    case "disk":
      return data.usage === null;
    case "network":
      return data.latencyMs === null && data.packetLoss === null && data.uploadBytesPerSec === null && data.downloadBytesPerSec === null;
    case "temperature":
      return data.cpu?.temperatureCelsius === null && data.gpu?.temperatureCelsius === null;
    case "processes":
      return !Array.isArray(data) || data.length === 0;
    case "activity":
      return !data || (
        (!Array.isArray(data.activeConnections) || data.activeConnections.length === 0) &&
        (!Array.isArray(data.dnsCache) || data.dnsCache.length === 0)
      );
    default:
      return false;
  }
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
    const newData = await collector();
    if (!isFallbackData(sectionName, newData) || isFallbackData(sectionName, section.data)) {
      section.data = newData;
    }
    section.updatedAt = Date.now();
  } finally {
    section.collecting = false;
  }
}

/**
 * Refreshes all cached metrics in parallel.
 */
async function refreshMetricsCache() {
  // Heavy collectors (PowerShell/wmic) use longer minimum intervals to reduce CPU load.
  // If the user-configured interval is already longer, respect their preference.
  const activityIntervalMs = Math.max(globalMetricIntervalMs, 10000);
  const temperatureIntervalMs = Math.max(globalMetricIntervalMs, 15000);

  await Promise.all([
    refreshMetricSection("cpu", collectCpuMetrics, globalMetricIntervalMs),
    refreshMetricSection("memory", collectMemoryMetrics, globalMetricIntervalMs),
    refreshMetricSection("disk", collectDiskMetrics, globalMetricIntervalMs),
    refreshMetricSection("network", collectNetworkMetrics, globalMetricIntervalMs),
    refreshMetricSection("temperature", collectTemperatureMetrics, temperatureIntervalMs),
    refreshMetricSection("processes", collectProcessMetrics, globalMetricIntervalMs),
    refreshMetricSection("activity", collectNetworkActivity, activityIntervalMs),
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
    version: VERSION,
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
 * Generates a unique SHA256 hardware fingerprint for the machine.
 */
export async function getHardwareFingerprint() {
  try {
    const [system, cpu, disks] = await Promise.all([
      si.system(),
      si.cpu(),
      si.diskLayout(),
    ]);

    // Use a composite key for reliability
    const identifiers = [
      system.uuid || "unknown-uuid",
      cpu.processorid || "unknown-cpu",
      disks[0]?.serial || "unknown-disk",
    ].join("|");

    return crypto.createHash("sha256").update(identifiers).digest("hex");
  } catch (error) {
    console.error("[Metrics] Failed to generate hardware fingerprint:", error.message);
    // Fallback to a less secure but stable identifier if SI fails
    return crypto.createHash("sha256").update(os.hostname() + os.arch()).digest("hex");
  }
}

let detailsLock = false;
let cachedStaticSpecs = null;

/**
 * Collects detailed hardware and peripheral information.
 */
export async function getDeviceDetails() {
  if (detailsLock) {
    console.warn("[Metrics] getDeviceDetails already in progress. Skipping concurrent run.");
    return null;
  }
  
  detailsLock = true;
  try {
    let cpu, memoryLayout, system, bios, baseboard, totalMemoryGb;

    if (cachedStaticSpecs) {
      cpu = cachedStaticSpecs.cpu;
      memoryLayout = cachedStaticSpecs.memoryLayout;
      system = cachedStaticSpecs.system;
      bios = cachedStaticSpecs.bios;
      baseboard = cachedStaticSpecs.baseboard;
      totalMemoryGb = cachedStaticSpecs.totalMemoryGb;
    } else {
      const [c, ml, s, b, bb, mem] = await Promise.all([
        si.cpu(),
        si.memLayout().catch(() => []),
        si.system().catch(() => ({})),
        si.bios().catch(() => ({})),
        si.baseboard().catch(() => ({})),
        si.mem(),
      ]);
      cpu = c;
      memoryLayout = ml;
      system = s;
      bios = b;
      baseboard = bb;
      totalMemoryGb = Math.round((mem.total / 1024 ** 3) * 10) / 10;
      cachedStaticSpecs = { cpu, memoryLayout, system, bios, baseboard, totalMemoryGb };
    }

    const [
      graphics, disks, usb, solidUsbDevices, solidDisplays, networkInterfaces,
    ] = await Promise.all([
      si.graphics().catch(() => ({ controllers: [], displays: [] })),
      si.diskLayout().catch(() => []), 
      collectUsbDevices().catch(() => []), // RAW for peripheral classification (Untouched)
      collectSolidUsbDevices().catch(() => []), // Solid for USB Devices module
      collectSolidDisplays().catch(() => []), // Solid for Displays module
      si.networkInterfaces().catch(() => []),
    ]);

    const usbDevices = usb.map(simplifyUsbDevice);
    const peripherals = classifyPeripherals(usbDevices, graphics);

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
        totalMemoryGb: totalMemoryGb,
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
      peripherals,
      usbDevices, // Keep this for Peripheral tracking (Untouched)
      solidUsbDevices,
      solidDisplays,
      metadata: { timestamp: Date.now(), status: "online" },
    };
  } finally {
    detailsLock = false;
  }
}

/**
 * Generates a SHA256 hash/fingerprint of the metrics payload, excluding dynamic/transient fields
 * (like timestamp, lastUpdatedAt, system.uptimeSeconds) to detect actual data changes.
 */
export function getMetricsFingerprint(metrics) {
  if (!metrics) return "";
  const copy = {
    ...metrics,
    system: metrics.system ? {
      ...metrics.system,
      uptimeSeconds: undefined,
    } : undefined,
    timestamp: undefined,
    lastUpdatedAt: undefined,
  };
  return crypto.createHash("sha256").update(JSON.stringify(copy)).digest("hex");
}

