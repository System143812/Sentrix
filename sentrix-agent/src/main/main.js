import dotenv from "dotenv";
import { app, BrowserWindow, clipboard, ipcMain } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { isAdmin, elevate } from "../utils/elevation.js";
import {
  getAgentProfile,
  getLiveProfileSnapshot,
  getMetrics,
  getDeviceDetails,
  setGlobalMetricInterval,
} from "../services/metrics.service.js";
import { connectToCore } from "../services/socket.service.js";
import { detectDeviceEvents, buildDomainSummaries } from "../services/event-detector.service.js";
import { collectSoftwareInventory } from "../services/software-inventory.service.js";

dotenv.config();

// Auto-elevate on Windows to ensure hardware sensor access
if (process.platform === "win32" && !isAdmin()) {
  elevate();
}

// Robust way to get __dirname in both ESM and CJS/bundled environments
const __filename = typeof __filename !== "undefined" 
  ? __filename 
  : (import.meta && import.meta.url ? fileURLToPath(import.meta.url) : "");
const __dirname = typeof __dirname !== "undefined" 
  ? __dirname 
  : (path && __filename ? path.dirname(__filename) : "");

let mainWindow;
let socketClient;
let latestStatus = {
  connection: "starting",
  startedAt: new Date().toISOString(),
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1100,
    minHeight: 760,
    resizable: true,
    title: "Sentrix Agent",
    backgroundColor: "#131315",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile(path.join(__dirname, "../renderer/status.html"));
}

function sendStatusToWindow(status) {
  latestStatus = {
    ...latestStatus,
    ...status,
  };
  mainWindow?.webContents.send("agent:status", latestStatus);
}

async function startAgent() {
  const serverUrl = process.env.SENTRIX_SERVER_URL || "https://localhost:4000";
  let intervalMs = Number(process.env.METRICS_INTERVAL_MS || 5000);
  let profileIntervalMs = intervalMs;
  let detailsIntervalMs = intervalMs;
  let profile = await getAgentProfile();
  let lastDetails = profile.details;
  let lastProfileAt = Date.now();
  let lastDetailsAt = Date.now();
  let lastMetrics = null;
  let lastMetricsSentAt = 0;
  let sending = false;
  let metricsTimer = null;
  let softwareTimer = null;
  const softwareInventoryIntervalMs = Number(process.env.SOFTWARE_INVENTORY_INTERVAL_MS || 6 * 60 * 60 * 1000);

  sendStatusToWindow({
    connection: "connecting",
    serverUrl,
    profile,
  });

  socketClient = connectToCore({
    serverUrl,
    profile,
    onTelemetrySettings(settings = {}) {
      intervalMs = Math.min(Math.max(Number(settings.intervalMs) || intervalMs, 1000), 60000);
      profileIntervalMs = intervalMs;
      detailsIntervalMs = intervalMs;
      setGlobalMetricInterval(intervalMs);
      if (metricsTimer) clearInterval(metricsTimer);
      metricsTimer = setInterval(sendMetrics, intervalMs);
      sendStatusToWindow({ telemetryIntervalMs: intervalMs });
    },
    onStatus: sendStatusToWindow,
  });

  const sendMetrics = async () => {
    if (sending) {
      return;
    }

    sending = true;

    try {
      const metrics = await getMetrics();
      const shouldRefreshProfile = Date.now() - lastProfileAt >= profileIntervalMs;
      const shouldRefreshDetails = Date.now() - lastDetailsAt >= detailsIntervalMs;

      if (shouldRefreshProfile || shouldRefreshDetails) {
        const tasks = [getLiveProfileSnapshot()];

        if (shouldRefreshDetails) {
          tasks.push(getDeviceDetails());
        }

        const [liveProfile, nextDetails] = await Promise.all(tasks);

        profile = {
          ...profile,
          ...liveProfile,
          details: nextDetails || lastDetails,
        };
        lastProfileAt = Date.now();

        if (nextDetails) {
          lastDetails = nextDetails;
          lastDetailsAt = Date.now();
        }
      }

      socketClient.sendMetrics(metrics, shouldRefreshDetails ? lastDetails : undefined);
      socketClient.sendDomains(buildDomainSummaries(metrics));
      socketClient.sendEvents(detectDeviceEvents(metrics, lastDetails));
      lastMetrics = metrics;
      lastMetricsSentAt = Date.now();

      sendStatusToWindow({
        connection: socketClient.isConnected() ? "online" : "offline",
        serverUrl,
        profile,
        metrics,
        details: lastDetails,
        profileUpdatedAt: new Date(lastProfileAt).toISOString(),
        detailsUpdatedAt: new Date(lastDetailsAt).toISOString(),
        metricsUpdatedAt: new Date(metrics.lastUpdatedAt || Date.now()).toISOString(),
        lastSentAt: new Date().toISOString(),
      });
    } catch (error) {
      sendStatusToWindow({
        connection: socketClient.isConnected() ? "online" : "offline",
        serverUrl,
        profile,
        error: error.message,
      });
    } finally {
      sending = false;
    }
  };

  await sendMetrics();
  const sendSoftwareInventory = async () => {
    const software = await collectSoftwareInventory();
    socketClient.sendSoftwareInventory(software);
    sendStatusToWindow({ softwareInventoryCount: software.length });
  };
  await sendSoftwareInventory().catch(() => {});
  metricsTimer = setInterval(sendMetrics, intervalMs);
  softwareTimer = setInterval(() => sendSoftwareInventory().catch(() => {}), softwareInventoryIntervalMs);
  setInterval(() => {
    if (Date.now() - lastMetricsSentAt >= intervalMs) {
      socketClient.sendHeartbeat(lastMetrics);
    }
  }, intervalMs);
}

app.whenReady().then(async () => {
  createWindow();
  await startAgent();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("agent:get-status", async () => {
  return {
    ...latestStatus,
    connected: socketClient?.isConnected() ?? false,
  };
});

ipcMain.handle("agent:copy-text", async (_, value) => {
  clipboard.writeText(String(value || ""));
  return true;
});
