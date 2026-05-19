import si from "systeminformation";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";
import { collectSafely, safeString, toNumber } from "./helpers.js";

const execFileAsync = promisify(execFile);

// Robust way to get __dirname in both ESM and CJS/bundled environments
const __filename = typeof __filename !== "undefined" 
  ? __filename 
  : (import.meta && import.meta.url ? fileURLToPath(import.meta.url) : "");
const __dirname = typeof __dirname !== "undefined" 
  ? __dirname 
  : (path && __filename ? path.dirname(__filename) : "");

const TEMP_BRIDGE_PATH = path.resolve(__dirname, "temp-bridge.ps1");

function normalizeTemperature(value) {
  const temperature = toNumber(value);
  return Number.isFinite(Number(temperature)) && Number(temperature) > 0
    ? temperature
    : null;
}

function getPrimaryGpuTemperature(graphics = {}) {
  const controllers = Array.isArray(graphics.controllers) ? graphics.controllers : [];
  const primaryController = controllers[0];

  return {
    model: safeString(primaryController?.model),
    temperatureCelsius: normalizeTemperature(primaryController?.temperatureGpu),
  };
}

async function getWindowsThermalZoneTemperature() {
  if (process.platform !== "win32") return null;

  try {
    const { stdout } = await execFileAsync("wmic", [
      "/namespace:\\\\root\\wmi",
      "PATH",
      "MSAcpi_ThermalZoneTemperature",
      "get",
      "CurrentTemperature",
      "/value",
    ], {
      timeout: 3000,
      windowsHide: true,
    });
    const readings = stdout
      .match(/CurrentTemperature=(\d+)/g)
      ?.map((line) => Number(line.split("=")[1]))
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => Math.round((value / 10 - 273.15) * 10) / 10)
      .filter((value) => value > 0 && value < 130);

    if (!readings?.length) return null;

    return Math.round(
      readings.reduce((sum, value) => sum + value, 0) / readings.length,
    );
  } catch {
    return null;
  }
}

async function getNvidiaGpuTemperature() {
  try {
    const { stdout } = await execFileAsync("nvidia-smi", [
      "--query-gpu=name,temperature.gpu",
      "--format=csv,noheader,nounits",
    ], {
      timeout: 3000,
      windowsHide: true,
    });
    const [firstLine] = stdout.trim().split(/\r?\n/);
    const [model, temperature] = firstLine?.split(",").map((part) => part.trim()) || [];

    return {
      model: safeString(model),
      temperatureCelsius: normalizeTemperature(temperature),
    };
  } catch {
    return null;
  }
}

async function getLibreHardwareTemperature() {
  if (process.platform !== "win32") return null;

  try {
    // When packaged with pkg, files are in a virtual filesystem (snapshot)
    // We need to use a temporary path or ensure the script can be executed.
    // However, pkg can't execute scripts directly from the snapshot via powershell -File.
    // We'll need to check if we are in a pkg environment and handle accordingly.
    
    let scriptPath = TEMP_BRIDGE_PATH;
    
    // Check if we are running inside pkg
    if (process.pkg) {
      scriptPath = path.join(path.dirname(process.execPath), "assets", "temp-bridge.ps1");
    }

    if (!fs.existsSync(scriptPath)) {
      console.warn(`[Temperature] Bridge script missing at: ${scriptPath}. Hardware sensors will be limited.`);
      return null;
    }

    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy", "Bypass",
      "-File", scriptPath
    ], {
      timeout: 10000,
      windowsHide: true,
    });

    const result = JSON.parse(stdout);
    
    if (result.error) {
      console.warn(`[Temperature] Bridge error: ${result.error}`);
    } else if (result.info && result.info.includes("No hardware sensors found")) {
      console.warn(`[Temperature] Bridge warning: ${result.info} (Admin: ${result.isAdmin})`);
    }

    return result;
  } catch (error) {
    const stderr = error.stderr ? `\nStderr: ${error.stderr}` : "";
    console.error(`[Temperature] Failed to run bridge: ${error.message}${stderr}`);
    return null;
  }
}

export async function collectTemperatureMetrics() {
  return collectSafely(async () => {
    const [
      cpuTemperature,
      graphics,
      windowsTemperature,
      nvidiaGpu,
      libreHardware
    ] = await Promise.all([
      si.cpuTemperature().catch(() => ({})),
      si.graphics().catch(() => ({ controllers: [] })),
      getWindowsThermalZoneTemperature(),
      getNvidiaGpuTemperature(),
      getLibreHardwareTemperature(),
    ]);

    // Priority 1: LibreHardwareMonitor (Requires Admin)
    // Priority 2: nvidia-smi (GPU specific)
    // Priority 3: systeminformation / wmic (Best effort)

    const gpu = libreHardware?.gpu?.temperatureCelsius
      ? libreHardware.gpu
      : nvidiaGpu?.temperatureCelsius
      ? nvidiaGpu
      : getPrimaryGpuTemperature(graphics);

    return {
      cpu: {
        temperatureCelsius: 
          normalizeTemperature(libreHardware?.cpu?.temperatureCelsius) ??
          normalizeTemperature(cpuTemperature.main) ?? 
          windowsTemperature,
      },
      gpu,
    };
  }, {
    cpu: {
      temperatureCelsius: null,
    },
    gpu: {
      model: "Unknown",
      temperatureCelsius: null,
    },
  });
}
