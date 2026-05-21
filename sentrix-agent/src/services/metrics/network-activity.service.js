import si from "systeminformation";
import { execFile } from "child_process";
import { promisify } from "util";
import { collectSafely, safeString } from "./helpers.js";

const execFileAsync = promisify(execFile);

async function getDnsCache() {
  if (process.platform !== "win32") return [];

  try {
    // Get-DnsClientCache returns Name (Domain) and Data (IP)
    // We filter for Type 1 (A) or 28 (AAAA) to get actual resolved addresses
    const script = `Get-DnsClientCache | Where-Object { $_.Type -eq 1 -or $_.Type -eq 28 } | Select-Object Name, Data | ConvertTo-Json`;
    const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-Command", script], { 
      timeout: 5000,
      windowsHide: true
    });

    if (!stdout || stdout.trim() === "") return [];
    const data = JSON.parse(stdout);
    const results = Array.isArray(data) ? data : [data];

    return results.map(item => ({
      domain: safeString(item.Name),
      resolvedAddress: safeString(item.Data)
    }));
  } catch {
    return [];
  }
}

export async function collectNetworkActivity() {
  return collectSafely(async () => {
    const [connections, dnsCache] = await Promise.all([
      si.networkConnections(),
      getDnsCache()
    ]);

    // Map DNS cache for quick lookup
    const dnsMap = new Map();
    dnsCache.forEach(item => {
      dnsMap.set(item.resolvedAddress, item.domain);
    });

    // Process connections to include domain names if available
    const activeConnections = connections
      .filter(conn => conn.state === "ESTABLISHED" || conn.state === "LISTEN")
      .slice(0, 50) // Limit to avoid massive payload
      .map(conn => ({
        protocol: conn.protocol,
        localAddress: conn.localAddress,
        localPort: conn.localPort,
        peerAddress: conn.peerAddress,
        peerPort: conn.peerPort,
        state: conn.state,
        pid: conn.pid,
        process: conn.process,
        domain: dnsMap.get(conn.peerAddress) || null
      }));

    return {
      activeConnections,
      dnsCache: dnsCache.slice(0, 100) // Top 100 entries
    };
  }, {
    activeConnections: [],
    dnsCache: []
  });
}
