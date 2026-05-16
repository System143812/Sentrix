import si from "systeminformation";
import { collectSafely, safeString, toNumber } from "./helpers.js";

function getPrimaryGpuTemperature(graphics = {}) {
  const controllers = Array.isArray(graphics.controllers) ? graphics.controllers : [];
  const primaryController = controllers[0];

  return {
    model: safeString(primaryController?.model),
    temperatureCelsius: toNumber(primaryController?.temperatureGpu),
  };
}

export async function collectTemperatureMetrics() {
  return collectSafely(async () => {
    const [cpuTemperature, graphics] = await Promise.all([
      si.cpuTemperature().catch(() => ({})),
      si.graphics().catch(() => ({ controllers: [] })),
    ]);

    const gpu = getPrimaryGpuTemperature(graphics);

    return {
      cpu: {
        temperatureCelsius: toNumber(cpuTemperature.main),
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
