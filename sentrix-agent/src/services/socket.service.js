import { io } from "socket.io-client";

export function connectToCore({ serverUrl, profile, onStatus }) {
  let lastMetricsPacket = null;
  let lastHeartbeatPacket = null;

  const socket = io(serverUrl, {
    query: {
      role: "agent",
    },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 10000,
  });

  socket.on("connect", () => {
    socket.emit("agent:register", profile);

    if (lastMetricsPacket) {
      socket.emit("agent:metrics", lastMetricsPacket);
    }

    if (lastHeartbeatPacket) {
      socket.emit("agent:heartbeat", lastHeartbeatPacket);
    }

    onStatus?.({
      connection: "online",
      profile,
      serverUrl,
    });
  });

  socket.on("disconnect", () => {
    onStatus?.({
      connection: "offline",
      profile,
      serverUrl,
    });
  });

  socket.on("connect_error", () => {
    onStatus?.({
      connection: "offline",
      profile,
      serverUrl,
    });
  });

  return {
    sendMetrics(metrics, details) {
      const packet = {
        type: "metrics",
        agentId: profile.agentId,
        payload: metrics,
        metrics,
        details,
      };

      lastMetricsPacket = packet;

      if (!socket.connected) {
        return;
      }

      socket.emit("agent:metrics", packet);
    },
    sendHeartbeat(metrics) {
      const packet = {
        type: "heartbeat",
        agentId: profile.agentId,
        payload: metrics,
        metrics,
      };

      lastHeartbeatPacket = packet;

      if (!socket.connected) {
        return;
      }

      socket.emit("agent:heartbeat", packet);
    },
    isConnected() {
      return socket.connected;
    },
    close() {
      socket.close();
    },
  };
}
