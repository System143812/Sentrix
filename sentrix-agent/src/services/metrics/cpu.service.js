import si from "systeminformation";
import { collectSafely, toNumber } from "./helpers.js";

export async function collectCpuMetrics() {
  return collectSafely(async () => {
    const cpuLoad = await si.currentLoad();

    return {
      usage: toNumber(cpuLoad.currentLoad),
    };
  }, {
    usage: null,
  });
}
