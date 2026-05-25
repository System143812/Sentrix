import os from "os";
import si from "systeminformation";
import { getAgentIdAsync } from "../utils/agent-id.js";
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

export function setGlobalMetricInterval(intervalMs) {
  globalMetricIntervalMs = Math.min(Math.max(Number(intervalMs) || DEFAULT_METRIC_INTERVAL_MS, 1000), 60000);
}

const cachedMetricSections = {
  cpu: createCachedSection({ usage: null }),
  memory: createCachedSection({
    usage: null,
    totalBytes: null,
    usedBytes: null,
    availableBytes: null,
  }),
  disk: createCachedSection({
    usage: null,
    totalBytes: null,
    usedBytes: null,
    freeBytes: null,
    mount: process.platform === "win32" ? "C:\\" : "/",
    filesystem: "Unknown",
  }),
  network: createCachedSection({
    interface: "Unknown",
    uploadBytesPerSec: null,
    downloadBytesPerSec: null,
    latencyMs: null,
    packetLoss: null,
  }),
  temperature: createCachedSection({
    cpu: {
      temperatureCelsius: null,
    },
    gpu: {
      model: "Unknown",
      temperatureCelsius: null,
    },
  }),
  processes: createCachedSection([]),
  activity: createCachedSection({
    activeConnections: [],
    dnsCache: [],
  }),
};

function createCachedSection(initialData) {
  return {
    data: initialData,
    updatedAt: 0,
    collecting: false,
  };
}

function getPrimaryMetricValue(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function getMetricTimestamp(sections) {
  const timestamps = Object.values(sections)
    .map((section) => Number(section.updatedAt) || 0)
    .filter(Boolean);

  return timestamps.length > 0 ? Math.max(...timestamps) : Date.now();
}

async function refreshMetricSection(sectionName, collector, intervalMs) {
  const section = cachedMetricSections[sectionName];
  const now = Date.now();

  if (section.collecting) {
    return;
  }

  if (now - section.updatedAt < intervalMs) {
    return;
  }

  section.collecting = true;

  try {
    section.data = await collector();
    section.updatedAt = Date.now();
  } finally {
    section.collecting = false;
  }
}

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

function buildMetricsPayload(agentId, hostname) {
  const timestamp = Date.now();
  const lastUpdatedAt = getMetricTimestamp(cachedMetricSections);
  const cpu = cachedMetricSections.cpu.data;
  const memory = cachedMetricSections.memory.data;
  const disk = cachedMetricSections.disk.data;
  const network = cachedMetricSections.network.data;
  const temperature = cachedMetricSections.temperature.data;
  const processes = cachedMetricSections.processes.data;
  const activity = cachedMetricSections.activity.data;

  return {
    schemaVersion: 2,
    deviceId: agentId,
    hostname,
    status: "online",
    timestamp,
    lastUpdatedAt,
    system: {
      cpu,
      memory,
      disk,
      uptimeSeconds: toNumber(os.uptime(), 0),
      os: {
        platform: safeString(os.platform()),
        release: safeString(os.release()),
      },
    },
    network,
    temperature,
    processes,
    networkActivity: activity,
  };
}

function getPrimaryNetwork() {
  if (process.env.AGENT_IP_OVERRIDE) {
    return {
      ip: process.env.AGENT_IP_OVERRIDE,
      mac: "Override",
    };
  }

  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, records] of Object.entries(interfaces)) {
    for (const record of records || []) {
      if (record.family === "IPv4" && !record.internal) {
        const isVirtual = /virtual|vbox|vmware|docker|veth|vpn|sandbox/i.test(name);
        candidates.push({
          name,
          address: record.address,
          mac: record.mac,
          isVirtual,
          isCommonLan: record.address.startsWith("192.168.") || record.address.startsWith("10.")
        });
      }
    }
  }

  // Sort candidates:
  // 1. Not virtual + common LAN
  // 2. Not virtual
  // 3. Common LAN
  // 4. Anything else
  candidates.sort((a, b) => {
    if (a.isVirtual !== b.isVirtual) return a.isVirtual ? 1 : -1;
    if (a.isCommonLan !== b.isCommonLan) return a.isCommonLan ? -1 : 1;
    return 0;
  });

  if (candidates.length > 0) {
    return {
      ip: candidates[0].address,
      mac: candidates[0].mac,
    };
  }

  return {
    ip: "Unknown",
    mac: "Unknown",
  };
}

export async function getAgentProfile() {
  const profile = await getLiveProfileSnapshot();
  const details = await getDeviceDetails();

  return {
    ...profile,
    device_type: "PC",
    details,
  };
}

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

export async function getMetrics() {
  const agentId = await getAgentIdAsync();

  await refreshMetricsCache();

  return buildMetricsPayload(agentId, os.hostname());
}

function simplifyUsbDevice(device) {
  // If the collector already provided a clean name, use it.
  // Otherwise, fallback to manufacturer + name.
  const rawName = device.name || device.deviceName || "";
  const manufacturer = device.manufacturer || device.vendor || "";
  
  let name = rawName;
  if (manufacturer && rawName && !rawName.includes(manufacturer)) {
    name = `${manufacturer} ${rawName}`.trim();
  }

  return {
    name: name || device.id || device.deviceId || "USB Device",
    type: device.type || "USB",
    vendor: manufacturer || "Unknown",
    id: device.id || device.deviceId || "Unknown",
  };
}

function getUsbSearchText(device = {}) {
  return [
    device.name,
    device.type,
    device.vendor,
    device.id,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function hasAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function classifyPeripherals(usbDevices = [], graphics = {}) {
  const searchTexts = usbDevices.map(getUsbSearchText);

  return {
    mouse: searchTexts.some((text) =>
      hasAny(text, ["mouse", "pointing device", "trackball", "touchpad"]),
    ),
    keyboard: searchTexts.some((text) =>
      hasAny(text, ["keyboard", "kbd", "keychron", "logitech receiver"]),
    ),
    wifiDongle: searchTexts.some((text) =>
      hasAny(text, [
        "wireless",
        "wi-fi",
        "wifi",
        "802.11",
        "wlan",
        "rtl8188",
        "rtl8192",
        "rtl8812",
        "rtl8814",
        "realtek 11n",
        "ac600",
        "ac1200",
        "wireless adapter",
        "wireless lan",
        "network adapter",
        "wifi adapter",
      ]),
    ),
    bluetoothDongle: searchTexts.some((text) =>
      hasAny(text, [
        "bluetooth",
        "bt adapter",
        "bt dongle",
        "bluetooth radio",
        "csr8510",
        "broadcom bluetooth",
      ]),
    ),
    webcam: searchTexts.some((text) =>
      hasAny(text, ["camera", "webcam", "uvc", "imaging device"]),
    ),
    storage: searchTexts.some((text) =>
      hasAny(text, [
        "mass storage",
        "flash",
        "disk",
        "usb drive",
        "thumb drive",
        "storage",
        "card reader",
      ]),
    ),
    graphicsCards: (graphics.controllers || []).map((controller) => ({
      model: controller.model || "Unknown GPU",
      vendor: controller.vendor || "Unknown",
      vram: controller.vram || 0,
    })),
    displays: (graphics.displays || []).map((display) => ({
      model: display.model || "Unknown Display",
      resolution: display.resolutionX && display.resolutionY
        ? `${display.resolutionX}x${display.resolutionY}`
        : "Unknown",
    })),
  };
}

export async function getDeviceDetails() {
  const [
    cpu,
    memory,
    memoryLayout,
    system,
    bios,
    baseboard,
    graphics,
    disks,
    usb,
    networkInterfaces,
  ] = await Promise.all([
    si.cpu(),
    si.mem(),
    si.memLayout().catch(() => []),
    si.system().catch(() => ({})),
    si.bios().catch(() => ({})),
    si.baseboard().catch(() => ({})),
    si.graphics().catch(() => ({ controllers: [], displays: [] })),
    si.diskLayout().catch(() => []),
    collectUsbDevices().catch(() => []),
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
        .filter((adapter) => !adapter.internal)
        .map((adapter) => ({
          name: adapter.ifaceName || adapter.iface || "Network Adapter",
          mac: adapter.mac || "Unknown",
          ip4: adapter.ip4 || "Unknown",
          type: adapter.type || "Unknown",
        })),
    },
    peripherals: classifyPeripherals(usbDevices, graphics),
    usbDevices,
    metadata: {
      timestamp: Date.now(),
      status: "online",
    },
  };
}
