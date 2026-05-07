import os from "os";
import si from "systeminformation";
import { getAgentIdAsync } from "../utils/agent-id.js";

function getPrimaryNetwork() {
  const interfaces = os.networkInterfaces();

  for (const records of Object.values(interfaces)) {
    for (const record of records || []) {
      if (record.family === "IPv4" && !record.internal) {
        return {
          ip: record.address,
          mac: record.mac,
        };
      }
    }
  }

  return {
    ip: "Unknown",
    mac: "Unknown",
  };
}

export async function getAgentProfile() {
  const network = getPrimaryNetwork();
  const [osInfo, details] = await Promise.all([si.osInfo(), getDeviceDetails()]);

  return {
    agentId: await getAgentIdAsync(),
    hostname: os.hostname(),
    os: `${osInfo.distro || os.type()} ${osInfo.release || os.release()}`,
    ip: network.ip,
    mac: network.mac,
    device_type: "PC",
    details,
  };
}

export async function getMetrics() {
  const [cpuLoad, memory, disks] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
  ]);

  const primaryDisk = disks[0];

  return {
    cpu: Math.round(cpuLoad.currentLoad),
    ram: Math.round((memory.used / memory.total) * 100),
    disk: primaryDisk ? Math.round(primaryDisk.use) : 0,
    uptime: os.uptime(),
  };
}

function simplifyUsbDevice(device) {
  const name = [
    device.manufacturer,
    device.name || device.deviceName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    name: name || device.id || "USB Device",
    type: device.type || "USB",
    vendor: device.manufacturer || device.vendor || "Unknown",
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
    si.usb().catch(() => []),
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
  };
}
