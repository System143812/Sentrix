import { execFile } from "child_process";
import { promisify } from "util";
import si from "systeminformation";

const execFileAsync = promisify(execFile);

async function getWindowsUsbDevices() {
  try {
    const script = `Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match 'USB' } | Select-Object FriendlyName, InstanceId, Class, Status, Manufacturer, Service | ConvertTo-Json`;
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
      timeout: 10000,
      windowsHide: true,
    });

    if (!stdout || stdout.trim() === "") return [];

    const rawDevices = JSON.parse(stdout);
    const devices = Array.isArray(rawDevices) ? rawDevices : [rawDevices];

    return devices
      .filter(d => {
        const name = (d.FriendlyName || "").toLowerCase();
        const className = (d.Class || "").toLowerCase();
        const service = (d.Service || "").toLowerCase();
        
        const isInfrastructure = 
          name.includes("hub") || // Catches Root Hub, Generic Hub, USB Hub
          name.includes("host controller") || 
          name.includes("pci express") ||
          name.includes("composite device") ||
          name.includes("virtual") ||
          className === "usb" || 
          className === "system" ||
          service === "usbhub" ||
          service === "usbhub3" ||
          service === "usbccgp" || 
          service === "pci" ||
          service === "pci-express";

        const isPeripheral = 
          className === "mouse" || 
          className === "keyboard" || 
          className === "hidclass" || 
          className === "image" || 
          className === "net" || 
          className === "bluetooth" || 
          className === "biometric" ||
          className === "media" ||
          className === "camera" ||
          className === "ports";

        return !isInfrastructure && isPeripheral;
      })
      .map(d => {
        const manufacturer = d.Manufacturer || "";
        const friendlyName = d.FriendlyName || "Unknown USB Device";
        
        let finalName = friendlyName;
        if (manufacturer && friendlyName.startsWith(manufacturer)) {
          if (friendlyName.length > manufacturer.length) {
            finalName = friendlyName.slice(manufacturer.length).trim();
            if (!/[a-zA-Z0-9]/.test(finalName)) finalName = friendlyName;
          }
        }

        return {
          name: finalName,
          type: d.Class || "USB",
          manufacturer: manufacturer,
          deviceId: d.InstanceId || "Unknown"
        };
      });
  } catch (error) {
    return [];
  }
}

export async function collectUsbDevices() {
  const [siUsb, winUsb] = await Promise.all([
    si.usb().catch(() => []),
    process.platform === "win32" ? getWindowsUsbDevices() : Promise.resolve([])
  ]);

  const merged = [...winUsb];
  const seenIds = new Set(winUsb.map(d => d.deviceId));

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
    if (!seenIds.has(id)) {
      merged.push({
        name: device.name || device.deviceName || "USB Device",
        type: device.type || "USB",
        manufacturer: device.manufacturer || "",
        deviceId: id || "Unknown"
      });
      seenIds.add(id);
    }
  }

  return merged;
}
