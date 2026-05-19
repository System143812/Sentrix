import dotenv from "dotenv";
import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { isAdmin, elevate } from "../utils/elevation.js";
import {
  getAgentProfile,
  getMetrics,
  getDeviceDetails,
} from "../services/metrics.service.js";
import { connectToCore } from "../services/socket.service.js";

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
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 360,
    resizable: false,
    title: "Sentrix Agent",
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
  mainWindow?.webContents.send("agent:status", status);
}

async function startAgent() {
  const serverUrl = process.env.SENTRIX_SERVER_URL || "http://localhost:4000";
  const intervalMs = Number(process.env.METRICS_INTERVAL_MS || 1000);
  const detailsIntervalMs = Number(process.env.DETAILS_INTERVAL_MS || 60000);
  const profile = await getAgentProfile();
  let lastDetails = profile.details;
  let lastDetailsAt = Date.now();
  let lastMetrics = null;
  let lastMetricsSentAt = 0;
  let sending = false;

  sendStatusToWindow({
    connection: "connecting",
    serverUrl,
    profile,
  });

  socketClient = connectToCore({
    serverUrl,
    profile,
    onStatus: sendStatusToWindow,
  });

  const sendMetrics = async () => {
    if (sending) {
      return;
    }

    sending = true;

    try {
      const metrics = await getMetrics();
      const shouldRefreshDetails = Date.now() - lastDetailsAt >= detailsIntervalMs;

      if (shouldRefreshDetails) {
        lastDetails = await getDeviceDetails();
        lastDetailsAt = Date.now();
      }

      socketClient.sendMetrics(metrics, shouldRefreshDetails ? lastDetails : undefined);
      lastMetrics = metrics;
      lastMetricsSentAt = Date.now();

      sendStatusToWindow({
        connection: socketClient.isConnected() ? "online" : "offline",
        serverUrl,
        profile,
        metrics,
        details: lastDetails,
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
  setInterval(sendMetrics, intervalMs);
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
