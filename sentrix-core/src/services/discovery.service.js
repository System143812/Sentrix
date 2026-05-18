import { execFile } from "child_process";
import os from "os";
import { promisify } from "util";
import dns from "dns";
import net from "net";
import { getAllClients } from "./client.services.js";

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
  const interfaces = os.networkInterfaces();

  for (const records of Object.values(interfaces)) {
    for (const record of records || []) {
      if (record.family === "IPv4" && !record.internal) {
        const parts = record.address.split(".");
        return `${parts[0]}.${parts[1]}.${parts[2]}`;
      }
    }
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

  for (const records of Object.values(interfaces)) {
    for (const record of records || []) {
      if (record.family === "IPv4" && !record.internal) {
        return record.address;
      }
    }
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
    // Try other local name sources below.
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
      // NetBIOS name lookup is best-effort.
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
    // nslookup is best-effort.
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
    "001018", // Apple iPhone
    "00238C", // Apple iPad
    "001217", // Apple
    "0080C6", // Apple
    "086C39", // Apple
    "0C8DEB", // Apple
    "185AED", // Apple
    "1C3647", // Apple
    "2426C0", // Apple
    "34363B", // Apple
    "38F9D3", // Apple
    "3C2EFF", // Apple
    "3CBAF8", // Apple
    "48A482", // Apple
    "4C87FB", // Apple
    "50E551", // Apple
    "509A4C", // Apple
    "60F81D", // Apple
    "68A86B", // Apple
    "705F43", // Apple
    "74C25D", // Apple
    "7C1007", // Apple
    "7C2658", // Apple
    "ACBC32", // Apple
    "A0D2B8", // Apple
    "AAABBC", // Apple
    "AABBCC", // Apple
    "BC0A45", // Apple
    "E01040", // Apple
    "FAFFFF", // Apple
    "AABBCC", // Samsung
    "001E46", // Samsung
    "0021E9", // Samsung
    "0054A4", // Samsung
    "105C7E", // Samsung
    "1C328D", // Samsung
    "201E77", // Samsung
    "2859A6", // Samsung
    "2CC4D7", // Samsung
    "34C38A", // Samsung
    "440AF9", // Samsung
    "5065F3", // Samsung
    "60A10D", // Samsung
    "68873E", // Samsung
    "685BEC", // Samsung
    "6CC2CB", // Samsung
    "7042B5", // Samsung
    "78DBBF", // Samsung
    "7C1E52", // Samsung
    "8CD21E", // Samsung
    "98B0E9", // Samsung
    "ACDC38", // Samsung
    "BC4CC4", // Samsung
    "C0F2FA", // Samsung
    "D076F0", // Samsung
    "F03F2E", // Samsung
    "F4E9D4", // Samsung
    "0020E0", // HTC
    "001083", // HTC
    "0010FA", // HTC
    "001E72", // HTC
    "002152", // LG
    "002256", // LG
    "001A3A", // Motorola
    "001E8F", // Nokia
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

export async function deployAgentToHostRemote(ip, credentials = null) {
  const serverUrl = process.env.SENTRIX_PUBLIC_SERVER_URL
    || process.env.CORE_PUBLIC_URL
    || process.env.BACKEND_URL
    || `http://${getPrimaryInterfaceAddress() || "localhost"}:${process.env.PORT || 4000}`;

  // Paths to local artifacts
  const agentExePath = path.resolve(process.cwd(), "../sentrix-agent/dist/sentrix-agent.exe");
  const assetsPath = path.resolve(process.cwd(), "../sentrix-agent/dist/assets");

  if (!credentials) {
    return {
      success: false,
      message: "Credentials are required for remote deployment.",
      needsCredentials: true,
      ip
    };
  }

  const { username, password } = credentials;

  // PowerShell script for remote deployment
  // 1. Create directory on target
  // 2. Copy exe and assets
  // 3. Create scheduled task
  const deployScript = `
    $ip = "${ip}"
    $user = "${username}"
    $pass = "${password}" | ConvertTo-SecureString -AsPlainText -Force
    $cred = New-Object System.Management.Automation.PSCredential($user, $pass)
    
    $targetDir = "C:\\ProgramData\\SentrixAgent"
    $session = New-PSSession -ComputerName $ip -Credential $cred -ErrorAction Stop

    try {
        Invoke-Command -Session $session -ScriptBlock {
            param($dir)
            if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force }
        } -ArgumentList $targetDir

        # Copy files
        Copy-Item -Path "${agentExePath}" -Destination "$targetDir\\sentrix-agent.exe" -ToSession $session
        Copy-Item -Path "${assetsPath}" -Destination "$targetDir" -Recurse -Force -ToSession $session

        Invoke-Command -Session $session -ScriptBlock {
            param($dir, $url)
            Set-Location $dir
            
            # Register task
            $action = New-ScheduledTaskAction -Execute "$dir\\sentrix-agent.exe" -WorkingDirectory $dir
            $trigger = New-ScheduledTaskTrigger -AtStartup
            $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
            $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
            
            Register-ScheduledTask -TaskName "Sentrix Agent" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force
            Start-ScheduledTask -TaskName "Sentrix Agent"
        } -ArgumentList $targetDir, "${serverUrl}"
    } finally {
        Remove-PSSession $session
    }
  `;

  try {
    await execFileAsync("powershell.exe", ["-Command", deployScript], { timeout: 60000 });
    return { success: true, message: `Successfully deployed agent to ${ip}`, ip };
  } catch (error) {
    return { success: false, message: `Deployment failed: ${error.message}`, ip };
  }
}

export async function deployAgentToHost(ip, credentials = null) {
  const scannedDevice = lastScanResults.get(ip);
  const serverUrl = process.env.SENTRIX_PUBLIC_SERVER_URL
    || process.env.CORE_PUBLIC_URL
    || process.env.BACKEND_URL
    || `http://${getPrimaryInterfaceAddress() || "localhost"}:${process.env.PORT || 4000}`;

  if (!scannedDevice) {
    return {
      success: false,
      message: "Deploy is only available for devices found in the latest scan.",
      ip,
    };
  }

  if (!scannedDevice.deploy_eligible) {
    return {
      success: false,
      message: `Cannot deploy to ${scannedDevice.device_type} devices. Deployment is only available for scanned PCs.`,
      ip,
    };
  }

  if (credentials) {
    return await deployAgentToHostRemote(ip, credentials);
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
