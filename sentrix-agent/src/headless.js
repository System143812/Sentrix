import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { isAdmin, isSystem, elevate } from "./utils/elevation.js";
import {
  getAgentProfile,
  getDeviceDetails,
  getMetrics,
  setGlobalMetricInterval,
} from "./services/metrics.service.js";
import { connectToCore } from "./services/socket.service.js";
import { detectDeviceEvents, buildDomainSummaries } from "./services/event-detector.service.js";
import { collectSoftwareInventory } from "./services/software-inventory.service.js";
import { startHelperWatchdog } from "./services/watchdog.service.js";

// Robust way to get the directory where the EXE (or script) is located
const __filename_robust = typeof __filename !== "undefined" 
  ? __filename 
  : (import.meta && import.meta.url ? fileURLToPath(import.meta.url) : "");
const __dirname_robust = typeof __dirname !== "undefined" 
  ? __dirname 
  : (path && __filename_robust ? path.dirname(__filename_robust) : "");

// Priority 1: .env file next to the EXE (process.execPath)
// Priority 2: .env file next to the script (__dirname)
// Priority 3: Default dotenv behavior (process.cwd())
const exeDir = process.pkg ? path.dirname(process.execPath) : __dirname_robust;
const externalEnvPath = path.join(exeDir, ".env");
const logFilePath = path.join(exeDir, "agent.log");

function log(message, extra = "") {
  const suffix = extra ? ` ${extra}` : "";
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}${suffix}\n`;
  
  process.stdout.write(line);
  
  try {
    fs.appendFileSync(logFilePath, line);
  } catch (err) {
    // Ignore log file write errors
  }
}

// Redirect global console to our log file
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = (...args) => {
  log(args.map(a => typeof a === "object" ? JSON.stringify(a) : a).join(" "));
  // originalLog.apply(console, args); // Optional: keep original behavior if needed
};
console.error = (...args) => {
  log("ERROR: " + args.map(a => typeof a === "object" ? JSON.stringify(a) : a).join(" "));
};
console.warn = (...args) => {
  log("WARN: " + args.map(a => typeof a === "object" ? JSON.stringify(a) : a).join(" "));
};

if (fs.existsSync(externalEnvPath)) {
  dotenv.config({ path: externalEnvPath });
} else {
  dotenv.config();
}

log("--- Sentrix Agent Starting ---");
log(`Executable: ${process.execPath}`);
log(`Working Dir: ${process.cwd()}`);
log(`Platform: ${process.platform}`);
log(`Is Admin: ${isAdmin()}`);
log(`Is System: ${isSystem()}`);

// Auto-elevate on Windows to ensure hardware sensor access
if (process.platform === "win32" && !isAdmin() && !isSystem()) {
  log("[Elevation] Sentrix Agent requires administrative privileges for hardware monitoring.");
  log("[Elevation] Attempting to relaunch as administrator...");
  elevate();
}

// Parse CLI arguments
const args = process.argv.slice(2);
const serverUrlArg = args.find(arg => arg.startsWith("--server-url="))?.split("=")[1] 
                   || args[args.indexOf("--server-url") + 1];

let serverUrl = serverUrlArg || process.env.SENTRIX_SERVER_URL || "http://localhost:4000";

// Ensure protocol is present
if (serverUrl && !serverUrl.startsWith("http://") && !serverUrl.startsWith("https://")) {
  serverUrl = `http://${serverUrl}`;
}

log(`Server URL: ${serverUrl}`);

let metricsIntervalMs = Number(process.env.METRICS_INTERVAL_MS || 5000);
let detailsIntervalMs = metricsIntervalMs;
const heartbeatIntervalMs = Number(process.env.HEARTBEAT_INTERVAL_MS || 10000);

let socketClient;
let profile;
let lastMetrics = null;
let lastMetricsSentAt = 0;
let lastDetails = null;
let lastDetailsAt = 0;
let collectingMetrics = false;
let collectingDetails = false;
let metricsTimer = null;
let detailsTimer = null;
let softwareTimer = null;
const softwareInventoryIntervalMs = Number(process.env.SOFTWARE_INVENTORY_INTERVAL_MS || 6 * 60 * 60 * 1000);

async function refreshDetails(force = false) {
  if (collectingDetails) return;
  if (!force && Date.now() - lastDetailsAt < detailsIntervalMs) return;

  collectingDetails = true;

  try {
    lastDetails = await getDeviceDetails();
    lastDetailsAt = Date.now();
    log(`Collected device details. Peripherals: ${lastDetails.usbDevices?.length || 0} USB devices found.`);
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
    socketClient.sendDomains(buildDomainSummaries(lastMetrics));
    socketClient.sendEvents(detectDeviceEvents(lastMetrics, lastDetails));
    lastMetricsSentAt = Date.now();
  } catch (error) {
    log("Failed to collect metrics:", error.message);
  } finally {
    collectingMetrics = false;
  }
}

async function collectAndSendSoftwareInventory() {
  try {
    const software = await collectSoftwareInventory();
    socketClient?.sendSoftwareInventory(software);
    log(`Collected software inventory. Applications: ${software.length}.`);
  } catch (error) {
    log("Failed to collect software inventory:", error.message);
  }
}

async function start() {
  profile = await getAgentProfile();
  lastDetails = profile.details;
  lastDetailsAt = Date.now();

  socketClient = connectToCore({
    serverUrl,
    profile,
    onTelemetrySettings(settings = {}) {
      metricsIntervalMs = Math.min(Math.max(Number(settings.intervalMs) || metricsIntervalMs, 1000), 60000);
      detailsIntervalMs = metricsIntervalMs;
      setGlobalMetricInterval(metricsIntervalMs);
      if (metricsTimer) clearInterval(metricsTimer);
      metricsTimer = setInterval(collectAndSendMetrics, metricsIntervalMs);
      if (detailsTimer) clearInterval(detailsTimer);
      detailsTimer = setInterval(() => refreshDetails(), detailsIntervalMs);
      log(`Telemetry interval set to ${metricsIntervalMs}ms`);
    },
    onStatus(status) {
      log(`Connection ${status.connection}`, status.serverUrl || "");
      if (status.connection === "online") {
        lastMetricsSentAt = Date.now();
      }
    },
  });

  await collectAndSendMetrics();
  await collectAndSendSoftwareInventory();
  startHelperWatchdog();

  let lastHeartbeatSentAt = 0;

  metricsTimer = setInterval(collectAndSendMetrics, metricsIntervalMs);
  detailsTimer = setInterval(() => refreshDetails(), detailsIntervalMs);
  softwareTimer = setInterval(collectAndSendSoftwareInventory, softwareInventoryIntervalMs);

  // Aggressive standalone heartbeat: ignores whether metrics are "ready" to keep the socket alive
  setInterval(() => {
    const now = Date.now();
    // Send heartbeat if it's been longer than the interval, regardless of metrics status
    if (now - lastHeartbeatSentAt >= heartbeatIntervalMs) {
      socketClient.sendHeartbeat(lastMetrics);
      lastHeartbeatSentAt = now;
    }
  }, 2000); // Check every 2s for more precision
}

process.on("SIGINT", () => {
  if (softwareTimer) clearInterval(softwareTimer);
  socketClient?.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  if (softwareTimer) clearInterval(softwareTimer);
  socketClient?.close();
  process.exit(0);
});

start().catch((error) => {
  log("Sentrix agent failed to start:", error.stack || error.message);
  process.exit(1);
});
