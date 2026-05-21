import os from "os";
import { promisify } from "util";
import dns from "dns";
import net from "net";
import { execFile } from "child_process";
import {
  CHECK_PORT_TIMEOUT_MS,
  WINDOWS_PORTS,
  LINUX_PORTS,
  WEB_PORTS,
  MOBILE_PORTS,
  PRINTER_PORTS,
  NETWORK_PORTS,
} from "./constants.js";

const execFileAsync = promisify(execFile);
const dnsLookup = promisify(dns.reverse);

export async function commandExists(command) {
  const lookupCommand = process.platform === "win32" ? "where" : "which";

  try {
    await execFileAsync(lookupCommand, [command]);
    return true;
  } catch {
    return false;
  }
}

export async function pingHost(ip) {
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

export async function pingHostname(ip) {
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

export async function readArpTable() {
  try {
    const { stdout } = await execFileAsync("arp", ["-a"]);
    return stdout;
  } catch {
    return "";
  }
}

export async function runNmapPingScan(subnet) {
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

export function findMacForIp(arpTable, ip) {
  const line = arpTable.split("\n").find((row) => row.includes(ip));

  return line?.match(/([0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i)?.[0] ?? "Unknown";
}

export async function getHostnameForIp(ip) {
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

export function checkPort(ip, port) {
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

export async function getOpenPorts(ip) {
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

export function getLocalSubnet() {
  if (process.env.DISCOVERY_SUBNET) {
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
    return candidates[0].subnet;
  }

  return null;
}

export function getLocalGatewayCandidates(subnet) {
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

export function getPrimaryInterfaceAddress() {
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
