import { execFile } from "child_process";
import { promisify } from "util";
import si from "systeminformation";

const execFileAsync = promisify(execFile);

function normalizeSoftware(item = {}) {
  return {
    name: item.DisplayName || item.name || "",
    version: item.DisplayVersion || item.version || "",
    publisher: item.Publisher || item.publisher || "",
    installDate: item.InstallDate || item.installDate || "",
    installLocation: item.InstallLocation || item.installLocation || "",
  };
}

async function collectWindowsRegistrySoftware() {
  const script = `
    $paths = @(
      'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
      'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
    )
    $items = foreach ($path in $paths) {
      Get-ItemProperty $path -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName } |
        Select-Object DisplayName, DisplayVersion, Publisher, InstallDate, InstallLocation
    }
    $items | ConvertTo-Json -Compress
  `;

  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
    timeout: 30000,
    windowsHide: true,
  });
  const parsed = JSON.parse(stdout || "[]");
  return (Array.isArray(parsed) ? parsed : [parsed]).map(normalizeSoftware);
}

async function collectCrossPlatformSoftware() {
  const versions = await si.versions().catch(() => ({}));
  return Object.entries(versions)
    .filter(([, version]) => version)
    .map(([name, version]) => ({
      name,
      version: String(version),
      publisher: "systeminformation",
      installDate: "",
      installLocation: "",
    }));
}

export async function collectSoftwareInventory() {
  try {
    const items = process.platform === "win32"
      ? await collectWindowsRegistrySoftware()
      : await collectCrossPlatformSoftware();

    const seen = new Set();
    return items
      .filter((item) => item.name)
      .filter((item) => {
        const key = `${item.name}|${item.publisher}|${item.installLocation}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 1000);
  } catch {
    return collectCrossPlatformSoftware();
  }
}
