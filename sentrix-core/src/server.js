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

// Allowed frontend origins for CORS
const clientUrls = (
  process.env.CLIENT_URL || 
  "http://localhost:5173"
)
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

// The public-facing URL of THIS backend
const backendUrl = process.env.BACKEND_URL || `http://localhost:${port}`;

function allowClientOrigin(origin, callback) {
  // Allow if it's in our CLIENT_URL list, or if it's a non-browser request (no origin)
  if (!origin || clientUrls.includes(origin)) {
    callback(null, true);
    return;
  }

  console.warn(`[CORS] Blocked request from unauthorized origin: ${origin}`);
  callback(new Error(`Origin ${origin} is not allowed by Sentrix CORS policy.`));
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
