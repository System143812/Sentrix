import { execFile } from "child_process";
import { promisify } from "util";
import si from "systeminformation";

const execFileAsync = promisify(execFile);

async function getWindowsUsbDevices() {
  try {
    // Fast query: Only get basic properties, avoid slow property lookups in PS loop.
    const script = `
      $ProgressPreference = 'SilentlyContinue'
      $classes = 'Mouse','Keyboard','Image','Camera','Biometric','Bluetooth','HIDClass','USB','Net'
      Get-PnpDevice -PresentOnly | Where-Object { 
        $classes -contains $_.Class -and $_.InstanceId -notmatch '^ROOT|^SWD|^HTREE' 
      } | Select-Object FriendlyName, InstanceId, Class, Manufacturer | ConvertTo-Json
    `.trim();

    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
      timeout: 15000,
      windowsHide: true,
    });

    if (!stdout || stdout.trim() === "") return [];

    const rawDevices = JSON.parse(stdout);
    const devices = Array.isArray(rawDevices) ? rawDevices : [rawDevices];

    const physicalMap = new Map();

    const highPriorityClasses = new Set(["mouse", "keyboard", "image", "camera", "biometric", "net", "bluetooth"]);
    const skipInfraNames = ["root hub", "host controller", "composite device", "virtual adapter", "miniport", "bridge", "enumerator"];

    for (const d of devices) {
      const className = (d.Class || "").toLowerCase();
      const name = (d.FriendlyName || "").toLowerCase();
      const instanceId = (d.InstanceId || "").toUpperCase();

      // 1. Basic Filtering
      if (!name || skipInfraNames.some(skip => name.includes(skip))) {
        continue;
      }

      // 2. Identity Extraction
      const vidPidMatch = instanceId.match(/VID_([0-9A-F]+)&PID_([0-9A-F]+)/i);
      const vidPid = vidPidMatch ? vidPidMatch[0] : null;

      // Extract a "Physical Path" or "Serial" part
      const parts = instanceId.split('\\');
      let physicalPart = parts[parts.length - 1] || instanceId;
      
      // Strip logical enumerators (e.g., ...&0&0005 -> ...&0)
      const subParts = physicalPart.split('&');
      const pathBase = subParts.length > 1 ? subParts.slice(0, -1).join('&') : physicalPart;

      // The key combines VID/PID and the physical path base.
      const identityKey = vidPid ? `${vidPid}_${pathBase}` : instanceId;

      const isHighPriority = highPriorityClasses.has(className);
      const isGenericName = name.includes("usb input device") || name.includes("hid-compliant") || name.includes("standard");

      const existing = physicalMap.get(identityKey);

      // Selection logic:
      // - Prefer High Priority classes (Keyboard/Mouse) over generic ones (HIDClass/USB).
      // - Prefer specific names over generic ones.
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
          className
        });
      }
    }

    // --- FINAL CROSS-IDENTITY DEDUPLICATION ---
    const finalDevices = [];
    const vidPidGroups = new Map();
    const bluetoothGroups = new Map();

    for (const dev of physicalMap.values()) {
      const instanceId = dev.deviceId.toUpperCase();
      // Extract Bluetooth Address if present (12 hex chars at the end or in the middle)
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

    // Process Bluetooth Groups: Keep the most descriptive name
    for (const group of bluetoothGroups.values()) {
      // Sort: prefer names that are NOT the raw address or generic services
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
        // Keep unique names within high priority
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

    return finalDevices.map(({ isHighPriority, isGenericName, className, vidPid, ...rest }) => {
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
  } catch (error) {
    return [];
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
