import si from "systeminformation";
import { collectSafely, safeString, toNumber } from "./helpers.js";

async function getNetworkStats() {
  const defaultInterface = await si.networkInterfaceDefault().catch(() => "");
  const interfacesToCheck = defaultInterface || "*";
  const networkStats = await si.networkStats(interfacesToCheck).catch(() => []);

  return {
    defaultInterface: safeString(defaultInterface),
    stats: Array.isArray(networkStats) ? networkStats : [],
  };
}

export async function collectNetworkMetrics() {
  return collectSafely(async () => {
    const [{ defaultInterface, stats }, latency] = await Promise.all([
      getNetworkStats(),
      si.inetLatency().catch(() => null),
    ]);

    const primaryStats = stats[0] || {};

    return {
      interface: defaultInterface,
      uploadBytesPerSec: toNumber(primaryStats.tx_sec),
      downloadBytesPerSec: toNumber(primaryStats.rx_sec),
      latencyMs: toNumber(latency),
      packetLoss: null,
    };
  }, {
    interface: "Unknown",
    uploadBytesPerSec: null,
    downloadBytesPerSec: null,
    latencyMs: null,
    packetLoss: null,
  });
}
