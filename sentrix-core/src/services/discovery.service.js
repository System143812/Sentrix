import os from "os";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { promisify } from "util";
import dns from "dns";
import net from "net";
import { execFile } from "child_process";
import { getAllClients } from "./client.services.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execFileAsync = promisify(execFile);
const dnsLookup = promisify(dns.reverse);
const lastScanResults = new Map();
let latestSnapshot = {
  status: "idle",
  progress: 0,
  subnet: null,
  devices: [],
  lastScanAt: null,
  nextScanAt: null,
  message: "Discovery has not run yet.",
};
let activeScanPromise = null;

const CHECK_PORT_TIMEOUT_MS = 450;
const AUTO_SCAN_INTERVAL_MS = Number(process.env.DISCOVERY_SCAN_INTERVAL_MS || 60000);
const WINDOWS_PORTS = [135, 139, 445, 3389];
const LINUX_PORTS = [22];
const WEB_PORTS = [80, 443, 8080, 8443];
const MOBILE_PORTS = [5555, 62078];
const PRINTER_PORTS = [515, 631, 9100];
const NETWORK_PORTS = [53, 67, 68];
const ROUTER_GATEWAY_HOSTS = new Set(["1", "254"]);
const OUI_VENDORS = {
  "001018": "Apple",
  "001217": "Apple",
  "00238C": "Apple",
  "086C39": "Apple",
  "0C8DEB": "Apple",
  "185AED": "Apple",
  "1C3647": "Apple",
  "2426C0": "Apple",
  "34363B": "Apple",
  "38F9D3": "Apple",
  "3C2EFF": "Apple",
  "3CBAF8": "Apple",
  "48A482": "Apple",
  "4C87FB": "Apple",
  "50E551": "Apple",
  "509A4C": "Apple",
  "60F81D": "Apple",
  "68A86B": "Apple",
  "705F43": "Apple",
  "74C25D": "Apple",
  "7C1007": "Apple",
  "7C2658": "Apple",
  "ACBC32": "Apple",
  "BC0A45": "Apple",
  "E01040": "Apple",
  "001E46": "Samsung",
  "0021E9": "Samsung",
  "0054A4": "Samsung",
  "105C7E": "Samsung",
  "1C328D": "Samsung",
  "201E77": "Samsung",
  "2859A6": "Samsung",
  "2CC4D7": "Samsung",
  "34C38A": "Samsung",
  "440AF9": "Samsung",
  "5065F3": "Samsung",
  "60A10D": "Samsung",
  "685BEC": "Samsung",
  "68873E": "Samsung",
  "6CC2CB": "Samsung",
  "7042B5": "Samsung",
  "78DBBF": "Samsung",
  "7C1E52": "Samsung",
  "8CD21E": "Samsung",
  "98B0E9": "Samsung",
  "ACDC38": "Samsung",
  "BC4CC4": "Samsung",
  "C0F2FA": "Samsung",
  "D076F0": "Samsung",
  "F03F2E": "Samsung",
  "F4E9D4": "Samsung",
  "001A11": "Google",
  "3C5A37": "Google",
  "F4F5D8": "Google",
  "001122": "Cisco",
  "001B54": "Cisco",
  "0026CB": "Cisco",
  "18E728": "Cisco",
  "70D379": "Cisco",
  "B0BE76": "TP-Link",
  "C025E9": "TP-Link",
  "D46E0E": "TP-Link",
  "F4F26D": "TP-Link",
  "00195B": "D-Link",
  "001CF0": "D-Link",
  "1C7EE5": "D-Link",
  "0024A5": "Ubiquiti",
  "0418D6": "Ubiquiti",
  "18E829": "Ubiquiti",
  "24792A": "Ubiquiti",
  "74ACB9": "Ubiquiti",
  "00155D": "Microsoft",
  "0017FA": "Microsoft",
  "005056": "VMware",
  "000C29": "VMware",
  "001C42": "Parallels",
  "080027": "VirtualBox",
  "3C970E": "Dell",
  "7845C4": "Dell",
  "B083FE": "Dell",
  "D4BEF9": "Dell",
  "E0DB55": "Dell",
  "001A4B": "Hewlett Packard",
  "00237D": "Hewlett Packard",
  "2C27D7": "Hewlett Packard",
  "6C3BE5": "Hewlett Packard",
  "A0481C": "Hewlett Packard",
  "B05ADA": "Hewlett Packard",
  "001E37": "Lenovo",
  "208984": "Lenovo",
  "54EE75": "Lenovo",
  "606C66": "Intel",
  "685D43": "Intel",
  "A0369F": "Intel",
  "F8B156": "Intel",
  "001BFC": "ASUSTek",
  "2C56DC": "ASUSTek",
  "50465D": "ASUSTek",
  "7085C2": "ASUSTek",
  "001D92": "Micro-Star",
  "448A5B": "Micro-Star",
  "D8CB8A": "Micro-Star",
  "001D7D": "Gigabyte",
  "902B34": "Gigabyte",
  "E8018D": "Fiberhome Telecommunication Technologies",
  "001E8C": "Canon",
  "00BB3A": "Brother",
  "008077": "Brother",
  "001124": "Epson",
};
const NETWORK_DEVICE_VENDORS = [
  "arris",
  "cisco",
  "d-link",
  "fiberhome",
  "huawei",
  "mercury",
  "mikrotik",
  "netgear",
  "ruijie",
  "tenda",
  "totolink",
  "tp-link",
  "ubiquiti",
  "zte",
  "zyxel",
];

function getLocalSubnet() {
  if (process.env.DISCOVERY_SUBNET) {
    console.log(`[Discovery] Using environment override for subnet: ${process.env.DISCOVERY_SUBNET}`);
    return process.env.DISCOVERY_SUBNET;
  }

  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, records] of Object.entries(interfaces)) {
    for (const record of records || []) {
      if (record.family === "IPv4" && !record.internal) {
        const isVirtual = /virtual|vbox|vmware|docker|veth|vpn|sandbox/i.test(name);
        const parts = record.address.split(".");
        const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
        
        candidates.push({
          name,
          address: record.address,
          subnet,
          isVirtual,
          isCommonLan: record.address.startsWith("192.168.") || record.address.startsWith("10.")
        });
      }
    }
  }

  candidates.sort((a, b) => {
    if (a.isVirtual !== b.isVirtual) return a.isVirtual ? 1 : -1;
    if (a.isCommonLan !== b.isCommonLan) return a.isCommonLan ? -1 : 1;
    return 0;
  });

  if (candidates.length > 0) {
    const best = candidates[0];
    console.log(`[Discovery] Selected subnet ${best.subnet} from interface ${best.name} (${best.address})`);
    return best.subnet;
  }

  return null;
}

function getLocalGatewayCandidates(subnet) {
  const candidates = new Set();
  const interfaces = os.networkInterfaces();

  for (const records of Object.values(interfaces)) {
    for (const record of records || []) {
      if (record.family === "IPv4" && !record.internal && record.cidr) {
        const parts = record.address.split(".");
        if (parts.length === 4) {
          candidates.add(`${parts[0]}.${parts[1]}.${parts[2]}.1`);
          candidates.add(`${parts[0]}.${parts[1]}.${parts[2]}.254`);
        }
      }
    }
  }

  if (subnet) {
    candidates.add(`${subnet}.1`);
    candidates.add(`${subnet}.254`);
  }

  return candidates;
}

function getPrimaryInterfaceAddress() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, records] of Object.entries(interfaces)) {
    for (const record of records || []) {
      if (record.family === "IPv4" && !record.internal) {
        const isVirtual = /virtual|vbox|vmware|docker|veth|vpn|sandbox/i.test(name);
        candidates.push({
          name,
          address: record.address,
          isVirtual,
          isCommonLan: record.address.startsWith("192.168.") || record.address.startsWith("10.")
        });
      }
    }
  }

  candidates.sort((a, b) => {
    if (a.isVirtual !== b.isVirtual) return a.isVirtual ? 1 : -1;
    if (a.isCommonLan !== b.isCommonLan) return a.isCommonLan ? -1 : 1;
    return 0;
  });

  if (candidates.length > 0) {
    return candidates[0].address;
  }

  return null;
}

function updateSnapshot(partial) {
  latestSnapshot = {
    ...latestSnapshot,
    ...partial,
  };

  return latestSnapshot;
}

export function getDiscoverySnapshot() {
  return latestSnapshot;
}

async function commandExists(command) {
  const lookupCommand = process.platform === "win32" ? "where" : "which";

  try {
    await execFileAsync(lookupCommand, [command]);
    return true;
  } catch {
    return false;
  }
}

async function pingHost(ip) {
  const args =
    process.platform === "win32"
      ? ["-n", "1", "-w", "300", ip]
      : ["-c", "1", "-W", "1", ip];

  try {
    await execFileAsync("ping", args);
    return true;
  } catch {
    return false;
  }
}

async function pingHostname(ip) {
  if (process.platform !== "win32") {
    return null;
  }

  try {
    const { stdout } = await execFileAsync("ping", ["-a", "-n", "1", "-w", "500", ip]);
    const match = stdout.match(/Pinging\s+([^\s\[]+)\s+\[/i);
    return match?.[1] && match[1] !== ip ? match[1].split(".")[0] : null;
  } catch {
    return null;
  }
}

async function readArpTable() {
  try {
    const { stdout } = await execFileAsync("arp", ["-a"]);
    return stdout;
  } catch {
    return "";
  }
}

async function runNmapPingScan(subnet) {
  if (!(await commandExists("nmap"))) {
    return new Map();
  }

  try {
    const { stdout } = await execFileAsync("nmap", ["-sn", `${subnet}.0/24`], {
      timeout: 30000,
    });
    const devices = new Map();
    const blocks = stdout.split(/Nmap scan report for /i).slice(1);

    blocks.forEach((block) => {
      const lines = block.split("\n");
      const firstLine = lines[0].trim();
      const ipMatch = firstLine.match(/\(?(\d{1,3}(?:\.\d{1,3}){3})\)?/);
      const ip = ipMatch?.[1];

      if (!ip) {
        return;
      }

      const hostname = firstLine.replace(ipMatch[0], "").trim() || "Unknown";
      const macLine = lines.find((line) => line.includes("MAC Address:"));
      const macMatch = macLine?.match(/MAC Address:\s+([0-9A-F:]{17})\s+\(([^)]+)\)/i);

      devices.set(ip, {
        hostname: hostname === ip ? "Unknown" : hostname,
        hostname_source: hostname && hostname !== ip ? "nmap" : "unresolved",
        mac: macMatch?.[1] || "Unknown",
        vendor: macMatch?.[2] || "Unknown",
      });
    });

    return devices;
  } catch {
    return new Map();
  }
}

function findMacForIp(arpTable, ip) {
  const line = arpTable.split("\n").find((row) => row.includes(ip));

  return line?.match(/([0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i)?.[0] ?? "Unknown";
}

function getMacPrefix(mac = "") {
  return mac && mac !== "Unknown"
    ? mac.toUpperCase().replace(/[:-]/g, "").substring(0, 6)
    : "";
}

function isLocallyAdministeredMac(mac = "") {
  const compact = mac.toUpperCase().replace(/[:-]/g, "");
  if (compact.length < 2) return false;

  const firstByte = Number.parseInt(compact.substring(0, 2), 16);
  return Number.isFinite(firstByte) && (firstByte & 2) === 2;
}

function inferVendorFromMac(mac) {
  if (isLocallyAdministeredMac(mac)) {
    return "Private / randomized";
  }

  return OUI_VENDORS[getMacPrefix(mac)] || "Unknown";
}

function resolveVendor(nmapVendor, mac) {
  if (nmapVendor && nmapVendor !== "Unknown") {
    return nmapVendor;
  }

  return inferVendorFromMac(mac);
}

function getDisplayHostname(ip, hostname, registeredClient = null) {
  if (registeredClient?.hostname) {
    return registeredClient.hostname;
  }

  if (hostname && hostname !== "Unknown") {
    return hostname;
  }

  return `Host ${ip.split(".").at(-1)}`;
}

function isGatewayCandidate(ip, gatewayCandidates = new Set()) {
  const lastOctet = ip.split(".").at(-1);
  return gatewayCandidates.has(ip) || ROUTER_GATEWAY_HOSTS.has(lastOctet);
}

function getNetworkDeviceKind(vendor = "", openPorts = [], gateway = false) {
  const lowerVendor = vendor.toLowerCase();

  if (gateway) {
    if (lowerVendor.includes("fiberhome")) return "Fiberhome router/gateway";
    if (lowerVendor.includes("tp-link")) return "TP-Link router/gateway";
    if (lowerVendor.includes("d-link")) return "D-Link router/gateway";
    if (lowerVendor.includes("cisco")) return "Cisco router/gateway";
    if (lowerVendor.includes("ubiquiti")) return "Ubiquiti router/gateway";
    if (lowerVendor.includes("mikrotik")) return "MikroTik router/gateway";
    if (lowerVendor.includes("huawei")) return "Huawei router/gateway";
    if (lowerVendor.includes("zte")) return "ZTE router/gateway";
    return "Router/gateway";
  }

  if (openPorts.includes(53)) return "DNS/network service";
  if (openPorts.includes(67) || openPorts.includes(68)) return "DHCP/network service";

  if (NETWORK_DEVICE_VENDORS.some((name) => lowerVendor.includes(name))) {
    return "Network device";
  }

  return null;
}

async function getHostnameForIp(ip) {
  try {
    const hostnames = await dnsLookup(ip);
    if (hostnames && hostnames.length > 0) {
      return {
        hostname: hostnames[0].split(".")[0],
        source: "reverse_dns",
      };
    }
  } catch {
  }

  const pingName = await pingHostname(ip);
  if (pingName) {
    return {
      hostname: pingName,
      source: "ping",
    };
  }

  if (process.platform === "win32") {
    try {
      const { stdout } = await execFileAsync("nbtstat", ["-A", ip]);
      const match = stdout.match(/^\s*([A-Z0-9][A-Z0-9-]{0,14})\s+<00>\s+UNIQUE/im);
      if (match && match[1] && match[1] !== "__MSBROWSE__") {
        return {
          hostname: match[1],
          source: "netbios",
        };
      }
    } catch {
    }
  }

  try {
    const { stdout } = await execFileAsync("nslookup", [ip]);
    const match = stdout.match(/Name:\s+([^\s]+)/i);
    if (match?.[1]) {
      return {
        hostname: match[1].split(".")[0],
        source: "nslookup",
      };
    }
  } catch {
  }

  return {
    hostname: "Unknown",
    source: "unresolved",
  };
}

function checkPort(ip, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    socket.setTimeout(CHECK_PORT_TIMEOUT_MS);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, ip);
  });
}

async function getOpenPorts(ip) {
  const ports = [
    ...WINDOWS_PORTS,
    ...LINUX_PORTS,
    ...WEB_PORTS,
    ...MOBILE_PORTS,
    ...PRINTER_PORTS,
    ...NETWORK_PORTS,
  ];
  const checks = await Promise.all(
    ports.map(async (port) => ({
      port,
      open: await checkPort(ip, port),
    })),
  );

  return checks.filter((check) => check.open).map((check) => check.port);
}

function detectDeviceType(
  ip,
  mac,
  openPorts,
  hostname,
  vendor = "Unknown",
  hostnameSource = "unresolved",
  gatewayCandidates = new Set(),
) {
  const lowerHostname = hostname.toLowerCase();
  const lowerVendor = vendor.toLowerCase();
  const gateway = isGatewayCandidate(ip, gatewayCandidates);
  const networkVendor = NETWORK_DEVICE_VENDORS.some((name) =>
    lowerVendor.includes(name),
  );

  if (
    gateway ||
    openPorts.some((port) => NETWORK_PORTS.includes(port)) ||
    networkVendor ||
    lowerHostname.includes("router") ||
    lowerHostname.includes("gateway")
  ) {
    return "Network Device";
  }

  if (
    openPorts.some((port) => PRINTER_PORTS.includes(port)) ||
    lowerHostname.includes("printer") ||
    lowerVendor.includes("epson") ||
    lowerVendor.includes("canon") ||
    lowerVendor.includes("brother") ||
    lowerVendor.includes("xerox")
  ) {
    return "Printer";
  }

  if (openPorts.some((port) => WINDOWS_PORTS.includes(port))) {
    return "PC";
  }

  if (hostnameSource === "netbios") {
    return "PC";
  }

  if (openPorts.includes(22)) {
    return "Linux/Server";
  }

  if (openPorts.some((port) => MOBILE_PORTS.includes(port))) {
    return "Mobile";
  }

  if (
    lowerHostname.includes("iphone") ||
    lowerHostname.includes("ipad") ||
    lowerHostname.includes("android") ||
    lowerHostname.includes("phone")
  ) {
    return "Mobile";
  }

  if (
    lowerHostname.includes("laptop") ||
    lowerHostname.includes("notebook") ||
    lowerHostname.includes("macbook")
  ) {
    return "Laptop";
  }

  if (
    lowerHostname.includes("desktop") ||
    lowerHostname.includes("workstation") ||
    lowerHostname.includes("laptop") ||
    lowerHostname.includes("pc-") ||
    lowerHostname.startsWith("pc")
  ) {
    return "PC";
  }

  if (
    lowerVendor.includes("intel") ||
    lowerVendor.includes("realtek") ||
    lowerVendor.includes("dell") ||
    lowerVendor.includes("hewlett") ||
    lowerVendor.includes("hp") ||
    lowerVendor.includes("lenovo") ||
    lowerVendor.includes("microsoft") ||
    lowerVendor.includes("asustek") ||
    lowerVendor.includes("micro-star") ||
    lowerVendor.includes("gigabyte") ||
    lowerVendor.includes("vmware") ||
    lowerVendor.includes("virtualbox") ||
    lowerVendor.includes("parallels")
  ) {
    return "PC";
  }

  if (
    lowerVendor.includes("apple") ||
    lowerVendor.includes("samsung") ||
    lowerVendor.includes("xiaomi") ||
    lowerVendor.includes("oppo") ||
    lowerVendor.includes("vivo") ||
    lowerVendor.includes("huawei") ||
    lowerVendor.includes("private / randomized")
  ) {
    return "Mobile";
  }

  if (!mac || mac === "Unknown") return "Unknown";

  const macPrefix = getMacPrefix(mac);

  const mobileOUIs = [
    "001018", "00238C", "001217", "0080C6", "086C39", "0C8DEB", "185AED", "1C3647", "2426C0", "34363B", "38F9D3", "3C2EFF", "3CBAF8", "48A482", "4C87FB", "50E551", "509A4C", "60F81D", "68A86B", "705F43", "74C25D", "7C1007", "7C2658", "ACBC32", "A0D2B8", "AAABBC", "AABBCC", "BC0A45", "E01040", "FAFFFF", "001E46", "0021E9", "0054A4", "105C7E", "1C328D", "201E77", "2859A6", "2CC4D7", "34C38A", "440AF9", "5065F3", "60A10D", "68873E", "685BEC", "6CC2CB", "7042B5", "78DBBF", "7C1E52", "8CD21E", "98B0E9", "ACDC38", "BC4CC4", "C0F2FA", "D076F0", "F03F2E", "F4E9D4", "0020E0", "001083", "0010FA", "001E72", "002152", "002256", "001A3A", "001E8F"
  ];

  if (mobileOUIs.includes(macPrefix)) {
    return "Mobile";
  }

  return "PC";
}

function getDeviceKind(deviceType, vendor, openPorts, gateway) {
  if (deviceType === "Network Device") {
    return getNetworkDeviceKind(vendor, openPorts, gateway) || "Network device";
  }

  if (deviceType === "Linux/Server") return "Linux/SSH device";
  if (deviceType === "Laptop") return "Laptop";
  if (deviceType === "PC") return "PC";
  if (deviceType === "Mobile") return "Mobile device";
  if (deviceType === "Printer") return "Printer";

  return "Unknown";
}

function canDeployAgent(deviceType) {
  return ["PC", "Laptop"].includes(deviceType);
}

export async function scanLocalNetwork() {
  const subnet = getLocalSubnet();

  if (!subnet) {
    updateSnapshot({
      status: "error",
      progress: 0,
      subnet: null,
      message: "No active IPv4 subnet was found.",
    });
    return [];
  }

  updateSnapshot({
    status: "scanning",
    progress: 5,
    subnet,
    message: "Pinging local subnet...",
  });

  const ipAddresses = Array.from({ length: 254 }, (_, index) => {
    return `${subnet}.${index + 1}`;
  });
  const gatewayCandidates = getLocalGatewayCandidates(subnet);

  const nmapResultsPromise = runNmapPingScan(subnet);
  const registeredClientsPromise = getAllClients().catch(() => []);
  await Promise.all(ipAddresses.map((ip) => pingHost(ip)));
  updateSnapshot({
    progress: 35,
    message: "Reading ARP and nmap discovery results...",
  });
  const arpTable = await readArpTable();
  const nmapResults = await nmapResultsPromise;
  const registeredClients = await registeredClientsPromise;
  const registeredByIp = new Map(
    registeredClients
      .filter((client) => client.ip)
      .map((client) => [client.ip, client]),
  );

  const devices = await Promise.all(
    ipAddresses
      .map(async (ip) => {
        const nmapDevice = nmapResults.get(ip);
        const registeredClient = registeredByIp.get(ip);
        const mac =
          nmapDevice?.mac && nmapDevice.mac !== "Unknown"
            ? nmapDevice.mac
            : findMacForIp(arpTable, ip);

        if (mac === "Unknown") {
          return null;
        }

        const [{ hostname, source }, openPorts] = await Promise.all([
          getHostnameForIp(ip),
          getOpenPorts(ip),
        ]);
        const scannedHostname =
          nmapDevice?.hostname && nmapDevice.hostname !== "Unknown"
            ? nmapDevice.hostname
            : hostname;
        const resolvedHostname = getDisplayHostname(
          ip,
          scannedHostname,
          registeredClient,
        );
        const hostnameSource =
          registeredClient?.hostname
            ? "sentrix_agent"
            : nmapDevice?.hostname_source && nmapDevice.hostname_source !== "unresolved"
            ? nmapDevice.hostname_source
            : source === "unresolved"
            ? "scan"
            : source;
        const vendor = resolveVendor(nmapDevice?.vendor, mac);
        const device_type = registeredClient
          ? "PC"
          : detectDeviceType(
              ip,
              mac,
              openPorts,
              resolvedHostname,
              vendor,
              hostnameSource,
              gatewayCandidates,
            );
        const gateway = isGatewayCandidate(ip, gatewayCandidates);
        const device_kind = getDeviceKind(device_type, vendor, openPorts, gateway);

        return {
          ip,
          mac,
          hostname: resolvedHostname,
          hostname_source: hostnameSource,
          vendor,
          device_type,
          device_kind,
          gateway,
          open_ports: openPorts,
          deploy_eligible: canDeployAgent(device_type),
        };
      })
      .filter((device) => device !== null),
  );

  const discoveredDevices = devices.filter((device) => device !== null);
  lastScanResults.clear();
  discoveredDevices.forEach((device) => lastScanResults.set(device.ip, device));

  updateSnapshot({
    status: "idle",
    progress: 100,
    subnet,
    devices: discoveredDevices,
    lastScanAt: Date.now(),
    nextScanAt: Date.now() + AUTO_SCAN_INTERVAL_MS,
    message: `Found ${discoveredDevices.length} network devices.`,
  });

  return discoveredDevices;
}

export async function runDiscoveryScan() {
  if (activeScanPromise) {
    return activeScanPromise;
  }

  activeScanPromise = scanLocalNetwork()
    .catch((error) => {
      updateSnapshot({
        status: "error",
        progress: 0,
        message: error.message || "Discovery scan failed.",
        nextScanAt: Date.now() + AUTO_SCAN_INTERVAL_MS,
      });

      return latestSnapshot.devices;
    })
    .finally(() => {
      activeScanPromise = null;
    });

  return activeScanPromise;
}

export function startDiscoveryScheduler(io) {
  const emitSnapshot = () => {
    io.to("dashboards").emit("discovery:update", getDiscoverySnapshot());
  };

  const runAndEmit = async () => {
    emitSnapshot();
    await runDiscoveryScan();
    emitSnapshot();
  };

  setInterval(emitSnapshot, 1500);
  setTimeout(runAndEmit, 3000);
  setInterval(runAndEmit, AUTO_SCAN_INTERVAL_MS);
}

async function deployAgentViaAdminPush(ip, credentials, serverUrl) {
  const agentExePath = path.resolve(__dirname, "../../../sentrix-agent/dist/sentrix-agent.exe");
  const assetsPath = path.resolve(__dirname, "../../../sentrix-agent/dist/assets");
  
  if (!fs.existsSync(agentExePath)) {
    throw new Error(`Agent executable not found at ${agentExePath}. Run 'npm run build:exe' in the sentrix-agent directory first.`);
  }

  const { username, password } = credentials;
  
  const b64 = (str) => Buffer.from(str || "").toString("base64");

  const pushScript = `
    \$ip = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(ip)}'))
    \$user = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(username)}'))
    \$passRaw = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(password)}'))
    \$url = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(serverUrl)}'))
    
    \$pass = \$passRaw | ConvertTo-SecureString -AsPlainText -Force
    \$cred = New-Object System.Management.Automation.PSCredential(\$user, \$pass)
    
    \$targetDir = "C:\\\\ProgramData\\\\SentrixAgent"
    
    Write-Host "Mapping administrative share..."
    \$driveName = "SentrixPush"
    if (Get-PSDrive \$driveName -ErrorAction SilentlyContinue) { Remove-PSDrive \$driveName -Force }
    New-PSDrive -Name \$driveName -PSProvider FileSystem -Root "\\\\\$ip\\C\$" -Credential \$cred -ErrorAction Stop
    
    try {
        \$remotePath = "\${driveName}:\\\\ProgramData\\\\SentrixAgent"
        if (-not (Test-Path \$remotePath)) {
            New-Item -ItemType Directory -Path \$remotePath -Force | Out-Null
        }
        
        Write-Host "Copying agent files..."
        Copy-Item -Path "${agentExePath.replace(/\\/g, "\\\\")}" -Destination "\$remotePath\\sentrix-agent.exe" -Force
        if (Test-Path "${assetsPath.replace(/\\/g, "\\\\")}") {
            Copy-Item -Path "${assetsPath.replace(/\\/g, "\\\\")}" -Destination \$remotePath -Recurse -Force
        }
        
        "SENTRIX_SERVER_URL=\$url" | Out-File -FilePath "\$remotePath\\.env" -Encoding utf8
        
        Write-Host "Triggering remote installation via WMI..."
        \$innerCommand = @"
            \`$dir = 'C:\\ProgramData\\SentrixAgent'
            # Registration and Start
            \`$action = New-ScheduledTaskAction -Execute "\`$dir\\sentrix-agent.exe" -Argument "--server-url $url" -WorkingDirectory \`$dir
            \`$trigger = New-ScheduledTaskTrigger -AtStartup
            \`$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest
            \`$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
            
            # Remove existing task if any
            Unregister-ScheduledTask -TaskName 'Sentrix Agent' -Confirm:\`$false -ErrorAction SilentlyContinue
            
            Register-ScheduledTask -TaskName 'Sentrix Agent' -Action \`$action -Trigger \`$trigger -Principal \`$principal -Settings \`$settings -Force
            Start-ScheduledTask -TaskName 'Sentrix Agent'
            
            # Lockdown Phase: Re-secure the machine
            Write-Host 'Securing machine...'
            Disable-LocalUser -Name 'Administrator' -ErrorAction SilentlyContinue
            Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System' -Name 'LocalAccountTokenFilterPolicy' -Value 0 -ErrorAction SilentlyContinue
            \`$rules = @('WINRM-HTTP-In-TCP', 'WINRM-HTTP-In-TCP-PUBLIC', 'FPS-SMB-In-TCP', 'WMI-In-TCP')
            foreach (\$rule in \$rules) { Disable-NetFirewallRule -Name \$rule -ErrorAction SilentlyContinue }
"@
        
        $encodedCommand = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($innerCommand))
        $commandLine = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand $encodedCommand"
        
        try {
            \$result = Invoke-WmiMethod -Path Win32_Process -Name Create -ArgumentList \$commandLine -ComputerName \$ip -Credential \$cred
            if (\$result.ReturnValue -ne 0) {
                throw "Failed to start remote installation process via WMI. ReturnValue: \$(\$result.ReturnValue)"
            }
        } catch {
            if (\$_.Exception.Message -match "RPC server is unavailable") {
                Write-Host "Note: Connection closed during lockdown (Graceful Disconnect). This is expected as the firewall is now secured."
            } else {
                throw \$_
            }
        }
    } finally {
        Remove-PSDrive -Name \$driveName -Force -ErrorAction SilentlyContinue
    }
  `;

  try {
    await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", pushScript], { timeout: 90000 });
  } catch (error) {
    const stderr = error.stderr ? `\nStderr: ${error.stderr}` : "";
    throw new Error(`${error.message}${stderr}`);
  }
}

export async function deployAgentToHostRemote(ip, credentials = null) {
  const serverUrl = process.env.SENTRIX_PUBLIC_SERVER_URL
    || process.env.CORE_PUBLIC_URL
    || process.env.BACKEND_URL
    || `http://${getPrimaryInterfaceAddress() || "localhost"}:${process.env.PORT || 4000}`;

  if (!credentials) {
    return {
      success: false,
      message: "Credentials are required for remote deployment.",
      needsCredentials: true,
      ip
    };
  }

  try {
    const { username, password } = credentials;
    const agentExePath = path.resolve(__dirname, "../../../sentrix-agent/dist/sentrix-agent.exe");
    const assetsPath = path.resolve(__dirname, "../../../sentrix-agent/dist/assets");

    if (!fs.existsSync(agentExePath)) {
      throw new Error(`Agent executable not found at ${agentExePath}. Run 'npm run build:exe' in the sentrix-agent directory first.`);
    }

    const b64 = (str) => Buffer.from(str || "").toString("base64");

    const winrmScript = `
      \$ip = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(ip)}'))
      \$user = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(username)}'))
      \$passRaw = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(password)}'))
      \$url = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(serverUrl)}'))

      \$pass = \$passRaw | ConvertTo-SecureString -AsPlainText -Force
      \$cred = New-Object System.Management.Automation.PSCredential(\$user, \$pass)
      
      # Add to TrustedHosts if not already present (Best Effort)
      try {
          \$localIsAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
          if (\$localIsAdmin) {
              \$currentTrusted = (Get-Item WSMan:\\localhost\\Client\\TrustedHosts).Value
              \$trustedList = if (\$currentTrusted) { \$currentTrusted.Split(',') } else { @() }
              if (\$trustedList -notcontains \$ip -and \$currentTrusted -ne '*') {
                  \$newTrusted = if (\$currentTrusted) { "\$currentTrusted,\$ip" } else { \$ip }
                  Set-Item WSMan:\\localhost\\Client\\TrustedHosts -Value \$newTrusted -Force
              }
          }
      } catch {
          # Silently ignore TrustedHosts access errors
      }

      \$targetDir = "C:\\\\ProgramData\\\\SentrixAgent"
      \$session = New-PSSession -ComputerName \$ip -Credential \$cred -ErrorAction Stop

      try {
          Invoke-Command -Session \$session -ScriptBlock {
              param(\$dir)
              if (-not (Test-Path \$dir)) { New-Item -ItemType Directory -Path \$dir -Force }
          } -ArgumentList \$targetDir

          Copy-Item -Path "${agentExePath.replace(/\\/g, "\\\\")}" -Destination "\$targetDir\\\\sentrix-agent.exe" -ToSession \$session
          if (Test-Path "${assetsPath.replace(/\\/g, "\\\\")}") {
              Copy-Item -Path "${assetsPath.replace(/\\/g, "\\\\")}" -Destination "\$targetDir" -Recurse -Force -ToSession \$session
          }

          Invoke-Command -Session \$session -ScriptBlock {
              param(\$dir, \$u)
              \$envContent = "SENTRIX_SERVER_URL=\$u"
              \$envContent | Out-File -FilePath "\$dir\\.env" -Encoding utf8
              
              \$action = New-ScheduledTaskAction -Execute "\$dir\\sentrix-agent.exe" -Argument "--server-url \$u" -WorkingDirectory \$dir
              \$trigger = New-ScheduledTaskTrigger -AtStartup
              \$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
              \$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
              
              # Remove existing task if any
              Unregister-ScheduledTask -TaskName "Sentrix Agent" -Confirm:\$false -ErrorAction SilentlyContinue
              
              Register-ScheduledTask -TaskName "Sentrix Agent" -Action \$action -Trigger \$trigger -Principal \$principal -Settings \$settings -Force
              Start-ScheduledTask -TaskName "Sentrix Agent"

              # Lockdown Phase: Re-secure the machine
              Disable-LocalUser -Name "Administrator" -ErrorAction SilentlyContinue
              Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" -Name "LocalAccountTokenFilterPolicy" -Value 0 -ErrorAction SilentlyContinue
              \$rules = @("WINRM-HTTP-In-TCP", "WINRM-HTTP-In-TCP-PUBLIC", "FPS-SMB-In-TCP", "WMI-In-TCP")
              foreach (\$rule in \$rules) { Disable-NetFirewallRule -Name \$rule -ErrorAction SilentlyContinue }
          } -ArgumentList \$targetDir, \$url
      } finally {
          Remove-PSSession \$session
      }
    `;

    try {
      await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", winrmScript], { timeout: 60000 });
    } catch (error) {
      const stderr = error.stderr ? `\nStderr: ${error.stderr}` : "";
      console.error(`[Deployment] WinRM command execution failed for ${ip}:${stderr}\nMessage: ${error.message}`);
      
      let enhancedMessage = error.message;
      if (stderr.includes("ServerNotTrusted") || stderr.includes("TrustedHosts")) {
        enhancedMessage = "WinRM Trust Error: Your server PC does not trust the target machine. START YOUR TERMINAL AS ADMINISTRATOR, or run 'Set-Item WSMan:\\localhost\\Client\\TrustedHosts -Value \"*\" -Force' in an Admin PowerShell once.";
      }
      
      throw new Error(`${enhancedMessage}${stderr}`);
    }
    return { success: true, message: `Successfully deployed agent to ${ip} via WinRM`, ip };
  } catch (winrmError) {
    console.log(`[Deployment] WinRM connection failed for ${ip}. Trying Zero-Touch Admin Push...`);

    try {
      await deployAgentViaAdminPush(ip, credentials, serverUrl);
      console.log(`[Deployment] Successfully deployed agent to ${ip} via Zero-Touch Admin Push.`);
      return { success: true, message: `Successfully deployed agent to ${ip} via Zero-Touch Admin Push`, ip };
    } catch (pushError) {
      console.error(`[Deployment] Admin Push execution failed for ${ip}:\n${pushError.message}`);
      let message = pushError.message;
      if (message.includes("Access is denied")) {
        message = "Blocked by UAC: Windows restricted remote access. Ensure you have run the 'Sentrix Master Prep' script on the target PC and are using the built-in 'Administrator' account.";
      } else if (message.includes("network name cannot be found")) {
        message = "PC Offline: The target computer could not be found on the network. Check the IP address and ensure the PC is turned on.";
      } else if (message.includes("RPC server is unavailable")) {
        message = "Firewall Blocked (RPC/WMI): The WMI service is blocked by the target PC's firewall. Run the UPDATED 'Sentrix Master Prep' script on the target PC to open the necessary ports and start WMI.";
      } else if (message.includes("logon failure") || message.includes("unknown user name or bad password")) {
        message = "Login Failed: The username or password you entered is incorrect.";
      } else if (message.includes("WinRM client cannot process the request")) {
        message = "WinRM Disabled: Remote management is not enabled on the target PC. Run the 'Sentrix Master Prep' script to enable WinRM and TrustedHosts.";
      } else if (winrmError.message.includes("WinRM Trust Error")) {
        message = winrmError.message.split("\n")[0];
      } else {
        message = `Deployment failed: ${message.split("\n")[0]}`;
      }

      return { success: false, message, ip };
    }
  }
}

export async function deployAgentToHost(ip, credentials = null) {
  const scannedDevice = lastScanResults.get(ip);
  const serverUrl = process.env.SENTRIX_PUBLIC_SERVER_URL
    || process.env.CORE_PUBLIC_URL
    || process.env.BACKEND_URL
    || `http://${getPrimaryInterfaceAddress() || "localhost"}:${process.env.PORT || 4000}`;

  if (credentials) {
    return await deployAgentToHostRemote(ip, credentials);
  }

  if (!scannedDevice) {
    return {
      success: false,
      message: "Manual deployment requires credentials. Otherwise, deployment is only available for devices found in the latest scan.",
      ip,
    };
  }

  return {
    success: true,
    message: `Deployment package prepared for ${ip}. Run the standalone agent on the target PC or provide credentials for remote deployment.`,
    ip,
    device: scannedDevice,
    serverUrl,
    installer: {
      type: "standalone-exe",
      agent: "sentrix-agent/dist/sentrix-agent.exe",
      command: `sentrix-agent.exe --server-url "${serverUrl}"`,
    },
  };
}
