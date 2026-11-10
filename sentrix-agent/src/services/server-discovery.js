import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import https from "https";
import fs from "fs";

const execFileAsync = promisify(execFile);

/**
 * Normalizes a MAC address to lowercase colon-separated format.
 * e.g. "AA-BB-CC-DD-EE-FF" → "aa:bb:cc:dd:ee:ff"
 */
function normalizeMac(mac) {
  return String(mac || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, ":");
}

/**
 * Gets the agent's local subnet and netmask from the primary interface.
 * Returns { subnet: "192.168.1", ip: "192.168.1.50" } or null.
 */
function getLocalSubnet() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, records] of Object.entries(interfaces)) {
    for (const record of records || []) {
      if (record.family === "IPv4" && !record.internal) {
        const isVirtual = /virtual|vbox|vmware|docker|veth|vpn|sandbox/i.test(name);
        const isCommonLan =
          record.address.startsWith("192.168.") || record.address.startsWith("10.");

        candidates.push({
          name,
          address: record.address,
          netmask: record.netmask,
          isVirtual,
          isCommonLan,
        });
      }
    }
  }

  // Prefer physical LAN adapters
  candidates.sort((a, b) => {
    if (a.isVirtual !== b.isVirtual) return a.isVirtual ? 1 : -1;
    if (a.isCommonLan !== b.isCommonLan) return a.isCommonLan ? -1 : 1;
    return 0;
  });

  if (candidates.length === 0) return null;

  const best = candidates[0];
  const parts = best.address.split(".");
  // For a /24 subnet (most common in LAN)
  const subnet = parts.slice(0, 3).join(".");
  return { subnet, ip: best.address };
}

/**
 * Pings a range of IPs on the subnet to populate the ARP table.
 * Uses parallel ping with short timeout.
 */
async function pingSweep(subnet) {
  const pingArgs =
    process.platform === "win32"
      ? (ip) => ["-n", "1", "-w", "300", ip]
      : (ip) => ["-c", "1", "-W", "1", ip];

  // Ping in batches of 30 to avoid overwhelming the system
  const BATCH_SIZE = 30;

  for (let start = 1; start <= 254; start += BATCH_SIZE) {
    const batch = [];
    for (let i = start; i < Math.min(start + BATCH_SIZE, 255); i++) {
      const ip = `${subnet}.${i}`;
      batch.push(
        execFileAsync("ping", pingArgs(ip), { timeout: 2000 }).catch(() => {})
      );
    }
    await Promise.all(batch);
  }
}

/**
 * Reads the system ARP table and returns a Map of IP → normalized MAC.
 */
async function readArpTable() {
  try {
    const { stdout } = await execFileAsync("arp", ["-a"], { timeout: 5000 });
    const entries = new Map();

    // Windows ARP output format: "  192.168.1.1     aa-bb-cc-dd-ee-ff     dynamic"
    // Linux ARP output format: "? (192.168.1.1) at aa:bb:cc:dd:ee:ff [ether] on eth0"
    const lines = stdout.split(/\r?\n/);
    for (const line of lines) {
      let ip, mac;
      if (process.platform === "win32") {
        const match = line.match(
          /^\s*(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-f]{2}(?:[:-][0-9a-f]{2}){5})\s+/i
        );
        if (match) {
          ip = match[1];
          mac = normalizeMac(match[2]);
        }
      } else {
        const match = line.match(
          /\((\d{1,3}(?:\.\d{1,3}){3})\)\s+at\s+([0-9a-f]{2}(?::[0-9a-f]{2}){5})/i
        );
        if (match) {
          ip = match[1];
          mac = normalizeMac(match[2]);
        }
      }

      if (ip && mac && mac !== "ff:ff:ff:ff:ff:ff" && mac !== "00:00:00:00:00:00") {
        entries.set(ip, mac);
      }
    }

    return entries;
  } catch {
    return new Map();
  }
}

/**
 * Quick HTTPS probe to verify a candidate IP is actually a Sentrix server.
 * Connects to port and checks that the server responds.
 */
function probeSentrixServer(ip, port) {
  return new Promise((resolve) => {
    const url = `https://${ip}:${port}/api/health`;
    const req = https.get(
      url,
      { rejectUnauthorized: false, timeout: 3000 },
      (res) => {
        // Any response (even 404) from the right port means it's our server
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          resolve(true);
        });
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Discovers the Sentrix server by scanning the local subnet ARP table
 * for the server's known MAC address.
 *
 * @param {Object} options
 * @param {string} options.serverMac - The MAC address of the server (persisted from last registration)
 * @param {number} [options.port=4000] - The port the server runs on
 * @returns {Promise<string|null>} The new server URL, or null if not found
 */
export async function discoverServerByMac({ serverMac, port = 4000 }) {
  if (!serverMac) {
    throw new Error("No server MAC address stored. Cannot perform MAC-based discovery.");
  }

  const targetMac = normalizeMac(serverMac);
  const localNet = getLocalSubnet();
  if (!localNet) {
    throw new Error("Cannot determine local subnet for discovery scan.");
  }

  console.log(`[Discovery] Scanning subnet ${localNet.subnet}.0/24 for server MAC ${targetMac}...`);

  // 1. Read existing ARP table first (may already have the entry from recent traffic)
  let arpEntries = await readArpTable();
  let foundIp = findIpByMac(arpEntries, targetMac);

  // 2. If not found, do a ping sweep to populate ARP cache, then re-read
  if (!foundIp) {
    console.log("[Discovery] Server not in ARP cache. Running ping sweep...");
    await pingSweep(localNet.subnet);
    arpEntries = await readArpTable();
    foundIp = findIpByMac(arpEntries, targetMac);
  }

  if (!foundIp) {
    throw new Error(`Discovery: server MAC ${targetMac} not found on subnet ${localNet.subnet}.0/24`);
  }

  console.log(`[Discovery] Found server MAC at IP: ${foundIp}. Verifying...`);

  // 3. Verify it's actually a Sentrix server by probing the HTTPS port
  const isValid = await probeSentrixServer(foundIp, port);
  if (!isValid) {
    throw new Error(`Discovery: found MAC match at ${foundIp} but HTTPS probe on port ${port} failed.`);
  }

  const newUrl = `https://${foundIp}:${port}`;
  console.log(`[Discovery] Verified Sentrix server at ${newUrl}`);
  return newUrl;
}

/**
 * Searches the ARP entries map for an IP matching the target MAC.
 */
function findIpByMac(arpEntries, targetMac) {
  for (const [ip, mac] of arpEntries) {
    if (mac === targetMac) return ip;
  }
  return null;
}

/**
 * Updates the SENTRIX_SERVER_URL in the agent's runtime .env file and process.env.
 */
export function updateEnvServerUrl(runtimeEnvPath, newServerUrl) {
  try {
    let envContent = "";
    if (fs.existsSync(runtimeEnvPath)) {
      envContent = fs.readFileSync(runtimeEnvPath, "utf8");
    }

    const lines = envContent.split(/\r?\n/);
    let found = false;
    const nextLines = lines.map(line => {
      if (line.trim().startsWith("SENTRIX_SERVER_URL=")) {
        found = true;
        return `SENTRIX_SERVER_URL=${newServerUrl}`;
      }
      return line;
    });

    if (!found) {
      nextLines.push(`SENTRIX_SERVER_URL=${newServerUrl}`);
    }

    fs.writeFileSync(runtimeEnvPath, nextLines.join("\n").replace(/\n*$/, "\n"), "utf8");
    process.env.SENTRIX_SERVER_URL = newServerUrl;
    console.log(`[Discovery] Successfully updated SENTRIX_SERVER_URL to ${newServerUrl} in ${runtimeEnvPath}`);
  } catch (err) {
    console.error(`[Discovery] Failed to update runtime .env:`, err.message);
  }
}

/**
 * Persists the server MAC address to the agent's runtime .env file.
 */
export function saveServerMac(runtimeEnvPath, serverMac) {
  if (!serverMac) return;

  try {
    let envContent = "";
    if (fs.existsSync(runtimeEnvPath)) {
      envContent = fs.readFileSync(runtimeEnvPath, "utf8");
    }

    const lines = envContent.split(/\r?\n/);
    let found = false;
    const nextLines = lines.map(line => {
      if (line.trim().startsWith("SENTRIX_SERVER_MAC=")) {
        found = true;
        return `SENTRIX_SERVER_MAC=${serverMac}`;
      }
      return line;
    });

    if (!found) {
      nextLines.push(`SENTRIX_SERVER_MAC=${serverMac}`);
    }

    fs.writeFileSync(runtimeEnvPath, nextLines.join("\n").replace(/\n*$/, "\n"), "utf8");
    process.env.SENTRIX_SERVER_MAC = serverMac;
    console.log(`[Discovery] Persisted server MAC: ${serverMac}`);
  } catch (err) {
    console.error(`[Discovery] Failed to save server MAC:`, err.message);
  }
}
