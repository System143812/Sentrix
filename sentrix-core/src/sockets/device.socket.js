import {
  getClientSummary,
  registerClient,
  touchClientHeartbeat,
  updateClientMetrics,
} from "../services/client.services.js";
import {
  getDiscoverySnapshot,
  runDiscoveryScan,
} from "../services/discovery.service.js";

async function broadcastUpdate(io) {
  io.to("dashboards").emit("devices:update", await getClientSummary());
}

export function registerDeviceSocket(io) {
  io.on("connection", async (socket) => {
    const role = socket.handshake.query.role || "unknown";
    let agentId = null;

    if (role === "dashboard") {
      socket.join("dashboards");
      socket.emit("devices:update", await getClientSummary());
      socket.emit("discovery:update", getDiscoverySnapshot());
    }

    socket.on("agent:register", async (payload = {}, callback) => {
      try {
        agentId = payload.agentId || payload.id;
        const client = await registerClient(payload);
        socket.join(`agent:${client.id}`);
        await broadcastUpdate(io);
        callback?.({ success: true, data: client });
      } catch (error) {
        callback?.({ success: false, message: error.message });
      }
    });

    socket.on("agent:metrics", async (payload = {}, callback) => {
      const id = payload.agentId || agentId;
      const metrics = payload.metrics || payload.payload || {};
      const client = await updateClientMetrics(
        id,
        metrics,
        payload.details,
      );

      if (!client) {
        callback?.({ success: false, message: "Agent is not registered." });
        return;
      }

      await broadcastUpdate(io);
      callback?.({ success: true });
    });

    socket.on("agent:heartbeat", async (payload = {}, callback) => {
      const id = payload.agentId || agentId;
      const metrics = payload.metrics || payload.payload || null;

      if (!id) {
        callback?.({ success: false, message: "Agent is not registered." });
        return;
      }

      const client = await touchClientHeartbeat(id, metrics);

      if (!client) {
        callback?.({ success: false, message: "Agent is not registered." });
        return;
      }

      await broadcastUpdate(io);
      callback?.({ success: true });
    });

    socket.on("disconnect", async () => {
      // Offline state is decided by the heartbeat watcher. This avoids false
      // offline flips during brief Wi-Fi, sleep, or Socket.IO reconnect gaps.
    });

    socket.on("discovery:rescan", async (callback) => {
      try {
        io.to("dashboards").emit("discovery:update", getDiscoverySnapshot());
        await runDiscoveryScan();
        const snapshot = getDiscoverySnapshot();
        io.to("dashboards").emit("discovery:update", snapshot);
        callback?.({ success: true, data: snapshot });
      } catch (error) {
        callback?.({ success: false, message: error.message });
      }
    });
  });
}
