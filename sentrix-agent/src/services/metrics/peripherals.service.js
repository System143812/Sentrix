import { execFile } from "child_process";
import { promisify } from "util";
import si from "systeminformation";

const execFileAsync = promisify(execFile);

let usbCache = [];

async function getWindowsUsbDevices() {
  try {
    // Universal Physical Rule:
    // 1. Filter for external buses (USB, Bluetooth, Display) AND the HID logical layer.
    // 2. Capture FriendlyName, InstanceId, Class, Service, and Manufacturer.
    // 3. Status Code MUST be 0 (Working correctly). This kills "Compliance Mode" noise globally.
    const script = `
      $ProgressPreference = 'SilentlyContinue'
      $devs = Get-PnpDevice -PresentOnly | Where-Object { 
        $_.InstanceId -match '^USB|^BTHENUM|^DISPLAY|^HID' -and $_.ConfigManagerErrorCode -eq 0
      } | Select-Object FriendlyName, InstanceId, Class, Service, Manufacturer
      if ($devs) { $devs | ConvertTo-Json } else { "[]" }
    `.trim();

    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
      timeout: 15000,
      windowsHide: true,
    });

    if (!stdout || stdout.trim() === "") return usbCache;

    const rawDevices = JSON.parse(stdout);
    const devices = Array.isArray(rawDevices) ? rawDevices : [rawDevices];

    const physicalMap = new Map();

    const highPriorityClasses = new Set(["mouse", "keyboard", "image", "camera", "biometric", "net", "bluetooth"]);
    
    // Universal Service Filter: Exclude hubs, controllers, and virtual bridges globally.
    // We use a broad regex to catch variant names (usbhub3, pci-express, etc).
    const skipServiceRegex = /hub|^usbccgp|^pci|^vbus|^usbhost|^hidusb|^monitor|^bthpan|^bthenum|^umpass/i;

    for (const d of devices) {
      const className = (d.Class || "").toLowerCase();
      const service = (d.Service || "").toLowerCase();
      const name = (d.FriendlyName || "").toLowerCase();
      const instanceId = (d.InstanceId || "").toUpperCase();

      // 1. Universal Filtering (Infrastructure/Bridge services)
      if (!name || skipServiceRegex.test(service)) {
        continue;
      }

      // 2. Identity Extraction
      const vidPidMatch = instanceId.match(/VID_([0-9A-F]+)&PID_([0-9A-F]+)/i);
      const vidPid = vidPidMatch ? vidPidMatch[0] : null;

      // The identityKey is now primarily the VID/PID if available.
      // This ensures that the USB node, HID node, and NET node for the same
      // physical device are all grouped together for deduplication.
      const identityKey = vidPid || instanceId;

      const isHighPriority = highPriorityClasses.has(className);
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
          service
        });
      }
    }

    // --- FINAL CROSS-IDENTITY DEDUPLICATION ---
    const finalDevices = [];
    const vidPidGroups = new Map();
    const bluetoothGroups = new Map();

    for (const dev of physicalMap.values()) {
      const instanceId = dev.deviceId.toUpperCase();
      const bthMatch = instanceId.match(/([0-9A-F]{12})(_[0-9A-F]+)?$/i) || instanceId.match(/DEV_([0-9A-F]{12})/i);
      
      if (bthMatch) {
        const bthAddr = bthMatch[1];
        if (!bluetoothGroups.has(bthAddr)) bluetoothGroups.set(bthAddr, []);
        bluetoothGroups.get(bthAddr).push(dev);
      } else if (dev.vidPid) {
        if (!vidPidGroups.has(dev.vidPid)) vidPidGroups.set(dev.vidPid, []);
        vidPidGroups.get(dev.vidPid).push(dev);
      } else {
        finalDevices.push(dev);
      }
    }

    // Process Bluetooth Groups
    for (const group of bluetoothGroups.values()) {
      group.sort((a, b) => {
        const aGen = a.name.includes("Service") || a.name.includes("Transport") || a.name.includes("Gateway");
        const bGen = b.name.includes("Service") || b.name.includes("Transport") || b.name.includes("Gateway");
        if (aGen !== bGen) return aGen ? 1 : -1;
        return b.name.length - a.name.length;
      });
      finalDevices.push(group[0]);
    }

    for (const group of vidPidGroups.values()) {
      const highPriority = group.filter(d => d.isHighPriority);
      if (highPriority.length > 0) {
        const seen = new Set();
        for (const d of highPriority) {
          if (!seen.has(d.name)) {
            finalDevices.push(d);
            seen.add(d.name);
          }
        }
      } else {
        const seen = new Set();
        for (const d of group) {
          const key = `${d.name}_${d.manufacturer}`;
          if (!seen.has(key)) {
            finalDevices.push(d);
            seen.add(key);
          }
        }
      }
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
        deviceId: rest.deviceId
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
    return usbCache;
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
