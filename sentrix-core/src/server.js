import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import selfsigned from "selfsigned";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import https from "https";
import { Server } from "socket.io";
const { default: createApp } = await import("./app.js");
const { ensureDatabaseSchema } = await import("./lib/schema.js");
const { registerDeviceSocket } = await import("./sockets/device.socket.js");
const { startOfflineWatcher } = await import("./services/heartbeat.service.js");
const { initAuditService } = await import("./services/audit.service.js");
const { initSecurityService } = await import("./services/security.service.js");
const { startDiscoveryScheduler } =
  await import("./services/discovery/index.js");
const { startPruningService } = await import("./services/pruning.service.js");

await ensureDatabaseSchema();

/**
 * Gets or generates self-signed certificates for HTTPS.
 */
async function getCertificates() {
  const certDir = path.resolve(__dirname, "../.certs");
  const keyPath = path.join(certDir, "server.key");
  const certPath = path.join(certDir, "server.crt");

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
  }

  console.log("[HTTPS] Generating self-signed certificates...");
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  const attrs = [{ name: "commonName", value: "sentrix.local" }];
  const pems = await selfsigned.generate(attrs, { days: 365 });

  fs.writeFileSync(keyPath, pems.private);
  fs.writeFileSync(certPath, pems.cert);

  return {
    key: pems.private,
    cert: pems.cert,
  };
}

const app = createApp();
const sslOptions = await getCertificates();
const server = https.createServer(sslOptions, app);
const port = process.env.PORT || 4000;
const host = process.env.HOST || "0.0.0.0";

// Allowed frontend origins for CORS
const clientUrls = (process.env.CLIENT_URL || "https://localhost:5173")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

// The public-facing URL of THIS backend
const backendUrl = process.env.BACKEND_URL || `https://localhost:${port}`;

function allowClientOrigin(origin, callback) {
  // Allow if it's in our CLIENT_URL list, or if it's a non-browser request (no origin)
  if (!origin || clientUrls.includes(origin)) {
    callback(null, true);
    return;
  }

  console.warn(`[CORS] Blocked request from unauthorized origin: ${origin}`);
  callback(
    new Error(`Origin ${origin} is not allowed by Sentrix CORS policy.`),
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

server.listen(port, host, () => {
  console.log(`Sentrix core running on ${backendUrl}`);
});
