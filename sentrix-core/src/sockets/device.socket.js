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
import { isRequestRateLimited, isRequestAuthorized } from "../services/security.service.js";
import { grantRegistrationGrace } from "../services/heartbeat.service.js";

async function broadcastUpdate(io) {
  io.to("dashboards").emit("devices:update", await getClientSummary());
}

export function registerDeviceSocket(io) {
  io.use(async (socket, next) => {
    const req = {
      headers: socket.handshake.headers,
      socket: socket.conn.transport.socket || {},
      ip: socket.handshake.address,
      user: socket.request.user,
    };

    console.log(`[SOCKET] Handshake attempt from IP: ${req.ip}, Role: ${socket.handshake.query.role}, AgentID: ${req.headers["x-sentrix-agent-id"] || "MISSING"}`);

    try {
      if (await isRequestRateLimited(req)) {
        console.warn(`[SOCKET] Connection blocked by rate limit: IP=${req.ip}`);
        return next(new Error("Blocked"));
      }

      const role = socket.handshake.query.role;
      if (role === "dashboard") return next();

      const authorized = await isRequestAuthorized(req);
      if (authorized) {
        console.log(`[SOCKET] Handshake authorized for IP: ${req.ip}`);
        return next();
      }

      console.warn(`[SOCKET] Handshake UNAUTHORIZED for IP: ${req.ip}, AgentID: ${req.headers["x-sentrix-agent-id"] || "MISSING"}`);
      next(new Error("Unauthorized"));
    } catch (error) {
      console.error(`[SOCKET] Handshake error:`, error.message);
      next(new Error("Failed"));
    }
  });

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
        console.log(`[SOCKET] Received agent:register for ID: ${agentId} from IP: ${socket.handshake.address}`);
        const client = await registerClient(payload);
        grantRegistrationGrace(client.id);
        socket.join("agents");
        socket.join(`agent:${client.id}`);
        socket.emit("settings:telemetry", await getTelemetrySettings());
        await broadcastUpdate(io);
        console.log(`[SOCKET] Agent registered successfully: ${client.id} (Status: ${client.status})`);
        callback?.({ success: true, data: client });
      } catch (error) {
        console.error(`[SOCKET] Registration error for ID ${agentId || 'unknown'}:`, error.message);
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
          console.warn(`[SOCKET] Metrics update ignored: Agent ${id} not registered or not found.`);
          callback?.({ success: false, message: "Agent is not registered." });
          return;
        }

        await broadcastUpdate(io);
        callback?.({ success: true });
      } catch (err) {
        console.error(`[SOCKET] Metrics error for ID ${agentId || 'unknown'}:`, err.message);
        callback?.({ success: false, message: err.message });
      }
    });

    socket.on("agent:heartbeat", async (payload = {}, callback) => {
      try {
        const id = payload.agentId || agentId;
        const metrics = payload.metrics || payload.payload || null;

        if (!id) {
          console.warn(`[SOCKET] Heartbeat ignored: No agent ID provided in payload or session.`);
          callback?.({ success: false, message: "Agent is not registered." });
          return;
        }

        const client = await touchClientHeartbeat(id, metrics);

        if (!client) {
          console.warn(`[SOCKET] Heartbeat ignored: Agent ${id} not found in database.`);
          callback?.({ success: false, message: "Agent is not registered." });
          return;
        }

        await broadcastUpdate(io);
        callback?.({ success: true });
      } catch (error) {
        console.error(`[SOCKET] Heartbeat error for ID ${agentId || 'unknown'}:`, error.message);
        callback?.({ success: false, message: error.message });
      }
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
