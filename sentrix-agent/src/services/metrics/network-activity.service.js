import si from "systeminformation";
import { execFile } from "child_process";
import { promisify } from "util";
import { promises as dnsPromises } from "dns";
import crypto from "crypto";
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
  "vortex.data.microsoft.com",
  "settings-win.data.microsoft.com",
  "events.data.microsoft.com",
  "office.com",
  "office365.com",
  "skype.com",
  "msn.com",
  "bing.com",
  "live.com",
  "outlook.com",
  "microsoftonline.com",
  "oneclient.sfx.ms",
  "skydrive.wns.windows.com"
];

const PRIVATE_IP_RANGES = [
  /^127\./, /^10\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./, /^192\.168\./, /^169\.254\./, /^::1$/, /^fe80:/
];

const BROWSERS = ["chrome.exe", "msedge.exe", "firefox.exe", "brave.exe", "opera.exe", "iexplore.exe"];
const DEV_TOOLS = ["node.exe", "npm", "git.exe", "code.exe", "docker.exe", "python.exe", "java.exe", "go.exe", "rustc.exe"];

function getCategory(procName, domain) {
  const proc = procName.toLowerCase();
  const dom = (domain || "").toLowerCase();

  if (BROWSERS.includes(proc)) return "Web";
  if (DEV_TOOLS.some(tool => proc.includes(tool)) || /github|gitlab|npmjs|stackoverflow|bitbucket/.test(dom)) return "Development";
  if (/amazonaws|azure|cloudflare|akamai|digitalocean|heroku|google-analytics|google-cloud/.test(dom)) return "Cloud";
  
  const systemKeywords = ["system", "svchost.exe", "lsass.exe", "services.exe", "wininit.exe", "csrss.exe", "searchhost.exe"];
  if (systemKeywords.some(kw => proc.includes(kw))) return "System";
  
  return "App";
}

function isPrivateIp(ip) {
  if (!ip) return true;
  return PRIVATE_IP_RANGES.some(regex => regex.test(ip));
}

function computeHash(connections) {
  if (!connections || connections.length === 0) return "empty";
  // Sort for stable hashing
  const stable = [...connections].sort((a, b) => {
    const keyA = `${a.process}:${a.domain}:${a.category}`;
    const keyB = `${b.process}:${b.domain}:${b.category}`;
    return keyA.localeCompare(keyB);
  });
  return crypto.createHash("md5").update(JSON.stringify(stable)).digest("hex");
}

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
  if (lastTwo === "googlevideo.com" || lastTwo === "gstatic.com" || lastTwo === "ggpht.com" || lastTwo === "google.com") return "google.com";
  if (lastTwo === "fbcdn.net" || lastTwo === "facebook.com" || lastTwo === "facebook.net") return "facebook.com";
  if (lastTwo === "twimg.com" || lastTwo === "twitter.com") return "twitter.com";
  if (lastTwo === "githubusercontent.com") return "github.com";
  
  return lastTwo;
}

let LAST_GOOD_ACTIVITY = { activeConnections: [], dnsCache: [] };
let LAST_HASH = "";
let FAIL_COUNT = 0;
const MAX_RETRIES = 3;

export async function collectNetworkActivity() {
  return collectSafely(async () => {
    const [connections, { dnsMap, processMap }] = await Promise.all([
      si.networkConnections(),
      getHighSignalData()
    ]);

    const groupedMap = new Map();
    const systemNoise = [
      "System", "svchost.exe", "lsass.exe", "services.exe", "SearchHost.exe", 
      "CompPkgSrv.exe", "Registry", "MemCompression", "MsMpEng.exe", 
      "SearchIndexer.exe", "mDNSResponder.exe", "WmiPrvSE.exe", "spoolsv.exe",
      "RuntimeBroker.exe", "ShellExperienceHost.exe", "StartMenuExperienceHost.exe",
      "TextInputHost.exe", "ApplicationFrameHost.exe", "wininit.exe", "csrss.exe"
    ];

    for (const conn of connections) {
      // 1. UNIVERSAL NOISE FILTERING
      if (conn.state !== "ESTABLISHED") continue;
      
      const addr = conn.peerAddress;
      const procName = conn.process || processMap.get(addr) || "System";

      // Aggressively skip localhost and private IPs
      if (isPrivateIp(addr)) continue;
      if (systemNoise.some(noise => procName.toLowerCase().includes(noise.toLowerCase()))) continue;

      // 2. SITE DETECTION
      const possibleDomains = Array.from(dnsMap.get(addr) || []);
      const validDomains = possibleDomains.filter(d => !NOISE_DOMAINS.some(noise => d.includes(noise)));
      
      let displayName = addr;
      let fullDomain = null;

      if (validDomains.length > 0) {
        const sorted = validDomains.sort((a, b) => a.length - b.length);
        fullDomain = sorted[0];
        displayName = getBaseDomain(fullDomain);
      } else {
        // If no DNS match, skip purely numeric system traffic to keep it clean
        if (procName === "System") continue;
      }

      // 3. GROUPING & CATEGORIZATION
      const category = getCategory(procName, displayName);
      const port = conn.peerPort || 0;
      const key = `${procName}:${displayName}:${category}`;
      
      if (!groupedMap.has(key)) {
        groupedMap.set(key, {
          process: procName,
          domain: displayName,
          category: category,
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
      .slice(0, 100);

    const currentHash = computeHash(activeConnections);
    const activityChanged = currentHash !== LAST_HASH;
    LAST_HASH = currentHash;

    // Stability Logic: Cache successful results to prevent flickering on intermittent collection failures
    if (activeConnections.length > 0 || !activityChanged) {
      LAST_GOOD_ACTIVITY = { activeConnections, dnsCache: [] };
      FAIL_COUNT = 0;
      return {
        activeConnections: activityChanged ? activeConnections : [],
        dnsCache: [],
        activityChanged
      };
    } else {
      // If we got 0 connections, maybe the collection cycle was too slow.
      // Use cache for a few cycles before actually reporting 0.
      if (FAIL_COUNT < MAX_RETRIES && LAST_GOOD_ACTIVITY.activeConnections.length > 0) {
        FAIL_COUNT++;
        return { activeConnections: [], dnsCache: [], activityChanged: false };
      }
      return { activeConnections: [], dnsCache: [], activityChanged: true };
    }
  }, () => {
    // On hard error, fallback to cache if available
    if (FAIL_COUNT < MAX_RETRIES && LAST_GOOD_ACTIVITY.activeConnections.length > 0) {
      FAIL_COUNT++;
      return { ...LAST_GOOD_ACTIVITY, activityChanged: false };
    }
    return { activeConnections: [], dnsCache: [], activityChanged: true };
  });
}
