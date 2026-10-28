import { io } from "socket.io-client";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { exec, spawn } from "child_process";
import https from "https";
import http from "http";
import { killProcess } from "./metrics/processes.service.js";
import { runRemotePowerCommand } from "../utils/power.js";
import { runMaintenanceAction } from "../utils/maintenance.js";
import { getHardwareFingerprint } from "./metrics.service.js";
import { generateTraceId, traceLog } from "../utils/tracing.js";

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
  let isOffline = false; // Debounce: track whether we already reported offline

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
    rejectUnauthorized: false, // Required for self-signed development certificates
  });

  /**
   * Signs a data packet with an HMAC signature using the secure hardware key.
   */
  function signPacket(data) {
    if (!secureKey) return data; // Cannot sign if not yet registered/bound

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
    if (!secureKey) {
      // Cannot emit signed packets before registration and secureKey exchange complete.
      return;
    }
    if (socket.connected) {
      const traceId = generateTraceId();
      const tracedPayload = { ...payload, traceId };
      traceLog(traceId, "Agent", `Emit ${event}`, { agentId: profile.agentId });

      socket.emit(event, signPacket(tracedPayload), (res) => {
        traceLog(traceId, "Agent", `Ack ${event}`, res || {});
        callback?.(res);
      });
    }
  }

  function verifyCommandPayload(payload = {}) {
    const { data, hmac, timestamp } = payload;

    if (!data || !hmac || !timestamp) {
      console.warn(
        "[Socket] Verify command failed: missing data, hmac, or timestamp.",
        { hasData: !!data, hasHmac: !!hmac, hasTimestamp: !!timestamp },
      );
      return {
        success: false,
        message: "Signed command required.",
      };
    }

    if (!secureKey) {
      console.warn(
        "[Socket] Verify command failed: secureKey is not available on agent.",
      );
      return {
        success: false,
        message: "Secure command key is not available.",
      };
    }

    const timeDiff = Math.abs(Date.now() - Number(timestamp));
    if (timeDiff > COMMAND_SIGNATURE_WINDOW_MS) {
      console.warn(
        `[Socket] Verify command failed: signature expired (timeDiff: ${timeDiff}ms, window: ${COMMAND_SIGNATURE_WINDOW_MS}ms).`,
      );
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
      console.warn("[Socket] Verify command failed: HMAC signature mismatch.");
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
    socket.emit(
      "agent:register",
      {
        ...profile,
        fingerprint,
        provisioningToken,
      },
      (response) => {
        if (response?.success) {
          console.log("[Socket] Registration successful.");
          if (response.secureKey) {
            secureKey = response.secureKey;
            console.log("[Socket] Hardware bound and HMAC signing enabled.");
            clearProvisioningToken();
          }

          // Resend last known packets (now signed)
          if (lastMetricsPacket) emitSigned("agent:metrics", lastMetricsPacket);
          if (lastHeartbeatPacket)
            emitSigned("agent:heartbeat", lastHeartbeatPacket);
        } else {
          console.error(
            "[Socket] Registration failed:",
            response?.message || "Unknown error",
          );
        }
      },
    );

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
    console.log("[Socket] Received agent:command raw event.", {
      hasData: !!payload?.data,
      hasHmac: !!payload?.hmac,
      timestamp: payload?.timestamp,
      hasSecureKey: !!secureKey,
    });

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
        const updateLogPath = path.join(runtimeDir, "update.log");
        const logUpdate = (msg) => {
          const timestamp = new Date().toISOString();
          const line = `[${timestamp}] ${msg}\n`;
          console.log(msg);
          try {
            fs.appendFileSync(updateLogPath, line, "utf8");
          } catch {}
        };

        logUpdate(
          "[Socket] Starting HTTP-based binary download for update...",
        );

        const downloadFile = (fileUrl, destinationPath) => {
          return new Promise((resolve, reject) => {
            if (!fileUrl) {
              resolve(false);
              return;
            }
            let targetUrl = fileUrl;
            if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
              targetUrl = `https://${targetUrl}`;
            }
            const client = targetUrl.startsWith("https") ? https : http;
            const fileStream = fs.createWriteStream(destinationPath);

            const req = client.get(targetUrl, { rejectUnauthorized: false }, (response) => {
              if (response.statusCode !== 200) {
                fileStream.close();
                fs.unlink(destinationPath, () => {});
                reject(new Error(`Failed to download ${fileUrl}: Status code ${response.statusCode}`));
                return;
              }

              response.pipe(fileStream);

              fileStream.on("finish", () => {
                fileStream.close(() => {
                  try {
                    const stats = fs.statSync(destinationPath);
                    if (stats.size === 0) {
                      reject(new Error(`Downloaded file ${destinationPath} is empty.`));
                    } else {
                      resolve(true);
                    }
                  } catch (e) {
                    reject(e);
                  }
                });
              });
            });

            req.on("error", (err) => {
              fileStream.close();
              fs.unlink(destinationPath, () => {});
              reject(err);
            });

            req.setTimeout(60000, () => {
              req.destroy();
              fileStream.close();
              fs.unlink(destinationPath, () => {});
              reject(new Error(`Download timeout for ${fileUrl}`));
            });
          });
        };

        try {
          const agentTmpPath = path.join(runtimeDir, "sentrix-agent-update.tmp");
          const helperTmpPath = path.join(runtimeDir, "sentrix-helper-update.tmp");
          const agentUpdatePath = path.join(runtimeDir, "sentrix-agent-update.exe");
          const helperUpdatePath = path.join(runtimeDir, "sentrix-helper-update.exe");

          // Clean up old tmp files if any
          try { if (fs.existsSync(agentTmpPath)) fs.unlinkSync(agentTmpPath); } catch {}
          try { if (fs.existsSync(helperTmpPath)) fs.unlinkSync(helperTmpPath); } catch {}

          const downloadPromises = [];
          if (args.agentBinaryUrl) {
            logUpdate(`[Socket] Downloading agent update to temp from ${args.agentBinaryUrl}...`);
            downloadPromises.push(
              downloadFile(args.agentBinaryUrl, agentTmpPath).then(() => {
                logUpdate("[Socket] Successfully downloaded sentrix-agent-update.tmp via HTTP.");
              })
            );
          } else {
            logUpdate("[Socket] Warning: agentBinaryUrl missing in update args.");
          }

          if (args.helperBinaryUrl) {
            logUpdate(`[Socket] Downloading helper update to temp from ${args.helperBinaryUrl}...`);
            downloadPromises.push(
              downloadFile(args.helperBinaryUrl, helperTmpPath).then(() => {
                logUpdate("[Socket] Successfully downloaded sentrix-helper-update.tmp via HTTP.");
              })
            );
          } else {
            logUpdate("[Socket] Warning: helperBinaryUrl missing in update args.");
          }

          await Promise.all(downloadPromises);
          logUpdate("[Socket] All update binaries downloaded and verified successfully in temp. Staging final update files...");

          if (args.agentBinaryUrl && fs.existsSync(agentTmpPath)) {
            if (fs.existsSync(agentUpdatePath)) fs.unlinkSync(agentUpdatePath);
            fs.renameSync(agentTmpPath, agentUpdatePath);
            logUpdate("[Socket] Staged sentrix-agent-update.exe.");
          }

          if (args.helperBinaryUrl && fs.existsSync(helperTmpPath)) {
            if (fs.existsSync(helperUpdatePath)) fs.unlinkSync(helperUpdatePath);
            fs.renameSync(helperTmpPath, helperUpdatePath);
            logUpdate("[Socket] Staged sentrix-helper-update.exe.");
          }

          logUpdate("[Socket] Update binaries staged successfully for watchdog/swap.");
        } catch (err) {
          logUpdate(`[Socket] Failed to download update binaries: ${err.message}`);
          callback?.({
            success: false,
            message: `Failed to download update binaries: ${err.message}`,
          });
          return;
        }

        // Robust PowerShell script to log, stop tasks/processes, swap both EXEs with retries, and restart both tasks
        const script = `
          $logPath = "${updateLogPath.replace(/\\/g, "\\\\")}"
          function Write-Log ($msg) {
            "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss))] $msg" | Out-File -FilePath $logPath -Append -Encoding utf8
          }

          Write-Log "PowerShell update swap script started."
          Start-Sleep -Seconds 3

          Write-Log "Stopping Sentrix Helper and Sentrix Agent scheduled tasks..."
          Stop-ScheduledTask -TaskName "Sentrix Helper" -ErrorAction SilentlyContinue
          Stop-ScheduledTask -TaskName "Sentrix Agent" -ErrorAction SilentlyContinue

          Write-Log "Killing remaining sentrix-helper and sentrix-agent processes..."
          Get-Process sentrix-helper -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
          Get-Process sentrix-agent -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
          taskkill /F /IM sentrix-helper* 2>&1 | Out-Null
          taskkill /F /IM sentrix-agent* 2>&1 | Out-Null

          Start-Sleep -Seconds 3

          if (Test-Path "sentrix-helper-update.exe") {
            Write-Log "Moving sentrix-helper-update.exe to sentrix-helper.exe with retries..."
            $success = $false
            for ($i = 1; $i -le 5; $i++) {
              try {
                Get-Process sentrix-helper -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
                taskkill /F /IM sentrix-helper* 2>&1 | Out-Null
                if (Test-Path "sentrix-helper.exe") {
                  Remove-Item -Path "sentrix-helper.exe" -Force -ErrorAction SilentlyContinue
                }
                Move-Item -Path "sentrix-helper-update.exe" -Destination "sentrix-helper.exe" -Force -ErrorAction Stop
                $success = $true
                Write-Log "Successfully swapped sentrix-helper.exe on attempt $i."
                break
              } catch {
                Write-Log "Attempt $i to swap sentrix-helper.exe failed: $_. Retrying in 1 second..."
                Start-Sleep -Seconds 1
              }
            }
            if (-not $success) {
              Write-Log "WARNING: Failed to swap sentrix-helper.exe after 5 attempts. Removing update binary to prevent loop."
              Remove-Item -Path "sentrix-helper-update.exe" -Force -ErrorAction SilentlyContinue
            }
          }

          if (Test-Path "sentrix-agent-update.exe") {
            Write-Log "Moving sentrix-agent-update.exe to sentrix-agent.exe with retries..."
            $success = $false
            for ($i = 1; $i -le 5; $i++) {
              try {
                Get-Process sentrix-agent -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
                taskkill /F /IM sentrix-agent* 2>&1 | Out-Null
                if (Test-Path "sentrix-agent.exe") {
                  Remove-Item -Path "sentrix-agent.exe" -Force -ErrorAction SilentlyContinue
                }
                Move-Item -Path "sentrix-agent-update.exe" -Destination "sentrix-agent.exe" -Force -ErrorAction Stop
                $success = $true
                Write-Log "Successfully swapped sentrix-agent.exe on attempt $i."
                break
              } catch {
                Write-Log "Attempt $i to swap sentrix-agent.exe failed: $_. Retrying in 1 second..."
                Start-Sleep -Seconds 1
              }
            }
            if (-not $success) {
              Write-Log "WARNING: Failed to swap sentrix-agent.exe after 5 attempts. Removing update binary."
              Remove-Item -Path "sentrix-agent-update.exe" -Force -ErrorAction SilentlyContinue
            }
          }

          Write-Log "Restarting Sentrix Helper and Sentrix Agent tasks..."
          Start-ScheduledTask -TaskName "Sentrix Helper" -ErrorAction SilentlyContinue
          Start-ScheduledTask -TaskName "Sentrix Agent" -ErrorAction SilentlyContinue
          if (-not (Get-ScheduledTask -TaskName "Sentrix Agent" -ErrorAction SilentlyContinue -State Running)) {
            Write-Log "Scheduled task start failed or not running, falling back to Start-Process for agent..."
            Start-Process -FilePath "sentrix-agent.exe" -WorkingDirectory "${runtimeDir.replace(/\\/g, "\\\\")}"
          }
          Write-Log "Update swap completed successfully."
        `.trim();

        const encoded = Buffer.from(script, "utf16le").toString("base64");
        const swapCommand = `powershell.exe -NoProfile -NonInteractive -EncodedCommand ${encoded}`;

        exec(
          swapCommand,
          { cwd: runtimeDir, windowsHide: true },
          (err, stdout, stderr) => {
            if (err) {
              logUpdate(`[Socket] Swap process error: ${err.message}`);
            }
            if (stderr) {
              logUpdate(`[Socket] Swap process stderr: ${stderr}`);
            }
          },
        );

        logUpdate("[Socket] Swap command triggered. Agent exiting for update.");
        callback?.({
          success: true,
          message: "Update staged and swap triggered.",
        });
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
      console.log(
        "[Socket] Preparing for incoming SMB update. Activating Master Key...",
      );

      const script = `
        net user Administrator /active:yes
        Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System' -Name 'LocalAccountTokenFilterPolicy' -Value 1 -ErrorAction SilentlyContinue
      `.trim();

      const encoded = Buffer.from(script, "utf16le").toString("base64");
      const cmd = `powershell.exe -NoProfile -NonInteractive -EncodedCommand ${encoded}`;

      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          console.error(
            `[Socket] Master Key activation failed: ${error.message}`,
            stderr,
          );
          callback?.({
            success: false,
            message: `Failed to enable Administrator: ${error.message}. ${stderr}`,
          });
        } else {
          console.log(
            "[Socket] Master Key activation successful. Doors opened.",
            stdout,
          );
          callback?.({
            success: true,
            message: "Master Key activation successful.",
          });
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
