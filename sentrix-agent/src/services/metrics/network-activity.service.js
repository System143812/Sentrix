import si from "systeminformation";
import { execFile } from "child_process";
import { promisify } from "util";
import { promises as dnsPromises } from "dns";
import { collectSafely, safeString } from "./helpers.js";

const execFileAsync = promisify(execFile);
const RESOLUTION_CACHE = new Map();

const NOISE_DOMAINS = [
  "trafficmanager.net",
  "aadg.windows.net",
  "microsoft.com",
  "windowsupdate.com",
  "akamaitechnologies.com",
  "msedge.net",
  "gvt1.com",
  "delivery.mp.microsoft.com",
  "azure.com",
  "amazonaws.com",
];

/**
 * Universal Resolution: Scrapes OS DNS cache and matches with ANY active connection.
 * Also fetches process names directly via PowerShell for 100% reliability on Windows.
 */
async function getHighSignalData() {
  if (process.platform !== "win32") return { dnsMap: new Map(), processMap: new Map() };

  try {
    const script = `
      $dnsCache = Get-DnsClientCache | Where-Object { $_.Type -eq 1 -or $_.Type -eq 28 } | Select-Object Name, Data
      $connections = Get-NetTCPConnection -State Established | Select-Object RemoteAddress, OwningProcess
      $procs = Get-Process | Select-Object Id, Name
      
      $mappedConns = $connections | ForEach-Object {
        $id = $_.OwningProcess
        $p = $procs | Where-Object { $_.Id -eq $id }
        [PSCustomObject]@{ 
          IP = $_.RemoteAddress
          Process = if ($p) { $p.Name } else { "System" }
        }
      }
      
      $results = @{
        dns = $dnsCache
        conns = $mappedConns
      }
      $results | ConvertTo-Json
    `;

    const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-Command", script], { 
      timeout: 8000,
      windowsHide: true,
      maxBuffer: 1024 * 1024 
    });

    if (!stdout) return { dnsMap: new Map(), processMap: new Map() };
    const data = JSON.parse(stdout);
    
    const dnsMap = new Map(); 
    const dnsResults = Array.isArray(data.dns) ? data.dns : (data.dns ? [data.dns] : []);
    
    dnsResults.forEach(item => {
      const ip = safeString(item.Data);
      const domain = safeString(item.Name).toLowerCase();
      if (!ip || !domain) return;
      
      if (!dnsMap.has(ip)) dnsMap.set(ip, new Set());
      dnsMap.get(ip).add(domain);
    });

    const processMap = new Map();
    const connResults = Array.isArray(data.conns) ? data.conns : (data.conns ? [data.conns] : []);
    connResults.forEach(item => {
      if (item.IP && item.Process) {
        processMap.set(item.IP, item.Process);
      }
    });

    return { dnsMap, processMap };
  } catch (err) {
    return { dnsMap: new Map(), processMap: new Map() };
  }
}

async function resolveIpToDomain(ip) {
  if (RESOLUTION_CACHE.has(ip)) return RESOLUTION_CACHE.get(ip);
  
  try {
    const hostnames = await dnsPromises.reverse(ip);
    if (hostnames && hostnames.length > 0) {
      const domain = hostnames[0].toLowerCase();
      RESOLUTION_CACHE.set(ip, domain);
      return domain;
    }
  } catch (err) {
    // Fail silently, don't cache to allow retry
  }
  return null;
}

function getBaseDomain(domain) {
  if (!domain) return null;
  const parts = domain.split(".");
  if (parts.length <= 2) return domain;
  
  const lastTwo = parts.slice(-2).join(".");
  if (lastTwo === "googlevideo.com" || lastTwo === "gstatic.com" || lastTwo === "ggpht.com") return "youtube.com";
  if (lastTwo === "fbcdn.net") return "facebook.com";
  
  return lastTwo;
}

let LAST_GOOD_ACTIVITY = { activeConnections: [], dnsCache: [] };
let FAIL_COUNT = 0;
const MAX_RETRIES = 3;

export async function collectNetworkActivity() {
  return collectSafely(async () => {
    const [connections, { dnsMap, processMap }] = await Promise.all([
      si.networkConnections(),
      getHighSignalData()
    ]);

    const groupedMap = new Map();
    const systemNoise = ["System", "svchost.exe", "lsass.exe", "services.exe", "SearchHost.exe", "CompPkgSrv.exe", "Registry", "MemCompression"];

    for (const conn of connections) {
      // 1. UNIVERSAL NOISE FILTERING
      if (conn.state !== "ESTABLISHED") continue;
      
      const addr = conn.peerAddress;
      const procName = conn.process || processMap.get(addr) || "System";

      if (!addr || addr === "0.0.0.0" || addr === "::" || addr === "*" || addr === "127.0.0.1" || addr === "::1") {
        if (addr === "127.0.0.1" || addr === "::1") {
          const port = conn.peerPort || conn.localPort || "";
          const displayDomain = port ? `localhost:${port}` : "localhost";
          const key = `${procName}:${displayDomain}`;
          
          if (!groupedMap.has(key)) {
            groupedMap.set(key, { process: procName, domain: displayDomain, count: 1, peerAddress: addr, pid: conn.pid });
          } else {
            groupedMap.get(key).count++;
          }
        }
        continue;
      }

      if (systemNoise.includes(procName)) continue;

      // 2. SITE DETECTION (Agent uses local cache; Backend handles PTR lookups)
      const possibleDomains = Array.from(dnsMap.get(addr) || []);
      const validDomains = possibleDomains.filter(d => !NOISE_DOMAINS.some(noise => d.includes(noise)));
      
      let displayName = addr;
      let fullDomain = null;

      if (validDomains.length > 0) {
        const sorted = validDomains.sort((a, b) => a.length - b.length);
        fullDomain = sorted[0];
        displayName = getBaseDomain(fullDomain);
      }

      // 3. GROUPING
      // We group by Process + Domain + Remote Port to distinguish between services on the same host
      const port = conn.peerPort || 0;
      const key = `${procName}:${displayName}:${port}`;
      
      if (!groupedMap.has(key)) {
        groupedMap.set(key, {
          process: procName,
          domain: displayName,
          fullDomain: fullDomain !== displayName ? fullDomain : null,
          peerAddress: addr,
          peerPort: port,
          count: 1,
          pid: conn.pid
        });
      } else {
        groupedMap.get(key).count++;
      }
    }

    const activeConnections = Array.from(groupedMap.values())
      .slice(0, 50);

    // Stability Logic: Cache successful results to prevent flickering on intermittent collection failures
    if (activeConnections.length > 0) {
      LAST_GOOD_ACTIVITY = { activeConnections, dnsCache: [] };
      FAIL_COUNT = 0;
      return LAST_GOOD_ACTIVITY;
    } else {
      // If we got 0 connections, maybe the collection cycle was too slow.
      // Use cache for a few cycles before actually reporting 0.
      if (FAIL_COUNT < MAX_RETRIES && LAST_GOOD_ACTIVITY.activeConnections.length > 0) {
        FAIL_COUNT++;
        return LAST_GOOD_ACTIVITY;
      }
      return { activeConnections: [], dnsCache: [] };
    }
  }, () => {
    // On hard error, fallback to cache if available
    if (FAIL_COUNT < MAX_RETRIES && LAST_GOOD_ACTIVITY.activeConnections.length > 0) {
      FAIL_COUNT++;
      return LAST_GOOD_ACTIVITY;
    }
    return { activeConnections: [], dnsCache: [] };
  });
}
