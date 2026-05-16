import si from "systeminformation";
import { execFile } from "child_process";
import { promisify } from "util";
import { collectSafely, safeString, toNumber } from "./helpers.js";

const execFileAsync = promisify(execFile);

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

export async function collectTemperatureMetrics() {
  return collectSafely(async () => {
    const [cpuTemperature, graphics, windowsTemperature, nvidiaGpu] = await Promise.all([
      si.cpuTemperature().catch(() => ({})),
      si.graphics().catch(() => ({ controllers: [] })),
      getWindowsThermalZoneTemperature(),
      getNvidiaGpuTemperature(),
    ]);

    const gpu = nvidiaGpu?.temperatureCelsius
      ? nvidiaGpu
      : getPrimaryGpuTemperature(graphics);

    return {
      cpu: {
        temperatureCelsius: normalizeTemperature(cpuTemperature.main) ?? windowsTemperature,
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
