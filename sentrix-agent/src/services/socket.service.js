import { io } from "socket.io-client";
import { execFile } from "child_process";
import { promisify } from "util";
import { killProcess } from "./metrics/processes.service.js";

const execFileAsync = promisify(execFile);

async function runRemotePowerCommand(command) {
  if (process.platform !== "win32") {
    return { success: false, message: `${command} is only supported on Windows agents.` };
  }

  const commands = {
    shutdown: ["shutdown.exe", ["/s", "/t", "0"]],
    restart: ["shutdown.exe", ["/r", "/t", "0"]],
    sleep: ["rundll32.exe", ["powrprof.dll,SetSuspendState", "0,1,0"]],
    lock: ["rundll32.exe", ["user32.dll,LockWorkStation"]],
    update: ["UsoClient.exe", ["StartScan"]],
  };
  const [binary, args] = commands[command] || [];

  if (!binary) {
    return { success: false, message: `Unknown command: ${command}` };
  }

  try {
    await execFileAsync(binary, args, {
      timeout: 10000,
      windowsHide: true,
    });

    return { success: true, message: `${command} command accepted.` };
  } catch (error) {
    return {
      success: false,
      message: error.message || `Failed to run ${command}.`,
    };
  }
}

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

  // Handle remote commands from the core
  socket.on("agent:command", async (payload = {}, callback) => {
    const { command, args } = payload;

    if (command === "kill-process") {
      const result = await killProcess(args.pid);
      callback?.(result);
      return;
    }

    if (["shutdown", "restart", "sleep", "lock", "update"].includes(command)) {
      const result = await runRemotePowerCommand(command);
      callback?.(result);
      return;
    }

    callback?.({ success: false, message: `Unknown command: ${command}` });
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
