import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { isAdmin, isSystem, elevate } from "./utils/elevation.js";
import {
  getAgentProfile,
  getDeviceDetails,
  getMetrics,
} from "./services/metrics.service.js";
import { connectToCore } from "./services/socket.service.js";

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
