import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { isAdmin, isSystem, elevate } from "./utils/elevation.js";
import { getAgentProfile,
  getDeviceDetails,
  getMetrics,
  setGlobalMetricInterval,
  getMetricsFingerprint,
} from "./services/metrics.service.js";
import { collectSolidUsbDevices, collectSolidDisplays } from "./services/metrics/peripherals.service.js";
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

// The .env file (SENTRIX_SERVER_URL) is the primary source of truth.
// CLI arguments (--server-url) are used as a fallback or for development.
let serverUrl = process.env.SENTRIX_SERVER_URL || serverUrlArg || "https://localhost:4000";

// Ensure protocol is present
if (serverUrl && !serverUrl.startsWith("http://") && !serverUrl.startsWith("https://")) {
  serverUrl = `https://${serverUrl}`;
}

log(`Server URL: "${serverUrl || 'MISSING'}"`);

// --- Setup Mode Logic ---
async function runSetupIfNeeded() {
  const isSetupMode = args.includes("--setup");
  if (!isSetupMode) return;

  log("[Setup] Running in setup/installer mode...");
  try {
    const { registerAgentTasks, performLockdown } = await import("./services/installer.service.js");
    await registerAgentTasks(serverUrl);
    await performLockdown();
    log("[Setup] Sentrix Agent setup completed successfully. Machine is now secured.");
    process.exit(0);
  } catch (error) {
    log(`[Setup] CRITICAL FAILURE: ${error.message}`);
    process.exit(1);
  }
}

// Execute setup if flag is present, otherwise continue to main start
runSetupIfNeeded().then(() => {
  // ------------------

  let metricsIntervalMs = Number(process.env.METRICS_INTERVAL_MS || 5000);
let detailsIntervalMs = metricsIntervalMs;
const heartbeatIntervalMs = Number(process.env.HEARTBEAT_INTERVAL_MS || 5000);

let socketClient;
let profile;
let lastMetrics = null;
let lastMetricsSentAt = 0;
let lastMetricsHash = null;
const FORCE_METRICS_SEND_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
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

    const currentHash = getMetricsFingerprint(lastMetrics);
    const timeSinceLastSend = Date.now() - lastMetricsSentAt;

    if (currentHash !== lastMetricsHash || timeSinceLastSend >= FORCE_METRICS_SEND_INTERVAL_MS) {
      socketClient.sendMetrics(lastMetrics, lastDetails);
      lastMetricsHash = currentHash;
      lastMetricsSentAt = Date.now();
    } else {
      log("[Telemetry] Metrics unchanged. Skipping emission.");
    }

    socketClient.sendDomains(buildDomainSummaries(lastMetrics));
    socketClient.sendEvents(detectDeviceEvents(lastMetrics, lastDetails));
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

  // ---- Zero-Lag Native Peripheral Listener (SYSTEM) ----
  // Uses a background PowerShell process to listen for native WMI hardware events.
  // This eliminates polling and ensures instant (sub-second) updates when a device is plugged/unplugged.
  const startPeripheralListener = () => {
    const script = `
      $ProgressPreference = 'SilentlyContinue'
      $query = "SELECT * FROM Win32_DeviceChangeEvent"
      Register-WmiEvent -Query $query -Action { Write-Host "HARDWARE_CHANGE" }
      while($true) { Start-Sleep -Seconds 1 }
    `.trim();

    const encoded = Buffer.from(script, "utf16le").toString("base64");
    const listener = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"]
    });

    listener.stdout.on("data", (data) => {
      const output = data.toString();
      if (output.includes("HARDWARE_CHANGE")) {
        log("[Peripheral] Native hardware event detected. Triggering instant refresh...");
        // Trigger one-time instant refresh
        refreshDetails(true).then(() => {
          socketClient.sendMetrics(lastMetrics, lastDetails);
        });
      }
    });

    listener.on("exit", () => {
      log("[Peripheral] Native listener exited. Restarting in 5s...");
      setTimeout(startPeripheralListener, 5000);
    });
  };

  if (process.platform === "win32") {
    startPeripheralListener();
  }

  let lastHeartbeatSentAt = 0;

  metricsTimer = setInterval(collectAndSendMetrics, metricsIntervalMs);
  detailsTimer = setInterval(() => refreshDetails(), detailsIntervalMs);
  softwareTimer = setInterval(collectAndSendSoftwareInventory, softwareInventoryIntervalMs);

  // Standalone heartbeat — tightened to 5s to keep last_seen_at fresh
  // and prevent false offline flips caused by brief reconnect storms.
  setInterval(() => {
    const now = Date.now();
    if (now - lastHeartbeatSentAt >= heartbeatIntervalMs) {
      const heartbeatData = {
        status: "online",
        timestamp: now,
        lastMetricsAt: lastMetrics?.timestamp || lastMetrics?.lastUpdatedAt || null,
      };
      socketClient.sendHeartbeat(heartbeatData);
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
});
