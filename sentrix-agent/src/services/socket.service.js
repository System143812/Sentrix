import { io } from "socket.io-client";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import https from "https";
import http from "http";
import { killProcess } from "./metrics/processes.service.js";
import { runRemotePowerCommand } from "../utils/power.js";
import { runMaintenanceAction } from "../utils/maintenance.js";
import { getHardwareFingerprint } from "./metrics.service.js";
import { generateTraceId, traceLog } from "../utils/tracing.js";
import { discoverServerByMac, updateEnvServerUrl, saveServerMac } from "./server-discovery.js";

const COMMAND_SIGNATURE_WINDOW_MS = 5 * 60 * 1000;

const currentFile = import.meta.url ? fileURLToPath(import.meta.url) : "";
const currentDir = currentFile ? path.dirname(currentFile) : process.cwd();
const runtimeDir = process.pkg
  ? path.dirname(process.execPath)
  : path.resolve(currentDir, "../..");
const runtimeEnvPath = path.join(runtimeDir, ".env");

function clearProvisioningToken() {
  if (!process.env.SENTRIX_PROVISIONING_TOKEN) return;

  try {
    if (fs.existsSync(runtimeEnvPath)) {
      const nextEnv = fs
        .readFileSync(runtimeEnvPath, "utf8")
        .split(/\r?\n/)
        .filter(
          (line) => !line.trim().startsWith("SENTRIX_PROVISIONING_TOKEN="),
        )
        .join("\n")
        .replace(/\n*$/, "\n");
      fs.writeFileSync(runtimeEnvPath, nextEnv, "utf8");
    }

    delete process.env.SENTRIX_PROVISIONING_TOKEN;
    console.log("[Socket] Provisioning token cleared after hardware binding.");
  } catch (error) {
    console.warn(
      `[Socket] Failed to clear provisioning token from .env: ${error.message}`,
    );
  }
}

/**
 * Manages the persistent connection between the agent and the Sentrix core.
 */
export function connectToCore({
  serverUrl,
  profile,
  onStatus,
  onTelemetrySettings,
}) {
  let lastMetricsPacket = null;
  let lastHeartbeatPacket = null;
  let secureKey = null; // The hardware-bound HMAC key received after registration
  let isRegistered = false; // State flag: true only after successful registration handshake with secureKey
  let isOffline = false; // Debounce: track whether we already reported offline
  let isClosed = false; // State flag: true after close() is called
  let connectionGeneration = 0; // Incremented on connect and disconnect to prevent stale registration callback races
  let discoveryInProgress = false;
  let currentDiscoveryTimer = null;
  let registrationAttempts = 0;
  const MAX_REGISTRATION_RETRIES = 3;
  let currentRetryTimer = null;
  let currentRegTimeout = null;

  // NOTE: Replay cache is in-memory and does not survive agent restarts.
  // Core must ensure unique commandIds and avoid resending commands across agent lifecycle boundaries.
  const processedCommandIds = new Map();

  let caCerts = undefined;
  const certPath = path.join(runtimeDir, "server.crt");
  if (fs.existsSync(certPath)) {
    try {
      caCerts = [fs.readFileSync(certPath)];
      console.log("[Socket] Loaded trusted Core certificate (server.crt) for TLS verification.");
    } catch (err) {
      console.warn("[Socket] Failed to load local server.crt:", err.message);
    }
  }

  const rejectUnauthorized = process.env.NODE_ENV === "production" ? true : (process.env.SENTRIX_VERIFY_SSL !== "false");

  const agent = new https.Agent({
    ca: caCerts,
    rejectUnauthorized,
  });

  console.log(`[Socket] Initializing Socket.IO client connection to serverUrl="${serverUrl}", agentId="${profile.agentId}", rejectUnauthorized=${rejectUnauthorized}, hasTrustedCert=${Boolean(caCerts)}`);

  const socket = io(serverUrl, {
    query: {
      role: "agent",
      agentId: profile.agentId,
    },
    extraHeaders: {
      "X-Sentrix-Agent-ID": profile.agentId,
      "X-Sentrix-Provisioning-Token":
        process.env.SENTRIX_PROVISIONING_TOKEN || "",
    },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 10000,
    rejectUnauthorized,
    agent,
  });

  /**
   * Signs a data packet with an HMAC signature using the secure hardware key.
   */
  function signPacket(data) {
    if (!isRegistered || !secureKey) return data;

    const timestamp = Date.now();
    const payload = JSON.stringify(data) + timestamp;
    const hmac = crypto
      .createHmac("sha256", secureKey)
      .update(payload)
      .digest("hex");

    return { data, hmac, timestamp };
  }

  /**
   * Helper to emit signed packets with optional tracing.
   */
  function emitSigned(event, payload, callback) {
    if (isClosed || !isRegistered || !secureKey) {
      return;
    }
    if (socket.connected) {
      const traceId = generateTraceId();
      const tracedPayload = { ...payload, traceId };
      traceLog(traceId, "Agent", `Emit ${event}`, { agentId: profile.agentId });

      socket.emit(event, signPacket(tracedPayload), (res) => {
        if (isClosed) return;
        traceLog(traceId, "Agent", `Ack ${event}`, res || {});
        callback?.(res);
      });
    }
  }

  function verifyCommandPayload(payload = {}) {
    const { data, hmac, timestamp } = payload;

    const numTimestamp = Number(timestamp);
    if (!data || !hmac || typeof timestamp !== "number" || !Number.isFinite(numTimestamp)) {
      return {
        success: false,
        message: "Signed command required with valid numeric timestamp.",
      };
    }

    if (!isRegistered || !secureKey) {
      return {
        success: false,
        message: "Secure command key is not available.",
      };
    }

    const timeDiff = Math.abs(Date.now() - numTimestamp);
    if (timeDiff > COMMAND_SIGNATURE_WINDOW_MS) {
      return {
        success: false,
        message: "Command signature expired.",
      };
    }

    const { commandId } = data;
    if (!commandId || typeof commandId !== "string") {
      return {
        success: false,
        message: "Command ID (nonce) required.",
      };
    }

    // Replay protection cache maintenance & check
    const now = Date.now();
    for (const [id, ts] of processedCommandIds.entries()) {
      if (now - ts > COMMAND_SIGNATURE_WINDOW_MS * 2) {
        processedCommandIds.delete(id);
      }
    }
    if (processedCommandIds.has(commandId)) {
      return {
        success: false,
        message: "Duplicate command ID (replay detected).",
      };
    }

    if (processedCommandIds.size >= 1000) {
      return {
        success: false,
        message: "Command replay cache capacity exceeded.",
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

    // Record commandId ONLY after successful HMAC verification and before execution
    processedCommandIds.set(commandId, now);

    return { success: true, data };
  }

  function safeCallback(callback, result) {
    try {
      callback?.(result);
    } catch (cbErr) {
      console.error("[Socket] Error in command callback invocation:", cbErr.message);
    }
  }

  async function performRegistrationSequence(capturedGeneration) {
    if (isClosed || connectionGeneration !== capturedGeneration || !socket.connected) return;

    let fingerprint;
    try {
      fingerprint = await getHardwareFingerprint();
    } catch (err) {
      console.error(`[Socket] Failed to acquire hardware fingerprint (attempt ${registrationAttempts + 1}):`, err.message);
      handleRegistrationFailureOrRetry(capturedGeneration, err.message);
      return;
    }

    if (isClosed || connectionGeneration !== capturedGeneration || !socket.connected) return;

    const provisioningToken = process.env.SENTRIX_PROVISIONING_TOKEN || null;
    let registrationTimedOut = false;

    if (currentRegTimeout) {
      clearTimeout(currentRegTimeout);
      currentRegTimeout = null;
    }

    currentRegTimeout = setTimeout(() => {
      registrationTimedOut = true;
      currentRegTimeout = null;
      console.error(`[Socket] Registration handshake timed out (attempt ${registrationAttempts + 1}).`);
      handleRegistrationFailureOrRetry(capturedGeneration, "Registration timeout");
    }, 10000);

    console.log(`[Socket] Emitting agent:register for agentId="${profile.agentId}" (fingerprint acquired successfully, tokenPresent=${Boolean(provisioningToken)})`);

    socket.emit(
      "agent:register",
      {
        ...profile,
        fingerprint,
        provisioningToken,
      },
      (response) => {
        if (registrationTimedOut || isClosed || connectionGeneration !== capturedGeneration || !socket.connected) return;
        if (currentRegTimeout) {
          clearTimeout(currentRegTimeout);
          currentRegTimeout = null;
        }

        console.log(`[Socket] agent:register response received: success=${response?.success}, message="${response?.message || 'none'}", secureKeyPresent=${Boolean(response?.secureKey)}, serverMac="${response?.serverMac || 'none'}"`);

        const validKey = response?.secureKey && typeof response.secureKey === "string" && response.secureKey.length > 0;
        if (response?.success && validKey) {
          console.log("[Socket] Registration successful.");
          secureKey = response.secureKey;
          isRegistered = true;
          registrationAttempts = 0;
          console.log("[Socket] Hardware bound and HMAC signing enabled.");
          clearProvisioningToken();

          if (response.serverMac) {
            try {
              saveServerMac(runtimeEnvPath, response.serverMac);
            } catch (macErr) {
              console.warn(`[Socket] Failed to save server MAC: ${macErr.message}`);
            }
          }

          // Emit cached packets now that registration is confirmed
          if (lastMetricsPacket) emitSigned("agent:metrics", lastMetricsPacket);
          if (lastHeartbeatPacket) emitSigned("agent:heartbeat", lastHeartbeatPacket);

          onStatus?.({ connection: "online", profile, serverUrl });
          isOffline = false;
        } else {
          console.error(
            "[Socket] Registration failed:",
            response?.message || "Unknown error",
          );
          handleRegistrationFailureOrRetry(capturedGeneration, response?.message || "Registration rejected");
        }
      },
    );
  }

  function handleRegistrationFailureOrRetry(capturedGeneration, reason) {
    isRegistered = false;
    secureKey = null;

    if (isClosed || connectionGeneration !== capturedGeneration || !socket.connected) return;

    if (registrationAttempts < MAX_REGISTRATION_RETRIES) {
      registrationAttempts++;
      const backoffMs = Math.min(2000 * Math.pow(2, registrationAttempts - 1), 15000);
      console.log(`[Socket] Retrying registration in ${backoffMs}ms (attempt ${registrationAttempts}/${MAX_REGISTRATION_RETRIES})...`);

      currentRetryTimer = setTimeout(() => {
        currentRetryTimer = null;
        performRegistrationSequence(capturedGeneration);
      }, backoffMs);
    } else {
      console.error("[Socket] Max registration retries reached. Waiting for reconnect or next connection cycle.");
    }
  }

  // --- Socket Events ---

  socket.on("connect", async () => {
    if (isClosed) return;
    connectionGeneration++;
    const capturedGeneration = connectionGeneration;
    registrationAttempts = 0;
    if (currentRetryTimer) {
      clearTimeout(currentRetryTimer);
      currentRetryTimer = null;
    }
    if (currentRegTimeout) {
      clearTimeout(currentRegTimeout);
      currentRegTimeout = null;
    }

    console.log("[Socket] Connected to core. Performing security handshake...");
    await performRegistrationSequence(capturedGeneration);
  });

  socket.on("disconnect", () => {
    connectionGeneration++;
    isRegistered = false;
    secureKey = null;
    if (currentRetryTimer) {
      clearTimeout(currentRetryTimer);
      currentRetryTimer = null;
    }
    if (currentRegTimeout) {
      clearTimeout(currentRegTimeout);
      currentRegTimeout = null;
    }
    if (!isOffline) {
      isOffline = true;
      onStatus?.({ connection: "offline", profile, serverUrl });
    }
  });

  socket.on("server:ip-changed", async ({ serverUrl: newServerUrl }) => {
    if (isClosed) return;
    if (newServerUrl && newServerUrl !== serverUrl) {
      console.log(`[Socket] Received server IP change push: -> ${newServerUrl}`);
      updateEnvServerUrl(runtimeEnvPath, newServerUrl);
      serverUrl = newServerUrl;
      socket.io.uri = newServerUrl;
      socket.connect();
    }
  });

  let consecutiveErrors = 0;
  let discoveryAttempts = 0;
  const DISCOVERY_TRIGGER_THRESHOLD = 3;
  const MAX_DISCOVERY_ATTEMPTS = 10;
  const DISCOVERY_BACKOFF_BASE_MS = 30000;

  socket.on("connect_error", async (err) => {
    if (isClosed) return;
    console.error(`[Socket] Connection error encountered on serverUrl="${serverUrl}": message="${err.message}", type="${err.type || 'unknown'}", description="${err.description || 'none'}", consecutiveErrors=${consecutiveErrors + 1}`);

    if (!isOffline) {
      isOffline = true;
      onStatus?.({ connection: "offline", profile, serverUrl });
    }

    consecutiveErrors++;

    if (consecutiveErrors < DISCOVERY_TRIGGER_THRESHOLD || discoveryInProgress || isClosed) return;
    if (discoveryAttempts >= MAX_DISCOVERY_ATTEMPTS) {
      if ((consecutiveErrors - DISCOVERY_TRIGGER_THRESHOLD) % (MAX_DISCOVERY_ATTEMPTS * 5) !== 0) return;
    }

    const serverMac = process.env.SENTRIX_SERVER_MAC;
    if (!serverMac) {
      return;
    }

    const backoffMs = Math.min(
      DISCOVERY_BACKOFF_BASE_MS * Math.pow(2, Math.min(discoveryAttempts, 6)),
      5 * 60 * 1000
    );

    discoveryInProgress = true;

    if (discoveryAttempts > 0) {
      const backoffPromise = new Promise((resolve) => {
        currentDiscoveryTimer = setTimeout(resolve, backoffMs);
      });
      try {
        await backoffPromise;
      } catch {
        discoveryInProgress = false;
        return;
      }
      currentDiscoveryTimer = null;
    }

    if (isClosed) {
      discoveryInProgress = false;
      return;
    }

    discoveryAttempts++;

    let port = 4000;
    try {
      const parsed = new URL(serverUrl);
      port = Number(parsed.port) || 4000;
    } catch {}

    try {
      const discoveredUrl = await discoverServerByMac({ serverMac, port });
      if (isClosed) return;
      if (discoveredUrl && discoveredUrl !== serverUrl) {
        console.log(`[Socket] Found server at new IP: ${discoveredUrl}`);
        updateEnvServerUrl(runtimeEnvPath, discoveredUrl);
        serverUrl = discoveredUrl;
        consecutiveErrors = 0;
        discoveryAttempts = 0;
        socket.io.uri = discoveredUrl;
        socket.connect();
      }
    } catch (err) {
      console.warn(`[Socket] MAC-based discovery failed: ${err.message}`);
    } finally {
      discoveryInProgress = false;
    }
  });

  socket.on("settings:telemetry", (settings = {}) => {
    if (isClosed) return;
    onTelemetrySettings?.(settings);
  });

  /**
   * Listens for remote commands sent from the dashboard/core.
   */
  socket.on("agent:command", async (payload = {}, callback) => {
    if (isClosed) return;

    try {
      const verification = verifyCommandPayload(payload);
      if (!verification.success) {
        console.warn(`[Socket] Rejected command: ${verification.message}`);
        safeCallback(callback, { success: false, message: verification.message });
        return;
      }

      const { command, args } = verification.data;
      if (typeof command !== "string" || command.length === 0) {
        safeCallback(callback, { success: false, message: "Invalid command payload." });
        return;
      }

      console.log(`[Socket] Received command: ${command}`, args);

      if (command === "kill-process") {
        const result = await killProcess(args.pid);
        safeCallback(callback, result);
        return;
      }

      if (command === "lockdown") {
        const { performLockdown } = await import("./installer.service.js");
        const result = await performLockdown();
        safeCallback(callback, result);
        return;
      }

      const powerCommands = ["shutdown", "restart", "sleep", "lock"];
      if (powerCommands.includes(command)) {
        const result = await runRemotePowerCommand(command);
        safeCallback(callback, result);
        return;
      }

      if (command.startsWith("utility:")) {
        const action = command.replace("utility:", "");
        const result = await runMaintenanceAction(action, args);
        safeCallback(callback, result);
        return;
      }

      if (command === "update") {
        const { updateBundleUrl } = args;
        if (!updateBundleUrl) {
          safeCallback(callback, { success: false, message: "Missing updateBundleUrl in command payload." });
          return;
        }

        console.log(`[Socket] Received update command. Downloading bundle from ${updateBundleUrl}...`);
        safeCallback(callback, { success: true, message: "Update bundle download started." });

        // Perform download asynchronously in background
        (async () => {
          try {
            const stagingDir = path.join(runtimeDir, "staging");
            const stagingExtractedDir = path.join(stagingDir, "extracted");
            const zipPath = path.join(stagingDir, "dist.zip");

            if (fs.existsSync(stagingDir)) {
              fs.rmSync(stagingDir, { recursive: true, force: true });
            }
            fs.mkdirSync(stagingExtractedDir, { recursive: true });

            const fileStream = fs.createWriteStream(zipPath);
            const parsedUrl = new URL(updateBundleUrl);

            await new Promise((resolve, reject) => {
              const reqOpts = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || 443,
                path: parsedUrl.pathname + parsedUrl.search,
                method: "GET",
                agent: agent,
              };

              const getReq = https.request(reqOpts, (res) => {
                if (res.statusCode !== 200) {
                  reject(new Error(`Failed to download update bundle. HTTP status ${res.statusCode}`));
                  return;
                }
                res.pipe(fileStream);
                fileStream.on("finish", () => {
                  fileStream.close();
                  resolve();
                });
              });

              getReq.on("error", (err) => {
                try { fs.unlinkSync(zipPath); } catch {}
                reject(err);
              });

              getReq.end();
            });

            console.log("[Socket] Update bundle downloaded successfully. Extracting...");

            // Extract zip using PowerShell
            const extractPs = `
              Add-Type -AssemblyName System.IO.Compression.FileSystem
              [System.IO.Compression.ZipFile]::ExtractToDirectory('${zipPath.replace(/'/g, "''")}', '${stagingExtractedDir.replace(/'/g, "''")}')
            `;
            const tempPsPath = path.join(stagingDir, "extract.ps1");
            fs.writeFileSync(tempPsPath, extractPs, "utf8");

            await new Promise((resolve, reject) => {
              exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tempPsPath}"`, (error, stdout, stderr) => {
                try { fs.unlinkSync(tempPsPath); } catch {}
                if (error) {
                  reject(new Error(`Extraction failed: ${stderr || error.message}`));
                } else {
                  resolve(stdout);
                }
              });
            });

            console.log("[Socket] Update bundle extracted to staging. Creating .update-ready marker...");
            const readyMarker = path.join(runtimeDir, ".update-ready");
            fs.writeFileSync(readyMarker, JSON.stringify({ timestamp: new Date().toISOString() }), "utf8");

            console.log("[Socket] Update staged successfully. Exiting agent so Watchdog can apply swap...");
            setTimeout(() => {
              process.exit(0);
            }, 1000);

          } catch (updateErr) {
            console.error("[Socket] Failed to process zero-touch update bundle:", updateErr.message);
          }
        })();

        return;
      }

      safeCallback(callback, { success: false, message: `Unknown command: ${command}` });
    } catch (cmdErr) {
      safeCallback(callback, { success: false, message: `Command execution error: ${cmdErr.message}` });
    }
  });

  // --- API for the service ---

  return {
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
      return !isClosed && isRegistered && socket.connected;
    },

    close() {
      isClosed = true;
      if (currentDiscoveryTimer) {
        clearTimeout(currentDiscoveryTimer);
        currentDiscoveryTimer = null;
      }
      if (currentRetryTimer) {
        clearTimeout(currentRetryTimer);
        currentRetryTimer = null;
      }
      if (currentRegTimeout) {
        clearTimeout(currentRegTimeout);
        currentRegTimeout = null;
      }
      socket.close();
    },
  };
}
