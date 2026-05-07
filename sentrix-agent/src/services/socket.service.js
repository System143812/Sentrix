import { io } from "socket.io-client";

export function connectToCore({ serverUrl, profile, onStatus }) {
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
      if (!socket.connected) {
        return;
      }

      socket.emit("agent:metrics", {
        agentId: profile.agentId,
        metrics,
        details,
      });
    },
    sendHeartbeat(metrics) {
      if (!socket.connected) {
        return;
      }

      socket.emit("agent:heartbeat", {
        agentId: profile.agentId,
        metrics,
      });
    },
    isConnected() {
      return socket.connected;
    },
    close() {
      socket.close();
    },
  };
}
