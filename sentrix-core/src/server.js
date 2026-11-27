import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import { getOrCreateServerCertificate } from "./lib/cert-manager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import https from "https";
import { networkIdentity } from "./lib/network-identity.js";
import { Server } from "socket.io";
const { default: createApp } = await import("./app.js");
const { ensureDatabaseSchema } = await import("./lib/schema.js");
const { registerDeviceSocket } = await import("./sockets/device.socket.js");
const { startOfflineWatcher } =
  await import("./system/heartbeat/heartbeat.service.js");
const { initAuditService } = await import("./modules/audit/audit.service.js");
const { initSecurityService } =
  await import("./modules/security/security.service.js");
const { startDiscoveryScheduler } =
  await import("./modules/discovery/discovery.service.js");
const { startPruningService } =
  await import("./system/pruning/pruning.service.js");

await ensureDatabaseSchema();

function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const ips = ["127.0.0.1", "0.0.0.0"];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === "IPv4" && !net.internal) {
        if (!ips.includes(net.address)) {
          ips.push(net.address);
        }
      }
    }
  }
  return ips;
}

const app = createApp();
const sslOptions = await getOrCreateServerCertificate(getLocalIpAddresses());
const server = https.createServer(sslOptions, app);
const port = process.env.PORT || 4000;
const host = process.env.HOST || "0.0.0.0";

// Allowed frontend origins for CORS
function getClientUrls() {
  const urls =
    process.env.CLIENT_URLS ||
    process.env.CLIENT_URL ||
    "https://localhost:5173,https://localhost:5174";
  return urls
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
}

function isDevDashboardOrigin(origin) {
  try {
    const { hostname, port } = new URL(origin);
    const isDashboardPort = port === "5173" || port === "5174";
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
    const isPrivateLan =
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^100\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname); // Tailscale CGNAT range

    return (
      isDashboardPort &&
      (isLocalhost || isPrivateLan)
    );
  } catch {
    return false;
  }
}

// The public-facing URL of THIS backend
const backendUrl = process.env.BACKEND_URL || `https://localhost:${port}`;

function allowClientOrigin(origin, callback) {
  const clientUrls = getClientUrls();
  // Allow if it's in our clientUrls list, a dev dashboard origin (including Tailscale), or non-browser request
  if (!origin || clientUrls.includes(origin) || isDevDashboardOrigin(origin)) {
    callback(null, true);
    return;
  }

  console.warn(`[CORS] Blocked request from unauthorized origin: ${origin}`);
  callback(
    new Error(`Origin ${origin} is not allowed by Sentrix Socket.io CORS policy.`),
  );
}

const io = new Server(server, {
  cors: {
    origin: allowClientOrigin,
    methods: ["GET", "POST", "PATCH"],
    credentials: true,
  },
});

app.set("io", io);
registerDeviceSocket(io);
initAuditService(io);
initSecurityService(io);
startOfflineWatcher(io);
startDiscoveryScheduler(io);
startPruningService();
networkIdentity.startPolling(15000);

networkIdentity.on("ip-changed", async ({ oldIp, newIp, serverUrl }) => {
  io.to("agents").emit("server:ip-changed", { serverUrl });
  try {
    const localIps = getLocalIpAddresses();
    const sslOptions = await getOrCreateServerCertificate(localIps);
    server.setSecureContext({
      key: sslOptions.key,
      cert: sslOptions.cert,
    });
    console.log(`[HTTPS] Dynamically regenerated and hot-reloaded TLS certificate for new IP SANs: ${localIps.join(", ")}`);
  } catch (err) {
    console.error(`[HTTPS] Failed to hot-reload TLS certificate on IP change:`, err);
  }
});

server.listen(port, host, () => {
  console.log(`Sentrix core running on ${networkIdentity.getServerUrl()}`);
});
