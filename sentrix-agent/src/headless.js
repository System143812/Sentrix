import dotenv from "dotenv";
import {
  getAgentProfile,
  getDeviceDetails,
  getMetrics,
} from "./services/metrics.service.js";
import { connectToCore } from "./services/socket.service.js";

dotenv.config();

const serverUrl = process.env.SENTRIX_SERVER_URL || "http://localhost:4000";
const metricsIntervalMs = Number(process.env.METRICS_INTERVAL_MS || 1000);
const detailsIntervalMs = Number(process.env.DETAILS_INTERVAL_MS || 60000);
const heartbeatIntervalMs = Number(process.env.HEARTBEAT_INTERVAL_MS || 10000);

let socketClient;
let profile;
let lastMetrics = null;
let lastMetricsSentAt = 0;
let lastDetails = null;
let lastDetailsAt = 0;
let collectingMetrics = false;
let collectingDetails = false;

function log(message, extra = "") {
  const suffix = extra ? ` ${extra}` : "";
  console.log(`[${new Date().toISOString()}] ${message}${suffix}`);
}

async function refreshDetails(force = false) {
  if (collectingDetails) return;
  if (!force && Date.now() - lastDetailsAt < detailsIntervalMs) return;

  collectingDetails = true;

  try {
    lastDetails = await getDeviceDetails();
    lastDetailsAt = Date.now();
  } catch (error) {
    log("Failed to collect device details:", error.message);
  } finally {
    collectingDetails = false;
  }
}

async function collectAndSendMetrics() {
  if (collectingMetrics) return;

  collectingMetrics = true;

  try {
    lastMetrics = await getMetrics();
    await refreshDetails();
    socketClient.sendMetrics(lastMetrics, lastDetails);
    lastMetricsSentAt = Date.now();
  } catch (error) {
    log("Failed to collect metrics:", error.message);
  } finally {
    collectingMetrics = false;
  }
}

async function start() {
  profile = await getAgentProfile();
  lastDetails = profile.details;
  lastDetailsAt = Date.now();

  socketClient = connectToCore({
    serverUrl,
    profile,
    onStatus(status) {
      log(`Connection ${status.connection}`, status.serverUrl || "");
    },
  });

  await collectAndSendMetrics();

  setInterval(collectAndSendMetrics, metricsIntervalMs);
  setInterval(() => {
    if (Date.now() - lastMetricsSentAt >= heartbeatIntervalMs) {
      socketClient.sendHeartbeat(lastMetrics);
    }
  }, heartbeatIntervalMs);
  setInterval(() => refreshDetails(), detailsIntervalMs);
}

process.on("SIGINT", () => {
  socketClient?.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  socketClient?.close();
  process.exit(0);
});

start().catch((error) => {
  log("Sentrix agent failed to start:", error.stack || error.message);
  process.exit(1);
});
