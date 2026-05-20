import si from "systeminformation";
import { execFile } from "child_process";
import { promisify } from "util";
import { collectSafely, safeString, toNumber } from "./helpers.js";

const execFileAsync = promisify(execFile);
const PING_TARGET = process.env.NETWORK_PING_TARGET || "1.1.1.1";
let previousTotals = null;

async function getNetworkStats() {
  const defaultInterface = await si.networkInterfaceDefault().catch(() => "");
  const interfacesToCheck = defaultInterface || "*";
  const networkStats = await si.networkStats(interfacesToCheck).catch(() => []);

  return {
    defaultInterface: safeString(defaultInterface),
    stats: Array.isArray(networkStats) ? networkStats : [],
  };
}

function parseNetstatBytes(output = "") {
  const bytesLine = output
    .split(/\r?\n/)
    .find((line) => line.trim().toLowerCase().startsWith("bytes"));
  const match = bytesLine?.match(/Bytes\s+(\d+)\s+(\d+)/i);

  if (!match) return null;

  return {
    receivedBytes: Number(match[1]),
    sentBytes: Number(match[2]),
  };
}

async function getWindowsNetworkTotals() {
  if (process.platform !== "win32") return null;

  try {
    const { stdout } = await execFileAsync("netstat", ["-e"], {
      timeout: 3000,
      windowsHide: true,
    });

    return parseNetstatBytes(stdout);
  } catch {
    return null;
  }
}

function getStatsTotals(primaryStats = {}) {
  const receivedBytes = Number(primaryStats.rx_bytes);
  const sentBytes = Number(primaryStats.tx_bytes);

  if (!Number.isFinite(receivedBytes) || !Number.isFinite(sentBytes)) {
    return null;
  }

  if (receivedBytes <= 0 && sentBytes <= 0) {
    return null;
  }

  return {
    receivedBytes,
    sentBytes,
  };
}

function calculateRates(totals) {
  const now = Date.now();

  if (!totals) return { uploadBytesPerSec: null, downloadBytesPerSec: null };

  if (!previousTotals) {
    previousTotals = { ...totals, timestamp: now };
    return { uploadBytesPerSec: null, downloadBytesPerSec: null };
  }

  const elapsedSeconds = Math.max((now - previousTotals.timestamp) / 1000, 1);
  const uploadBytesPerSec = Math.max(
    0,
    (totals.sentBytes - previousTotals.sentBytes) / elapsedSeconds,
  );
  const downloadBytesPerSec = Math.max(
    0,
    (totals.receivedBytes - previousTotals.receivedBytes) / elapsedSeconds,
  );

  previousTotals = { ...totals, timestamp: now };

  return {
    uploadBytesPerSec: toNumber(uploadBytesPerSec),
    downloadBytesPerSec: toNumber(downloadBytesPerSec),
  };
}

function parsePingOutput(output = "") {
  const lossMatch =
    output.match(/\((\d+(?:\.\d+)?)%\s*loss\)/i) ||
    output.match(/(\d+(?:\.\d+)?)%\s*packet\s*loss/i) ||
    output.match(/Lost\s*=\s*\d+\s*\((\d+(?:\.\d+)?)%\s*loss\)/i);
  const packetMatch = output.match(/Sent\s*=\s*(\d+),\s*Received\s*=\s*(\d+),\s*Lost\s*=\s*(\d+)/i);
  const windowsAverageMatch = output.match(/Average\s*=\s*(\d+(?:\.\d+)?)ms/i);
  const unixAverageMatch = output.match(/=\s*[\d.]+\/([\d.]+)\/[\d.]+\/[\d.]+\s*ms/i);
  const calculatedLoss = packetMatch
    ? (Number(packetMatch[3]) / Math.max(Number(packetMatch[1]), 1)) * 100
    : null;

  return {
    latencyMs: toNumber(windowsAverageMatch?.[1] ?? unixAverageMatch?.[1]),
    packetLoss: toNumber(lossMatch?.[1] ?? calculatedLoss),
  };
}

async function collectPingMetrics() {
  const args = process.platform === "win32"
    ? ["-n", "4", "-w", "1000", PING_TARGET]
    : ["-c", "4", "-W", "1", PING_TARGET];

  try {
    const { stdout } = await execFileAsync("ping", args, {
      timeout: 5000,
      windowsHide: true,
    });

    return parsePingOutput(stdout);
  } catch (error) {
    return parsePingOutput(`${error.stdout || ""}\n${error.stderr || ""}`);
  }
}

export async function collectNetworkMetrics() {
  return collectSafely(async () => {
    const [{ defaultInterface, stats }, pingMetrics] = await Promise.all([
      getNetworkStats(),
      collectPingMetrics(),
    ]);

    const primaryStats = stats[0] || {};
    const totals = getStatsTotals(primaryStats) || await getWindowsNetworkTotals();
    const rates = calculateRates(totals);

    return {
      interface: defaultInterface,
      uploadBytesPerSec: rates.uploadBytesPerSec ?? toNumber(primaryStats.tx_sec),
      downloadBytesPerSec: rates.downloadBytesPerSec ?? toNumber(primaryStats.rx_sec),
      latencyMs: pingMetrics.latencyMs,
      packetLoss: pingMetrics.packetLoss,
    };
  }, {
    interface: "Unknown",
    uploadBytesPerSec: null,
    downloadBytesPerSec: null,
    latencyMs: null,
    packetLoss: null,
  });
}
