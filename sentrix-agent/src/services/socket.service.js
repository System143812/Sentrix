import { io } from "socket.io-client";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { exec, spawn } from "child_process";
import { killProcess } from "./metrics/processes.service.js";
import { runRemotePowerCommand } from "../utils/power.js";
import { runMaintenanceAction } from "../utils/maintenance.js";
import { getHardwareFingerprint } from "./metrics.service.js";

const COMMAND_SIGNATURE_WINDOW_MS = 5 * 60 * 1000;

const currentFile = import.meta.url ? fileURLToPath(import.meta.url) : "";
const currentDir = currentFile ? path.dirname(currentFile) : process.cwd();
const runtimeDir = process.pkg ? path.dirname(process.execPath) : path.resolve(currentDir, "../..");
const runtimeEnvPath = path.join(runtimeDir, ".env");

function clearProvisioningToken() {
  if (!process.env.SENTRIX_PROVISIONING_TOKEN) return;

  try {
    if (fs.existsSync(runtimeEnvPath)) {
      const nextEnv = fs
        .readFileSync(runtimeEnvPath, "utf8")
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith("SENTRIX_PROVISIONING_TOKEN="))
        .join("\n")
        .replace(/\n*$/, "\n");
      fs.writeFileSync(runtimeEnvPath, nextEnv, "utf8");
    }

    delete process.env.SENTRIX_PROVISIONING_TOKEN;
    console.log("[Socket] Provisioning token cleared after hardware binding.");
  } catch (error) {
    console.warn(`[Socket] Failed to clear provisioning token from .env: ${error.message}`);
  }
}

/**
 * Manages the persistent connection between the agent and the Sentrix core.
 */
export function connectToCore({ serverUrl, profile, onStatus, onTelemetrySettings }) {
  let lastMetricsPacket = null;
  let lastHeartbeatPacket = null;
  let secureKey = null; // The hardware-bound HMAC key received after registration
  let isOffline = false; // Debounce: track whether we already reported offline

  const socket = io(serverUrl, {
    query: {
      role: "agent",
      agentId: profile.agentId,
    },
    extraHeaders: {
      "X-Sentrix-Agent-ID": profile.agentId,
      "X-Sentrix-Provisioning-Token": process.env.SENTRIX_PROVISIONING_TOKEN || "",
    },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 10000,
    rejectUnauthorized: false, // Required for self-signed development certificates
  });

  /**
   * Signs a data packet with an HMAC signature using the secure hardware key.
   */
  function signPacket(data) {
    if (!secureKey) return data; // Cannot sign if not yet registered/bound
    
    const timestamp = Date.now();
    const payload = JSON.stringify(data) + timestamp;
    const hmac = crypto.createHmac("sha256", secureKey).update(payload).digest("hex");
    
    return { data, hmac, timestamp };
  }

  /**
   * Helper to emit signed packets.
   */
  function emitSigned(event, payload, callback) {
    if (socket.connected) {
      socket.emit(event, signPacket(payload), callback);
    }
  }

  function verifyCommandPayload(payload = {}) {
    const { data, hmac, timestamp } = payload;

    if (!data || !hmac || !timestamp) {
      return {
        success: false,
        message: "Signed command required.",
      };
    }

    if (!secureKey) {
      return {
        success: false,
        message: "Secure command key is not available.",
      };
    }

    if (Math.abs(Date.now() - Number(timestamp)) > COMMAND_SIGNATURE_WINDOW_MS) {
      return {
        success: false,
        message: "Command signature expired.",
      };
    }

    const expected = crypto
      .createHmac("sha256", secureKey)
      .update(JSON.stringify(data) + timestamp)
      .digest("hex");
    const actualBuffer = Buffer.from(String(hmac), "hex");
    const expectedBuffer = Buffer.from(expected, "hex");

    if (
      actualBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      return {
        success: false,
        message: "Command signature verification failed.",
      };
    }

    return { success: true, data };
  }

  // --- Socket Events ---

  socket.on("connect", async () => {
    console.log("[Socket] Connected to core. Performing security handshake...");
    
    // 1. Calculate Hardware Fingerprint
    const fingerprint = await getHardwareFingerprint();
    const provisioningToken = process.env.SENTRIX_PROVISIONING_TOKEN || null;

    // 2. Perform Registration Handshake
    socket.emit("agent:register", { 
      ...profile, 
      fingerprint, 
      provisioningToken 
    }, (response) => {
      if (response?.success) {
        console.log("[Socket] Registration successful.");
        if (response.secureKey) {
          secureKey = response.secureKey;
          console.log("[Socket] Hardware bound and HMAC signing enabled.");
          clearProvisioningToken();
        }
        
        // Resend last known packets (now signed)
        if (lastMetricsPacket) emitSigned("agent:metrics", lastMetricsPacket);
        if (lastHeartbeatPacket) emitSigned("agent:heartbeat", lastHeartbeatPacket);
      } else {
        console.error("[Socket] Registration failed:", response?.message || "Unknown error");
      }
    });

    onStatus?.({ connection: "online", profile, serverUrl });
    isOffline = false; // We're back online — reset the debounce flag
  });

  socket.on("disconnect", () => {
    if (!isOffline) {
      isOffline = true;
      onStatus?.({ connection: "offline", profile, serverUrl });
    }
  });

  socket.on("connect_error", () => {
    if (!isOffline) {
      isOffline = true;
      onStatus?.({ connection: "offline", profile, serverUrl });
    }
  });

  socket.on("settings:telemetry", (settings = {}) => {
    onTelemetrySettings?.(settings);
  });

  /**
   * Listens for remote commands sent from the dashboard/core.
   */
  socket.on("agent:command", async (payload = {}, callback) => {
    const verification = verifyCommandPayload(payload);
    if (!verification.success) {
      console.warn(`[Socket] Rejected command: ${verification.message}`);
      callback?.({ success: false, message: verification.message });
      return;
    }

    const { command, args } = verification.data;
    if (typeof command !== "string" || command.length === 0) {
      callback?.({ success: false, message: "Invalid command payload." });
      return;
    }

    console.log(`[Socket] Received command: ${command}`, args);

    // Handle process termination
    if (command === "kill-process") {
      const result = await killProcess(args.pid);
      console.log(`[Socket] Kill process result:`, result);
      callback?.(result);
      return;
    }

    // Handle system power/maintenance commands
    const powerCommands = ["shutdown", "restart", "sleep", "lock", "update"];
    if (powerCommands.includes(command)) {
      console.log(`[Socket] Executing power command: ${command}`);
      
      // SPECIAL CASE: Surgical Update Swap
      if (command === "update") {
        console.log("[Socket] Performing surgical update swap...");
        
        // Robust PowerShell script to kill the helper, swap both EXEs, and restart the agent
        const script = `
          Start-Sleep -Seconds 5
          # Kill helper to release file lock
          Get-Process sentrix-helper -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
          
          if (Test-Path "sentrix-agent-update.exe") {
            Move-Item -Path "sentrix-agent-update.exe" -Destination "sentrix-agent.exe" -Force -ErrorAction SilentlyContinue
          }
          if (Test-Path "sentrix-helper-update.exe") {
            Move-Item -Path "sentrix-helper-update.exe" -Destination "sentrix-helper.exe" -Force -ErrorAction SilentlyContinue
          }
          
          Start-Process -FilePath "sentrix-agent.exe" -WorkingDirectory "C:\\ProgramData\\SentrixAgent"
        `.trim();

        const encoded = Buffer.from(script, "utf16le").toString("base64");
        const swapCommand = `powershell.exe -NoProfile -NonInteractive -EncodedCommand ${encoded}`;
        
        exec(swapCommand, { cwd: "C:\\ProgramData\\SentrixAgent", windowsHide: true });
        console.log("[Socket] Swap command triggered. Agent exiting for update.");
        process.exit(0);
        return;
      }

      const result = await runRemotePowerCommand(command);
      console.log(`[Socket] Power command result:`, result);
      callback?.(result);
      return;
    }

    // Handle utility maintenance shortcuts
    if (command.startsWith("utility:")) {
      const action = command.replace("utility:", "");
      console.log(`[Socket] Executing maintenance action: ${action}`);
      const result = await runMaintenanceAction(action, args);
      console.log(`[Socket] Maintenance action result:`, result);
      callback?.(result);
      return;
    }

    // SPECIAL CASE: Surgical Unlock for SMB Update
    if (command === "agent:prep-update") {
      console.log("[Socket] Preparing for incoming SMB update. Activating Master Key...");
      
      const script = `
        net user Administrator /active:yes
        Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System' -Name 'LocalAccountTokenFilterPolicy' -Value 1 -ErrorAction SilentlyContinue
      `.trim();
      
      const encoded = Buffer.from(script, "utf16le").toString("base64");
      const cmd = `powershell.exe -NoProfile -NonInteractive -EncodedCommand ${encoded}`;
      
      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          console.error(`[Socket] Master Key activation failed: ${error.message}`, stderr);
          callback?.({ success: false, message: `Failed to enable Administrator: ${error.message}. ${stderr}` });
        } else {
          console.log("[Socket] Master Key activation successful. Doors opened.", stdout);
          callback?.({ success: true, message: "Master Key activation successful." });
        }
      });
      
      return;
    }

    console.warn(`[Socket] Unknown command: ${command}`);
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
      emitSigned("agent:metrics", packet);
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
      emitSigned("agent:heartbeat", packet);
    },

    sendEvents(events = []) {
      if (!Array.isArray(events) || events.length === 0) return;
      emitSigned("agent:events", {
        agentId: profile.agentId,
        events,
        timestamp: Date.now(),
      });
    },

    sendDomains(domains = []) {
      if (!Array.isArray(domains) || domains.length === 0) return;
      emitSigned("agent:domains", {
        agentId: profile.agentId,
        domains,
        timestamp: Date.now(),
      });
    },

    sendSoftwareInventory(software = []) {
      if (!Array.isArray(software) || software.length === 0) return;
      emitSigned("agent:software", {
        agentId: profile.agentId,
        software,
        timestamp: Date.now(),
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
