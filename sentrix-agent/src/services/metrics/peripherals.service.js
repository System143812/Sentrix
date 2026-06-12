import { execFile } from "child_process";
import { promisify } from "util";
import si from "systeminformation";

const execFileAsync = promisify(execFile);

let usbCache = [];
let solidUsbCache = [];
let displayCache = [];
let pnpBackoffUntil = 0;
let lastPnpWarning = "";

const PNP_TIMEOUT_MS = Number(process.env.PNP_QUERY_TIMEOUT_MS || 15000);
const PNP_BACKOFF_MS = Number(process.env.PNP_QUERY_BACKOFF_MS || 10 * 60 * 1000);

function pnpBackoffActive() {
  return process.env.NODE_ENV !== "test" && process.platform === "win32" && Date.now() < pnpBackoffUntil;
}

function summarizeCollectorError(error) {
  if (error?.signal) return `terminated by ${error.signal}`;
  if (error?.code) return `exit code ${error.code}`;
  return error?.message || "unknown error";
}

function rememberPnpFailure(scope, error) {
  // SIGTERM means the agent is shutting down cleanly (e.g., during an update swap).
  // Don't treat it as a hardware failure — no backoff, no log noise.
  if (error?.signal === "SIGTERM") return;

  const message = `${scope}: ${summarizeCollectorError(error)}`;
  pnpBackoffUntil = Date.now() + PNP_BACKOFF_MS;

  if (message !== lastPnpWarning) {
    console.warn(`[HARDWARE] ${message}. Using cached peripheral data; retrying PnP queries in ${Math.round(PNP_BACKOFF_MS / 60000)} minute(s).`);
    lastPnpWarning = message;
  }
}

let pnpCache = null;
let pnpCacheTime = 0;
let pnpActivePromise = null;

async function getPnpDevices() {
  const now = Date.now();
  if (process.env.NODE_ENV !== "test" && pnpCache && (now - pnpCacheTime < 15000)) {
    return pnpCache;
  }

  if (pnpActivePromise) {
    return pnpActivePromise;
  }

  if (pnpBackoffActive()) return pnpCache || [];

  pnpActivePromise = (async () => {
    try {
      const script = `
        $ProgressPreference = 'SilentlyContinue'
        # Phase 1: Filter devices first to minimize property queries
        $devs = Get-PnpDevice -PresentOnly | Where-Object { 
          ($_.InstanceId -match '^USB|^BTHENUM|^DISPLAY|^HID' -or $_.Class -eq 'Monitor') -and ($_.ConfigManagerErrorCode -eq 0 -or $_.ConfigManagerErrorCode -eq 31)
        }
        if ($devs) {
          # Phase 2: Only query properties for the filtered set
          $props = Get-PnpDeviceProperty -InstanceId $devs.InstanceId -KeyName 'DEVPKEY_Device_InLocalMachineContainer' -ErrorAction SilentlyContinue
          $propMap = @{}
          if ($props) {
              foreach ($p in $props) { if ($p.InstanceId) { $propMap[$p.InstanceId] = [bool]$p.Data } }
          }

          $results = foreach ($dev in $devs) {
            $isBuiltIn = if ($propMap.ContainsKey($dev.InstanceId)) { $propMap[$dev.InstanceId] } else { $true }
            [PSCustomObject]@{
              FriendlyName = $dev.FriendlyName
              InstanceId = $dev.InstanceId
              Class = $dev.Class
              Service = $dev.Service
              Manufacturer = $dev.Manufacturer
              IsBuiltIn = $isBuiltIn
            }
          }
          $results | ConvertTo-Json -Compress
        } else { "[]" }
      `.trim();

      const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
        timeout: PNP_TIMEOUT_MS,
        windowsHide: true,
      });

      if (!stdout || stdout.trim() === "") return pnpCache || [];

      const rawDevices = JSON.parse(stdout);
      pnpCache = Array.isArray(rawDevices) ? rawDevices : [rawDevices];
      pnpCacheTime = Date.now();
      return pnpCache;
    } catch (error) {
      rememberPnpFailure("getPnpDevices", error);
      return pnpCache || [];
    } finally {
      pnpActivePromise = null;
    }
  })();

  return pnpActivePromise;
}

async function getWindowsUsbDevices() {
  try {
    const devices = await getPnpDevices();
    const physicalMap = new Map();

    const highPriorityClasses = new Set(["mouse", "keyboard", "image", "camera", "biometric", "net", "bluetooth", "monitor"]);
    
    // Universal Service Filter: Exclude hubs, controllers, and virtual bridges globally.
    // We use a broad regex to catch variant names (usbhub3, pci-express, etc).
    const skipServiceRegex = /hub|^usbccgp|^pci|^vbus|^usbhost|^hidusb|^monitor|^bthpan|^bthenum|^umpass|^swenum|^iwdbus|^mssmbios|^cad/i;

    for (const d of devices) {
      // 0. Zero-Tolerance Edge Filtering (Discard ALL Built-in motherboard components)
      if (d.IsBuiltIn === true) {
        continue;
      }

      const className = (d.Class || "").toLowerCase();
      const service = (d.Service || "").toLowerCase();
      const name = (d.FriendlyName || "").toLowerCase();
      const instanceId = (d.InstanceId || "").toUpperCase();
      const manufacturer = (d.Manufacturer || "").toLowerCase();

      // 1. Universal Filtering (Infrastructure/Bridge services & System Noise)
      const isHighPriority = highPriorityClasses.has(className);
      
      // Filter out infrastructure services
      // FIX: Ensure Bluetooth and Monitor services are NOT skipped if they are actual devices
      if (!name || (skipServiceRegex.test(service) && className !== 'bluetooth' && className !== 'monitor')) {
        continue;
      }

      // Filter out specific system noise: Radio controls, airplane mode, etc.
      if (name.includes("radio control") || name.includes("airplane mode") || name.includes("system controller")) {
        if (!isHighPriority) continue;
      }

      // Filter out generic "Standard system devices" that aren't high priority
      if (manufacturer.includes("standard system devices") && !isHighPriority) {
        continue;
      }

      // 2. Identity Extraction
      const vidPidMatch = instanceId.match(/VID_([0-9A-F]+)&PID_([0-9A-F]+)/i);
      const vidPid = vidPidMatch ? vidPidMatch[0] : null;

      // The identityKey now includes the ClassName.
      // This ensures that composite devices (like a combined WiFi/BT dongle)
      // report both functions instead of deduplicating them into one.
      const identityKey = vidPid ? `${vidPid}_${className}` : instanceId;

      const isGenericName = name.includes("usb input device") || name.includes("hid-compliant") || name.includes("standard");

      const existing = physicalMap.get(identityKey);

      // Selection logic: Prefer specific names/high-priority classes over generic ones.
      if (!existing || 
          (isHighPriority && !existing.isHighPriority) || 
          (!isGenericName && existing.isGenericName)) {
        
        physicalMap.set(identityKey, {
          name: d.FriendlyName,
          type: d.Class || "USB",
          manufacturer: d.Manufacturer || "",
          deviceId: identityKey,
          vidPid,
          isHighPriority,
          isGenericName,
          className,
          service,
          isBuiltIn: d.IsBuiltIn
        });
      }
    }

    // --- FINAL CROSS-IDENTITY DEDUPLICATION ---
    const finalDevices = [];
    const bluetoothGroups = new Map();

    // Functional Autonomy: We no longer group by VID/PID alone.
    // Each unique identityKey (VID_PID_CLASS) is a distinct physical function.
    for (const dev of physicalMap.values()) {
      const instanceId = dev.deviceId.toUpperCase();
      const bthMatch = instanceId.match(/([0-9A-F]{12})(_[0-9A-F]+)?$/i) || instanceId.match(/DEV_([0-9A-F]{12})/i);
      
      if (bthMatch) {
        const bthAddr = bthMatch[1];
        if (!bluetoothGroups.has(bthAddr)) bluetoothGroups.set(bthAddr, []);
        bluetoothGroups.get(bthAddr).push(dev);
      } else {
        finalDevices.push(dev);
      }
    }

    // Process Bluetooth Groups (Only deduplicate multiple nodes for the SAME Bluetooth Address)
    for (const group of bluetoothGroups.values()) {
      group.sort((a, b) => {
        const aGen = a.name.includes("Service") || a.name.includes("Transport") || a.name.includes("Gateway");
        const bGen = b.name.includes("Service") || b.name.includes("Transport") || b.name.includes("Gateway");
        if (aGen !== bGen) return aGen ? 1 : -1;
        return b.name.length - a.name.length;
      });
      finalDevices.push(group[0]);
    }

    const results = finalDevices.map(({ isHighPriority, isGenericName, className, vidPid, ...rest }) => {
      let finalName = rest.name;
      const manufacturer = rest.manufacturer;
      if (manufacturer && finalName.toLowerCase().startsWith(manufacturer.toLowerCase())) {
        if (finalName.length > manufacturer.length) {
          const potentialName = finalName.slice(manufacturer.length).trim();
          if (potentialName) finalName = potentialName;
        }
      }
      return {
        name: finalName,
        type: rest.type,
        manufacturer: rest.manufacturer,
        deviceId: rest.deviceId,
        isBuiltIn: rest.isBuiltIn || false
      };
    });

    // --- AGENT-SIDE SANITY CHECK (The Shield) ---
    // Detect transient Windows PnP service glitches (Mass Disconnects)
    if (results.length === 0 && usbCache.length > 2) {
      console.warn(`[PERIPHERALS] Windows returned 0 devices (Cache was ${usbCache.length}). Suppressing transient glitch.`);
      return usbCache;
    }

    const dropThreshold = 0.7; // 70% drop
    if (usbCache.length > 5) {
      const dropCount = usbCache.length - results.length;
      const dropPercent = dropCount / usbCache.length;
      if (dropPercent >= dropThreshold) {
        console.warn(`[PERIPHERALS] Detected abnormal mass drop (${Math.round(dropPercent * 100)}%). Suppressing transient glitch.`);
        return usbCache;
      }
    }

    usbCache = results;
    return results;
  } catch (error) {
    rememberPnpFailure("getWindowsUsbDevices", error);
    return usbCache;
  }
}

export async function collectSolidUsbDevices() {
  if (process.platform !== "win32") return await collectUsbDevices();
  if (pnpBackoffActive()) return solidUsbCache;

  try {
    const raw = await getPnpDevices();
    const skipServiceRegex = /hub|^usbccgp|^pci|^vbus|^usbhost|^hidusb|^monitor|^bthpan|^bthenum|^umpass|^swenum|^iwdbus|^mssmbios|^cad/i;
    
    solidUsbCache = raw
      .filter(d => (d.InstanceId || "").toUpperCase().startsWith("USB"))
      .filter(d => d.IsBuiltIn === false)
      .filter(d => {
        const service = (d.Service || "").toLowerCase();
        const name = (d.FriendlyName || "").toLowerCase();
        return name && !skipServiceRegex.test(service);
      })
      .map(d => ({
        name: d.FriendlyName,
        type: d.Class || "USB",
        manufacturer: d.Manufacturer || "Unknown",
        deviceId: d.InstanceId,
        isBuiltIn: false
      }));
    return solidUsbCache;
  } catch (err) {
    rememberPnpFailure("collectSolidUsbDevices", err);
    return solidUsbCache;
  }
}

export async function collectSolidDisplays() {
  if (process.platform !== "win32") {
    const graphics = await si.graphics().catch(() => ({ displays: [] }));
    return (graphics.displays || []).map(d => ({
      name: d.model || "Display",
      model: d.model || "Display",
      resolution: d.resolutionX && d.resolutionY ? `${d.resolutionX}x${d.resolutionY}` : "Unknown",
      isBuiltIn: false
    }));
  }
  if (pnpBackoffActive()) return displayCache;

  try {
    const rawAll = await getPnpDevices();
    const raw = rawAll.filter(d => (d.Class || "").toLowerCase() === "monitor");
    const graphics = await si.graphics().catch(() => ({ displays: [] }));
    const siDisplays = graphics.displays || [];

    displayCache = raw.map(d => {
      let finalName = d.FriendlyName;
      const manufacturer = d.Manufacturer;
      
      if (manufacturer && finalName.toLowerCase().startsWith(manufacturer.toLowerCase())) {
        if (finalName.length > manufacturer.length) {
          const potentialName = finalName.slice(manufacturer.length).trim();
          if (potentialName) finalName = potentialName;
        }
      }

      if (finalName.toLowerCase() === "generic pnp monitor" && manufacturer && manufacturer !== "(Standard monitor types)") {
        finalName = `${manufacturer} Monitor`;
      }

      // Try to find matching resolution from si.graphics
      const siMatch = siDisplays.find(sd => 
        (sd.model && sd.model.toLowerCase() === finalName.toLowerCase()) ||
        (sd.deviceName && sd.deviceName.includes(d.InstanceId))
      );

      return {
        name: finalName,
        model: finalName,
        manufacturer: d.Manufacturer,
        resolution: siMatch && siMatch.resolutionX ? `${siMatch.resolutionX}x${siMatch.resolutionY}` : "Unknown",
        deviceId: d.InstanceId,
        isBuiltIn: d.IsBuiltIn
      };
    });
    return displayCache;
  } catch (err) {
    rememberPnpFailure("collectSolidDisplays", err);
    return displayCache;
  }
}

export async function collectUsbDevices() {
  if (process.platform === "win32") {
    return await getWindowsUsbDevices();
  }

  const siUsb = await si.usb().catch(() => []);
  const merged = [];
  const seenIds = new Set();

  for (const device of siUsb) {
    const name = (device.name || device.deviceName || "").toLowerCase();
    const type = (device.type || "").toLowerCase();
    
    const isInfra = 
      name.includes("root hub") || 
      name.includes("host controller") || 
      name.includes("composite device") ||
      name.includes("hub") ||
      type === "hub" ||
      type === "controller";

    if (isInfra) continue;

    const id = device.id || device.deviceId;
    if (id && !seenIds.has(id)) {
      merged.push({
        name: device.name || device.deviceName || "USB Device",
        type: device.type || "USB",
        manufacturer: device.manufacturer || "",
        deviceId: id
      });
      seenIds.add(id);
    }
  }

  return merged;
}

export function resetPnpCache() {
  pnpCache = null;
  pnpCacheTime = 0;
  pnpActivePromise = null;
}
