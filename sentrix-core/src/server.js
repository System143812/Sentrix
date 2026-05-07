import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import http from "http";
import { Server } from "socket.io";
const { default: createApp } = await import("./app.js");
const { registerDeviceSocket } = await import("./sockets/device.socket.js");
const { startOfflineWatcher } = await import("./services/client.services.js");
const { startDiscoveryScheduler } = await import("./services/discovery.service.js");

const app = createApp();
const server = http.createServer(app);
const port = process.env.PORT || 4000;
const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

const io = new Server(server, {
  cors: {
    origin: clientUrl,
    methods: ["GET", "POST", "PATCH"],
    credentials: true,
  },
});

app.set("io", io);
registerDeviceSocket(io);
startOfflineWatcher(io);
startDiscoveryScheduler(io);

server.listen(port, () => {
  console.log(`Sentrix core running on http://localhost:${port}`);
});
