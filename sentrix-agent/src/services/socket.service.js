import { io } from "socket.io-client";
import { killProcess } from "./metrics/processes.service.js";
import { runRemotePowerCommand } from "../utils/power.js";

/**
 * Manages the persistent connection between the agent and the Sentrix core.
 */
export function connectToCore({ serverUrl, profile, onStatus, onTelemetrySettings }) {
  let lastMetricsPacket = null;
  let lastHeartbeatPacket = null;

  const socket = io(serverUrl, {
    query: { role: "agent" },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 10000,
  });

  // --- Socket Events ---

  socket.on("connect", () => {
    // Register agent details immediately upon connection
    socket.emit("agent:register", profile);

    // Resend last known packets if they were missed during a disconnect
    if (lastMetricsPacket) socket.emit("agent:metrics", lastMetricsPacket);
    if (lastHeartbeatPacket) socket.emit("agent:heartbeat", lastHeartbeatPacket);

    onStatus?.({ connection: "online", profile, serverUrl });
  });

  socket.on("disconnect", () => {
    onStatus?.({ connection: "offline", profile, serverUrl });
  });

  socket.on("connect_error", () => {
    onStatus?.({ connection: "offline", profile, serverUrl });
  });

  socket.on("settings:telemetry", (settings = {}) => {
    onTelemetrySettings?.(settings);
  });

  /**
   * Listens for remote commands sent from the dashboard/core.
   */
  socket.on("agent:command", async (payload = {}, callback) => {
    const { command, args } = payload;

    // Handle process termination
    if (command === "kill-process") {
      const result = await killProcess(args.pid);
      callback?.(result);
      return;
    }

    // Handle system power/maintenance commands
    const powerCommands = ["shutdown", "restart", "sleep", "lock", "update"];
    if (powerCommands.includes(command)) {
      const result = await runRemotePowerCommand(command);
      callback?.(result);
      return;
    }

    callback?.({ success: false, message: `Unknown command: ${command}` });
  });

  // --- API for the service ---

  return {
    /**
     * Sends a full metrics and hardware details packet to the core.
     */
    sendMetrics(metrics, details) {
      const packet = {
        type: "metrics",
        agentId: profile.agentId,
        metrics,
        details,
      };

      lastMetricsPacket = packet;
      if (socket.connected) {
        socket.emit("agent:metrics", packet);
      }
    },

    /**
     * Sends a lightweight heartbeat packet with current metrics.
     */
    sendHeartbeat(metrics) {
      const packet = {
        type: "heartbeat",
        agentId: profile.agentId,
        metrics,
      };

      lastHeartbeatPacket = packet;
      if (socket.connected) {
        socket.emit("agent:heartbeat", packet);
      }
    },

    sendEvents(events = []) {
      if (!Array.isArray(events) || events.length === 0) return;
      if (socket.connected) {
        socket.emit("agent:events", {
          agentId: profile.agentId,
          events,
          timestamp: Date.now(),
        });
      }
    },

    sendDomains(domains = []) {
      if (!Array.isArray(domains) || domains.length === 0) return;
      if (socket.connected) {
        socket.emit("agent:domains", {
          agentId: profile.agentId,
          domains,
          timestamp: Date.now(),
        });
      }
    },

    sendSoftwareInventory(software = []) {
      if (!Array.isArray(software) || software.length === 0) return;
      if (socket.connected) {
        socket.emit("agent:software", {
          agentId: profile.agentId,
          software,
          timestamp: Date.now(),
        });
      }
    },

    isConnected() {
      return socket.connected;
    },

    close() {
      socket.close();
    },
  };
}
