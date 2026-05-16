import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import http from "http";
import { Server } from "socket.io";
const { default: createApp } = await import("./app.js");
const { ensureDatabaseSchema } = await import("./lib/schema.js");
const { registerDeviceSocket } = await import("./sockets/device.socket.js");
const { startOfflineWatcher } = await import("./services/client.services.js");
const { startDiscoveryScheduler } = await import("./services/discovery.service.js");

await ensureDatabaseSchema();

const app = createApp();
const server = http.createServer(app);
const port = process.env.PORT || 4000;
const host = process.env.HOST || "0.0.0.0";
const clientUrls = (
  process.env.CLIENT_URLS ||
  process.env.CLIENT_URL ||
  "http://localhost:5173,http://localhost:5174"
)
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const backendUrl =
  process.env.CORE_PUBLIC_URL ||
  process.env.BACKEND_URL ||
  `http://localhost:${port}`;

function isDevDashboardOrigin(origin) {
  if (process.env.NODE_ENV === "production") return false;

  try {
    const { hostname, port } = new URL(origin);
    const isDashboardPort = port === "5173" || port === "5174";
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
    const isPrivateLan =
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname);

    return (
      isDashboardPort &&
      (isLocalhost || isPrivateLan)
    );
  } catch {
    return false;
  }
}

function allowClientOrigin(origin, callback) {
  if (!origin || clientUrls.includes(origin) || isDevDashboardOrigin(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error(`Origin ${origin} is not allowed by Socket.IO CORS.`));
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
startOfflineWatcher(io);
startDiscoveryScheduler(io);

server.listen(port, host, () => {
  console.log(`Sentrix core running on ${backendUrl}`);
});
