import pool from "../src/lib/database.js";
import { saveMetricSample } from "../src/modules/metrics/repository.js";
import { getAllClients } from "../src/modules/clients/clients.service.js";
import { getClientMetricHistory } from "../src/modules/metrics/history.service.js";

/**
 * randomDataGenerator.js
 * 
 * Generates realistic historical metrics for devices with less than 24 hours of data.
 * Used for demo and presentation purposes to ensure analytics graphs are populated.
 */

const HISTORY_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const SAMPLE_INTERVAL_MS = 10 * 60 * 1000;      // 10 minutes

function getRandom(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

function generateRandomMetrics(baseMetrics = {}, timestamp) {
  // Create a realistic variation of metrics
  const cpu = clamp(getRandom(baseMetrics.cpu - 10, baseMetrics.cpu + 10), 2, 95);
  const ram = clamp(getRandom(baseMetrics.ram - 5, baseMetrics.ram + 5), 10, 90);
  const disk = baseMetrics.disk || getRandom(20, 60); // Disk usually stays stable
  
  // Realistic temp fluctuations
  const cpuTemp = getRandom(35, 65);
  const gpuTemp = getRandom(30, 55);

  // Network activity
  const upload = getRandom(100, 5000);
  const download = getRandom(1000, 50000);
  const latency = getRandom(10, 50);
  const packetLoss = Math.random() < 0.05 ? Math.random() * 0.5 : 0;

  const normalized = {
    schemaVersion: 2,
    cpu,
    ram,
    disk,
    uptime: Math.floor(timestamp / 1000), // Approximate
    system: {
      memory: { totalBytes: 16 * 1024 * 1024 * 1024, usedBytes: (ram / 100) * 16 * 1024 * 1024 * 1024 },
      disk: { totalBytes: 500 * 1024 * 1024 * 1024, usedBytes: (disk / 100) * 500 * 1024 * 1024 * 1024 }
    },
    network: {
      interface: "Ethernet",
      uploadBytesPerSec: upload,
      downloadBytesPerSec: download,
      latencyMs: latency,
      packetLoss
    },
    temperature: {
      cpu: { temperatureCelsius: cpuTemp },
      gpu: { model: "NVIDIA GeForce RTX 3060", temperatureCelsius: gpuTemp }
    }
  };

  return { normalized, raw: {} };
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

async function run() {
  console.log("--- Sentrix Demo Data Generator ---");
  const now = Date.now();
  const startTime = now - HISTORY_DURATION_MS;

  try {
    const clients = await getAllClients();
    console.log(`Found ${clients.length} devices in database.`);

    for (const client of clients) {
      // Skip the "local" device (usually the one running the core or a specific designated hostname)
      // We check for 'localhost' or 'sentrix-core' or whatever matches your local device hostname
      if (client.hostname.toLowerCase() === "localhost" || client.hostname.toLowerCase().includes("sentrix-dev")) {
        console.log(`[${client.hostname}] Skipping local device.`);
        continue;
      }

      console.log(`[${client.hostname}] Checking history...`);
      const history = await getClientMetricHistory(client.id, startTime);
      
      if (history.length >= (HISTORY_DURATION_MS / SAMPLE_INTERVAL_MS) * 0.8) {
        console.log(`[${client.hostname}] Sufficient history found (${history.length} samples). Skipping.`);
        continue;
      }

      console.log(`[${client.hostname}] Insufficient history (${history.length} samples). Generating data...`);
      
      let samplesInserted = 0;
      const baseMetrics = {
        cpu: client.metrics?.cpu || 15,
        ram: client.metrics?.ram || 30,
        disk: client.metrics?.disk || 40
      };

      for (let ts = startTime; ts < now; ts += SAMPLE_INTERVAL_MS) {
        // Only insert if no sample exists within 5 mins of this timestamp
        const exists = history.some(h => Math.abs(h.recorded_at - ts) < 5 * 60 * 1000);
        if (exists) continue;

        const { normalized, raw } = generateRandomMetrics(baseMetrics, ts);
        await saveMetricSample(client.id, normalized, raw, ts);
        samplesInserted++;
      }

      console.log(`[${client.hostname}] Generated ${samplesInserted} history samples.`);
    }

    console.log("\nDone! All devices now have at least 24 hours of historical data.");
    process.exit(0);
  } catch (error) {
    console.error("Generator failed:", error);
    process.exit(1);
  }
}

run();
