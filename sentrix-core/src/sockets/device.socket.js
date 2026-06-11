import jwt from "jsonwebtoken";
import crypto from "crypto";
import {
  getClientSummary,
  registerClient,
  touchClientHeartbeat,
  updateClientMetrics,
} from "../services/client.services.js";
import {
  getDiscoverySnapshot,
  runDiscoveryScan,
  setPreferredSubnet,
} from "../services/discovery/index.js";
import { getTelemetrySettings } from "../services/settings.service.js";
import {
  saveDeviceEvents,
  saveDomainSummaries,
  saveSoftwareInventory,
} from "../services/behavior.service.js";
import { isRequestRateLimited, isRequestAuthorized, verifyHardwareSignature } from "../services/security.service.js";
import { grantRegistrationGrace } from "../services/heartbeat.service.js";

const JWT_SECRET = process.env.JWT_SECRET || "sentrix-secret";

function parseCookieHeader(cookieHeader = "") {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(";").forEach((cookie) => {
    const parts = cookie.split("=");
    if (parts[0]) {
      cookies[parts[0].trim()] = (parts[1] || "").trim();
    }
  });
  return cookies;
}

function getSocketAuthToken(socket) {
  const auth = socket.handshake.auth || {};
  if (auth.token) return auth.token;

  const cookies = parseCookieHeader(socket.handshake.headers?.cookie);
  return cookies.sentrix_token || null;
}

function getSocketUser(socket) {
  const token = getSocketAuthToken(socket);
  if (!token) return null;

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

async function broadcastUpdate(io) {
  io.to("dashboards").emit("devices:update", await getClientSummary());
}

/**
 * Helper to verify hardware signature before processing data.
 * Strictly rejects any unsigned packets — no legacy fallback.
 */
async function withSignatureCheck(agentId, payload, callback, handler) {
  const { data, hmac, timestamp } = payload;
  
  if (!hmac || !timestamp || !data) {
    console.error(`[SOCKET] Rejected unsigned packet from ${agentId}. All data must be HMAC-signed.`);
    callback?.({ success: false, message: "Signed packet required." });
    return;
  }

  const isValid = await verifyHardwareSignature(agentId, data, hmac, timestamp);
  if (!isValid) {
    console.error(`[SOCKET] Invalid hardware signature from ${agentId}. Potential spoofing attempt blocked.`);
    callback?.({ success: false, message: "Security verification failed." });
    return;
  }

  return handler(data);
}

export function registerDeviceSocket(io) {
  io.use(async (socket, next) => {
    const socketUser = getSocketUser(socket);
    const req = {
      headers: socket.handshake.headers,
      socket: socket.conn.transport.socket || {},
      ip: socket.handshake.address,
      user: socketUser || socket.request.user,
    };

    console.log(`[SOCKET] Handshake attempt from IP: ${req.ip}, Role: ${socket.handshake.query.role}, AgentID: ${req.headers["x-sentrix-agent-id"] || "MISSING"}`);

    try {
      if (await isRequestRateLimited(req)) {
        console.warn(`[SOCKET] Connection blocked by rate limit: IP=${req.ip}`);
        return next(new Error("Blocked"));
      }

      const role = socket.handshake.query.role;
      if (role === "dashboard") {
        if (["network_admin", "admin"].includes(req.user?.role)) {
          console.log(`[SOCKET] Dashboard handshake authorized for ${req.user.email || req.user.id}`);
          socket.request.user = req.user;
          return next();
        }

        console.warn(`[SOCKET] Dashboard handshake rejected: missing or invalid admin token from IP=${req.ip}`);
        return next(new Error("Unauthorized"));
      }

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
    // FIX: Initialize agentId immediately from the handshake headers to prevent "No fingerprint bound for null" on reconnection.
    let agentId = socket.handshake.headers["x-sentrix-agent-id"] || null;

    if (role === "dashboard") {
      socket.join("dashboards");
      socket.emit("devices:update", await getClientSummary());
      socket.emit("discovery:update", getDiscoverySnapshot());
    }

    socket.on("agent:register", async (payload = {}, callback) => {
      try {
        agentId = payload.agentId || payload.id;
        console.log(`[SOCKET] Received agent:register for ID: ${agentId} from IP: ${socket.handshake.address}`);
        const registrationResult = await registerClient(payload);
        grantRegistrationGrace(registrationResult.id);
        socket.join("agents");
        socket.join(`agent:${registrationResult.id}`);
        socket.emit("settings:telemetry", await getTelemetrySettings());
        await broadcastUpdate(io);
        console.log(`[SOCKET] Agent registered successfully: ${registrationResult.id} (Status: ${registrationResult.status})`);
        callback?.({ success: true, secureKey: registrationResult.secureKey });
      } catch (error) {
        console.error(`[SOCKET] Registration error for ID ${agentId || 'unknown'}:`, error.message);
        callback?.({ success: false, message: error.message });
      }
    });

    socket.on("agent:metrics", async (payload = {}, callback) => {
      await withSignatureCheck(agentId, payload, callback, async (data) => {
        try {
          const id = data.agentId || agentId;
          const metrics = data.metrics || data.payload || {};
          console.log(`[SOCKET] Received agent:metrics for ID: ${id}`);
          const client = await updateClientMetrics(
            id,
            metrics,
            data.details,
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
    });

    socket.on("agent:heartbeat", async (payload = {}, callback) => {
      await withSignatureCheck(agentId, payload, callback, async (data) => {
        try {
          const id = data.agentId || agentId;
          const metrics = data.metrics || data.payload || null;

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

    socket.on("discovery:set_preferred_subnet", (subnet) => {
      console.log(`[SOCKET] Dashboard set preferred subnet to: ${subnet}`);
      setPreferredSubnet(subnet);
      // Immediately broadcast the updated snapshot (which now includes the new subnet) to all dashboards
      io.to("dashboards").emit("discovery:update", getDiscoverySnapshot());
    });
  });
}
