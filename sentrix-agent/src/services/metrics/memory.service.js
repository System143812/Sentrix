import si from "systeminformation";
import { collectSafely, toNumber, toPercent } from "./helpers.js";

export async function collectMemoryMetrics() {
  return collectSafely(async () => {
    const memory = await si.mem();

    return {
      usage: toPercent(memory.used, memory.total),
      totalBytes: toNumber(memory.total),
      usedBytes: toNumber(memory.used),
      availableBytes: toNumber(memory.available),
    };
  }, {
    usage: null,
    totalBytes: null,
    usedBytes: null,
    availableBytes: null,
  });
}
