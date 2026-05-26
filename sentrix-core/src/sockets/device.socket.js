import {
  getClientSummary,
  registerClient,
  touchClientHeartbeat,
  updateClientMetrics,
} from "../services/client.services.js";
import {
  getDiscoverySnapshot,
  runDiscoveryScan,
} from "../services/discovery/index.js";
import { getTelemetrySettings } from "../services/settings.service.js";
import {
  saveDeviceEvents,
  saveDomainSummaries,
  saveSoftwareInventory,
} from "../services/behavior.service.js";
import { isMacBlocked } from "../services/security.service.js";

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
        if (await isMacBlocked(payload.mac)) {
          callback?.({ success: false, message: "Failed" });
          socket.disconnect(true);
          return;
        }
        agentId = payload.agentId || payload.id;
        console.log(`[SOCKET] Received agent:register for ID: ${agentId}`);
        const client = await registerClient(payload);
        socket.join("agents");
        socket.join(`agent:${client.id}`);
        socket.emit("settings:telemetry", await getTelemetrySettings());
        await broadcastUpdate(io);
        console.log(`[SOCKET] Agent registered and broadcasted: ${client.id}`);
        callback?.({ success: true, data: client });
      } catch (error) {
        console.error(`[SOCKET] Registration error for ID ${agentId}:`, error.message);
        callback?.({ success: false, message: error.message });
      }
    });

    socket.on("agent:metrics", async (payload = {}, callback) => {
      try {
        const id = payload.agentId || agentId;
        const metrics = payload.metrics || payload.payload || {};
        console.log(`[SOCKET] Received agent:metrics for ID: ${id}`);
        const client = await updateClientMetrics(
          id,
          metrics,
          payload.details,
        );

        if (!client) {
          console.warn(`[SOCKET] Metrics update ignored: Agent ${id} not registered.`);
          callback?.({ success: false, message: "Agent is not registered." });
          return;
        }

        await broadcastUpdate(io);
        callback?.({ success: true });
      } catch (err) {
        console.error(`[SOCKET] Metrics error:`, err.message);
        callback?.({ success: false, message: err.message });
      }
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

    socket.on("agent:events", async (payload = {}, callback) => {
      try {
        const id = payload.agentId || agentId;
        if (!id) {
          callback?.({ success: false, message: "Agent is not registered." });
          return;
        }

        await saveDeviceEvents(id, payload.events || []);
        callback?.({ success: true });
      } catch (error) {
        callback?.({ success: false, message: error.message });
      }
    });

    socket.on("agent:domains", async (payload = {}, callback) => {
      try {
        const id = payload.agentId || agentId;
        if (!id) {
          callback?.({ success: false, message: "Agent is not registered." });
          return;
        }

        await saveDomainSummaries(id, payload.domains || [], payload.timestamp || Date.now());
        callback?.({ success: true });
      } catch (error) {
        callback?.({ success: false, message: error.message });
      }
    });

    socket.on("agent:software", async (payload = {}, callback) => {
      try {
        const id = payload.agentId || agentId;
        if (!id) {
          callback?.({ success: false, message: "Agent is not registered." });
          return;
        }

        const result = await saveSoftwareInventory(
          id,
          payload.software || payload.inventory || [],
          payload.timestamp || Date.now(),
        );
        callback?.({ success: true, data: result });
      } catch (error) {
        callback?.({ success: false, message: error.message });
      }
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
