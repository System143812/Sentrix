import fs from "fs";
import path from "path";
import { spawn, execSync, execFileSync } from "child_process";
import { fileURLToPath } from "url";
import crypto from "crypto";
import dotenv from "dotenv";
import { isAdmin, isSystem, elevate } from "./utils/elevation.js";
import { getAgentProfile,
  getDeviceDetails,
  getMetrics,
  setGlobalMetricInterval,
  getMetricsFingerprint,
} from "./services/metrics.service.js";
import { collectSolidUsbDevices, collectSolidDisplays, invalidatePnpCache } from "./services/metrics/peripherals.service.js";
import { connectToCore } from "./services/socket.service.js";
import { SessionManager } from "./services/session-manager.js";
import { detectDeviceEvents, buildDomainSummaries } from "./services/event-detector.service.js";
import { collectSoftwareInventory } from "./services/software-inventory.service.js";

// Robust way to get the directory where the EXE (or script) is located
const __filename_robust = typeof __filename !== "undefined"
  ? __filename
  : (import.meta && import.meta.url ? fileURLToPath(import.meta.url) : "");
const __dirname_robust = typeof __dirname !== "undefined"
  ? __dirname
  : (path && __filename_robust ? path.dirname(__filename_robust) : "");

const exeDir = process.pkg ? path.dirname(process.execPath) : __dirname_robust;
const externalEnvPath = path.join(exeDir, ".env");
const logFilePath = path.join(exeDir, "agent.log");

function log(message, extra = "") {
  const suffix = extra ? ` ${extra}` : "";
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}${suffix}\n`;

  process.stdout.write(line);

  try {
    fs.appendFileSync(logFilePath, line);
  } catch (err) {
    // Ignore log file write errors
  }
}

// Redirect global console to our log file
console.log = (...args) => {
  log(args.map(a => typeof a === "object" ? JSON.stringify(a, (key, value) => typeof value === 'bigint' ? value.toString() : value) : a).join(" "));
};
console.error = (...args) => {
  log("ERROR: " + args.map(a => typeof a === "object" ? JSON.stringify(a) : a).join(" "));
};
console.warn = (...args) => {
  log("WARN: " + args.map(a => typeof a === "object" ? JSON.stringify(a) : a).join(" "));
};

if (fs.existsSync(externalEnvPath)) {
  dotenv.config({ path: externalEnvPath });
} else {
  dotenv.config();
}

log("--- Sentrix Agent Starting ---");
log(`Executable: ${process.execPath}`);
log(`Working Dir: ${process.cwd()}`);
log(`Platform: ${process.platform}`);
log(`Is Admin: ${isAdmin()}`);
log(`Is System: ${isSystem()}`);

// Auto-elevate on Windows to ensure hardware sensor access (only if not service and not system)
const cliArgs = process.argv.slice(2);
const isServiceMode = cliArgs.includes("--service");
if (process.platform === "win32" && !isServiceMode && !isAdmin() && !isSystem()) {
  log("[Elevation] Sentrix Agent requires administrative privileges for hardware monitoring.");
  log("[Elevation] Attempting to relaunch as administrator...");
  try {
    elevate();
  } catch (err) {
    log(`[Elevation] Failed to elevate: ${err.message}`);
  }
}

// Parse CLI arguments robustly (preventing --service misinterpretation and truncation)
const inlineServerUrl = cliArgs.find(arg => arg.startsWith("--server-url="));
const serverUrlIndex = cliArgs.indexOf("--server-url");
const serverUrlArg = inlineServerUrl
  ? inlineServerUrl.slice("--server-url=".length)
  : serverUrlIndex >= 0 && serverUrlIndex + 1 < cliArgs.length && !cliArgs[serverUrlIndex + 1].startsWith("--")
    ? cliArgs[serverUrlIndex + 1]
    : undefined;

let serverUrl = process.env.SENTRIX_SERVER_URL || serverUrlArg || "https://localhost:4000";

if (serverUrl && !serverUrl.startsWith("http://") && !serverUrl.startsWith("https://")) {
  serverUrl = `https://${serverUrl}`;
}

log(`Server URL: "${serverUrl || 'MISSING'}"`);
log(`[Diagnostics] Executable Path: ${process.execPath}`);
log(`[Diagnostics] Working Directory: ${process.cwd()}`);
log(`[Diagnostics] External .env path: ${externalEnvPath} (exists: ${fs.existsSync(externalEnvPath)})`);
log(`[Diagnostics] Loaded SENTRIX_SERVER_URL from env: ${process.env.SENTRIX_SERVER_URL ? "yes" : "no"}`);
log(`[Diagnostics] CLI server URL argument: ${serverUrlArg || "none"}`);
log(`[Diagnostics] Winning Server URL: ${serverUrl}`);
log(`[Diagnostics] SENTRIX_SERVER_MAC present: ${process.env.SENTRIX_SERVER_MAC ? "yes" : "no"} (${process.env.SENTRIX_SERVER_MAC || 'none'})`);
log(`[Diagnostics] Provisioning token present: ${process.env.SENTRIX_PROVISIONING_TOKEN ? "yes" : "no"}`);

// --- Windows-Compatible CommandLineToArgvW Argument Parser ---
export function parseWindowsArgs(cmdLine) {
  if (!cmdLine || typeof cmdLine !== "string") return [];
  const args = [];
  let i = 0;
  while (i < cmdLine.length) {
    while (i < cmdLine.length && (cmdLine[i] === ' ' || cmdLine[i] === '\t')) {
      i++;
    }
    if (i >= cmdLine.length) break;

    let arg = "";
    let inQuotes = false;

    while (i < cmdLine.length) {
      let c = cmdLine[i];
      if (c === '\\') {
        let bCount = 0;
        while (i < cmdLine.length && cmdLine[i] === '\\') {
          bCount++;
          i++;
        }
        if (i < cmdLine.length && cmdLine[i] === '"') {
          arg += '\\'.repeat(Math.floor(bCount / 2));
          if (bCount % 2 === 1) {
            arg += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
            i++;
          }
        } else {
          arg += '\\'.repeat(bCount);
        }
      } else if (c === '"') {
        inQuotes = !inQuotes;
        i++;
      } else if ((c === ' ' || c === '\t') && !inQuotes) {
        break;
      } else {
        arg += c;
        i++;
      }
    }
    args.push(arg);
  }
  return args;
}

// --- Single-Instance Advisory Lock with OS Mutex Reclamation & Strict Identity Validation ---
let cleanupLock = () => {};
const lockFilePath = path.join(exeDir, "sentrix-agent.lock");
const lockToken = crypto.randomUUID();

function isProcessRunning(pid, expectedExecPath, expectedScriptPath) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    if (process.platform === "win32") {
      try {
        const output = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
        if (!output || output.toLowerCase().includes("no tasks running")) {
          // If tasklist output is empty or no tasks running, but process.kill(pid, 0) succeeded,
          // treat as running conservatively to avoid false reclamation on localized Windows.
          return true;
        }

        const lines = output.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) {
          return true; // Conservative fallback
        }

        const isOldPackaged = expectedExecPath && !expectedExecPath.toLowerCase().includes("node.exe") && expectedExecPath.toLowerCase().endsWith(".exe");

        for (const line of lines) {
          const parts = line.split('","').map(p => p.replace(/^"|"$/g, ""));
          if (parts.length >= 2) {
            const imageName = parts[0].toLowerCase();
            const processId = parts[1];
            if (String(pid) === String(processId)) {
              if (isOldPackaged) {
                const expectedImg = path.basename(expectedExecPath).toLowerCase();
                return imageName === expectedImg;
              } else {
                // Development execution (node.exe): parse command line robustly
                try {
                  const wmiOutput = execSync(`powershell -NoProfile -NonInteractive -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CommandLine"`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
                  if (wmiOutput && expectedScriptPath) {
                    const cmdArgs = parseWindowsArgs(wmiOutput.trim());
                    const normExpected = path.resolve(expectedScriptPath).toLowerCase();
                    for (const arg of cmdArgs) {
                      try {
                        const resolvedArg = path.resolve(arg.replace(/^["']|["']$/g, "")).toLowerCase();
                        if (resolvedArg === normExpected) {
                          return true;
                        }
                      } catch {}
                    }
                    return false;
                  }
                } catch {
                  return true; // Conservative fallback if WMI inspection fails
                }
                return imageName.includes("sentrix-agent") || imageName.includes("node");
              }
            }
          }
        }

        return true; // Conservative fallback if csv parse didn't match row but process exists
      } catch {
        return true; // Conservative fallback if tasklist fails
      }
    }
    return true;
  } catch (err) {
    if (err.code === "EPERM") return true;
    return false;
  }
}

if (!process.env.VITEST && process.env.NODE_ENV !== "test") {
  try {
    let acquired = false;
    let attempts = 0;

    while (!acquired && attempts < 5) {
      attempts++;
      let fd = null;
      let writeInitiated = false;
      let attemptOwned = false;
      let attemptStats = null;
      let bytesWritten = 0;
      let expectedBytes = 0;

      try {
        fd = fs.openSync(lockFilePath, "wx");
        writeInitiated = true;
        attemptOwned = true;
        try {
          attemptStats = fs.fstatSync(fd);
        } catch {}

        const lockPayload = JSON.stringify({
          pid: process.pid,
          token: lockToken,
          time: Date.now(),
          execPath: process.execPath,
          scriptPath: __filename_robust
        }, null, 2);
        expectedBytes = Buffer.byteLength(lockPayload, "utf8");
        bytesWritten = fs.writeSync(fd, lockPayload);
        fs.closeSync(fd);
        fd = null;

        if (bytesWritten !== expectedBytes) {
          throw new Error(`Incomplete lock write: wrote ${bytesWritten} of ${expectedBytes} bytes.`);
        }

        acquired = true;
      } catch (err) {
        if (fd !== null) {
          try { fs.closeSync(fd); } catch {}
          fd = null;
        }
        if (err.code === "EEXIST") {
          let lockContent = "";
          let lockData = {};
          let readSuccess = false;
          try {
            lockContent = fs.readFileSync(lockFilePath, "utf8");
            lockData = JSON.parse(lockContent);
            readSuccess = true;
          } catch {
            readSuccess = false;
          }

          const oldPid = lockData.pid;
          const oldExecPath = lockData.execPath;
          const oldScriptPath = lockData.scriptPath;
          const oldToken = lockData.token;

          if (oldPid === process.pid && oldToken === lockToken) {
            acquired = true;
            break;
          }

          // Validate oldPid as positive safe integer and oldToken as non-empty string
          const validOldPid = Number.isInteger(oldPid) && oldPid > 0 ? oldPid : null;
          const validOldToken = typeof oldToken === "string" && oldToken.length > 0 ? oldToken : null;

          if (readSuccess && validOldPid && validOldToken && (!isProcessRunning(validOldPid, oldExecPath, oldScriptPath) || validOldPid === process.pid)) {
            // Use OS-managed Windows Mutex via PowerShell (.NET Mutex) with AbandonedMutexException handling and safe env var passing
            let reclaimedSuccessfully = false;
            try {
              process.env.SENTRIX_RECLAIM_PID = String(validOldPid);
              process.env.SENTRIX_RECLAIM_TOKEN = String(validOldToken);
              process.env.SENTRIX_RECLAIM_LOCK_PATH = lockFilePath;

              const reclaimPsScript = `
                $createdNew = $false
                $mutexName = "Global\\SentrixAgentReclaimMutex"
                $mutex = New-Object System.Threading.Mutex($true, $mutexName, [ref]$createdNew)
                $acquired = $false
                if ($createdNew) {
                  $acquired = $true
                } else {
                  try {
                    $acquired = $mutex.WaitOne(3000)
                  }
                  catch [System.Threading.AbandonedMutexException] {
                    $acquired = $true
                  }
                }

                if (-not $acquired) {
                  exit 1
                }

                try {
                  $lockPath = $env:SENTRIX_RECLAIM_LOCK_PATH
                  $targetPid = [int]$env:SENTRIX_RECLAIM_PID
                  $targetToken = $env:SENTRIX_RECLAIM_TOKEN

                  if (Get-Process -Id $targetPid -ErrorAction SilentlyContinue) {
                    exit 1
                  }

                  if (Test-Path $lockPath) {
                    $content = Get-Content -Path $lockPath -Raw -ErrorAction SilentlyContinue
                    if ($content) {
                      try {
                        $data = $content | ConvertFrom-Json
                        if ($data.pid -eq $targetPid -and $data.token -eq $targetToken) {
                          Remove-Item -Path $lockPath -Force
                          if ($?) {
                            exit 0
                          } else {
                            exit 1
                          }
                        }
                      } catch {}
                    }
                  }
                  exit 0
                } finally {
                  $mutex.ReleaseMutex()
                  $mutex.Dispose()
                }
              `.trim();

              const encodedReclaim = Buffer.from(reclaimPsScript, "utf16le").toString("base64");
              execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${encodedReclaim}`, { stdio: "ignore", windowsHide: true });
              reclaimedSuccessfully = true;
            } catch {
              Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
              continue;
            } finally {
              delete process.env.SENTRIX_RECLAIM_PID;
              delete process.env.SENTRIX_RECLAIM_TOKEN;
              delete process.env.SENTRIX_RECLAIM_LOCK_PATH;
            }

            if (reclaimedSuccessfully) {
              continue;
            }
          } else {
            if (!readSuccess) {
              console.error(`[Instance] FATAL: Existing lock file is empty, malformed, or unreadable. Exiting to prevent concurrency violation.`);
            } else {
              console.error(`[Instance] FATAL: Another Sentrix Agent instance is already running (PID: ${oldPid}). Exiting.`);
            }
            process.exit(1);
          }
        } else {
          // Cleanup partial file verified strictly by attempt-scoped file identity (inode/dev)
          if (writeInitiated && attemptOwned) {
            try {
              if (fs.existsSync(lockFilePath)) {
                const currentStats = fs.statSync(lockFilePath);
                const canVerifyIdentity = attemptStats && currentStats &&
                  typeof attemptStats.ino === 'number' && typeof currentStats.ino === 'number' &&
                  attemptStats.ino !== 0 && currentStats.ino !== 0;

                const matchesIdentity = canVerifyIdentity &&
                  (attemptStats.ino === currentStats.ino && attemptStats.dev === currentStats.dev);

                if (matchesIdentity) {
                  fs.unlinkSync(lockFilePath);
                }
              }
            } catch {}
          }
          break;
        }
      }
    }

    if (acquired) {
      cleanupLock = () => {
        try {
          if (fs.existsSync(lockFilePath)) {
            const lockContent = fs.readFileSync(lockFilePath, "utf8");
            const lockData = JSON.parse(lockContent);
            if (lockData.pid === process.pid && lockData.token === lockToken) {
              fs.unlinkSync(lockFilePath);
            }
          }
        } catch {}
      };
    } else {
      console.error("[Instance] FATAL: Failed to acquire single-instance advisory lock after multiple attempts. Exiting.");
      process.exit(1);
    }
  } catch (lockErr) {
    console.error(`[Instance] FATAL error during advisory lock setup: ${lockErr.message}`);
    process.exit(1);
  }
}

process.on("exit", () => {
  cleanupLock();
});

// --- Startup Self-Lockdown & Initialization ---
async function runStartupInitialization() {
  const isServiceOrAdmin = isServiceMode || isAdmin() || isSystem();
  if (!isServiceOrAdmin) return;

  log("[Startup] Running autonomous security lockdown and initialization...");
  try {
    const { performLockdown } = await import("./services/installer.service.js");
    const lockdownResult = await performLockdown();
    if (lockdownResult && lockdownResult.success === false) {
      log(`[Startup] Warning: Lockdown reported failure: ${lockdownResult.message || 'Unknown error'}`);
    } else {
      log("[Startup] Autonomous security lockdown completed successfully.");
    }
  } catch (error) {
    log(`[Startup] Warning during lockdown: ${error.message}`);
  }
}

let isShuttingDown = false;
let shutdownPromise = null;
let metricsTimer = null;
let softwareTimer = null;
let heartbeatTimer = null;
let stopSignalPollInterval = null;
let peripheralListenerProcess = null;
let peripheralRestartTimer = null;
let debounceTimer = null;
let metricsIntervalMs = Number(process.env.METRICS_INTERVAL_MS || 5000);
let detailsIntervalMs = metricsIntervalMs;
const heartbeatIntervalMs = Number(process.env.HEARTBEAT_INTERVAL_MS || 5000);

let socketClient;
let sessionManager = null;
let profile;
let lastMetrics = null;
let lastMetricsSentAt = 0;
let lastMetricsHash = null;
const FORCE_METRICS_SEND_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let lastDetails = null;
let lastDetailsAt = 0;
let collectingMetrics = false;
let collectingDetails = false;
let collectingSoftware = false;
const softwareInventoryIntervalMs = Number(process.env.SOFTWARE_INVENTORY_INTERVAL_MS || 6 * 60 * 60 * 1000);

async function refreshDetails(force = false) {
  if (isShuttingDown || collectingDetails) return;
  if (!force && Date.now() - lastDetailsAt < detailsIntervalMs) return;

  collectingDetails = true;

  try {
    lastDetails = await getDeviceDetails();
    lastDetailsAt = Date.now();
    log(`Collected device details. Peripherals: ${lastDetails.usbDevices?.length || 0} USB devices found.`);
  } catch (error) {
    log("Failed to collect device details:", error.message);
  } finally {
    collectingDetails = false;
  }
}

async function collectAndSendMetrics() {
  if (isShuttingDown || collectingMetrics) return;

  collectingMetrics = true;

  try {
    lastMetrics = await getMetrics();
    if (isShuttingDown) return;

    const currentHash = getMetricsFingerprint(lastMetrics);
    const timeSinceLastSend = Date.now() - lastMetricsSentAt;

    if (currentHash !== lastMetricsHash || timeSinceLastSend >= FORCE_METRICS_SEND_INTERVAL_MS) {
      socketClient?.sendMetrics(lastMetrics, lastDetails);
      lastMetricsHash = currentHash;
      lastMetricsSentAt = Date.now();
    } else {
      log("[Telemetry] Metrics unchanged. Skipping emission.");
    }

    socketClient?.sendDomains(buildDomainSummaries(lastMetrics));
    socketClient?.sendEvents(detectDeviceEvents(lastMetrics, lastDetails));
  } catch (error) {
    log("Failed to collect metrics:", error.message);
  } finally {
    collectingMetrics = false;
  }
}

async function collectAndSendSoftwareInventory() {
  if (isShuttingDown || collectingSoftware) return;
  collectingSoftware = true;

  try {
    const software = await collectSoftwareInventory();
    if (isShuttingDown) return;
    socketClient?.sendSoftwareInventory(software);
    log(`Collected software inventory. Applications: ${software.length}.`);
  } catch (error) {
    log("Failed to collect software inventory:", error.message);
  } finally {
    collectingSoftware = false;
  }
}

async function start() {
  if (isShuttingDown) return;
  log("[Startup] Entering start() initialization sequence...");
  try {
    profile = await getAgentProfile();
    log(`[Startup] getAgentProfile() completed successfully. AgentId: ${profile?.agentId || 'unknown'}`);
  } catch (profErr) {
    log(`[Startup] CRITICAL: Failed to retrieve agent profile: ${profErr.stack || profErr.message}`);
    throw profErr;
  }
  if (isShuttingDown) return;

  lastDetails = profile.details;
  lastDetailsAt = Date.now();

  log(`[Startup] Immediately before calling connectToCore() with serverUrl: "${serverUrl}", agentId: "${profile?.agentId || 'unknown'}"`);
  try {
    socketClient = connectToCore({
      serverUrl,
      profile,
      onTelemetrySettings(settings = {}) {
        if (isShuttingDown) return;
        metricsIntervalMs = Math.min(Math.max(Number(settings.intervalMs) || metricsIntervalMs, 1000), 60000);
        setGlobalMetricInterval(metricsIntervalMs);
        if (metricsTimer) clearInterval(metricsTimer);
        metricsTimer = setInterval(collectAndSendMetrics, metricsIntervalMs);
        log(`Telemetry interval set to ${metricsIntervalMs}ms`);
      },
      onStatus(status) {
        log(`[StatusCallback] Connection status update received: connection="${status.connection}", serverUrl="${status.serverUrl || serverUrl}"`);
        log(`Connection ${status.connection}`, status.serverUrl || "");
        if (status.connection === "online") {
          lastMetricsSentAt = Date.now();
        }
      },
    });
    log("[Startup] connectToCore() returned successfully. Socket client initialized.");
  } catch (connErr) {
    log(`[Startup] CRITICAL: Failed to initialize connection service: ${connErr.stack || connErr.message}`);
    throw connErr;
  }

  if (isShuttingDown) return;

  // ---- Session Manager for Helper Processes (SYSTEM -> User Sessions) ----
  if (process.platform === "win32") {
    sessionManager = new SessionManager({
      exeDir,
      helperExeName: "sentrix-helper.exe",
      logger: log
    });
    try {
      await sessionManager.initialize();
      await sessionManager.start();
      log("[Startup] SessionManager initialized and started successfully.");
    } catch (mgrErr) {
      log(`[Startup] WARNING: Failed to start SessionManager: ${mgrErr.message}`);
    }
  }

  if (isShuttingDown) return;
  await collectAndSendMetrics();
  if (isShuttingDown) return;
  await collectAndSendSoftwareInventory();
  if (isShuttingDown) return;

  // ---- Zero-Lag Native Peripheral Listener (SYSTEM) ----
  let restartAttempts = 0;
  let activeStableTimer = null;

  const startPeripheralListener = () => {
    if (isShuttingDown) return;
    const script = `
      $ProgressPreference = 'SilentlyContinue'
      $query = "SELECT * FROM Win32_DeviceChangeEvent"
      Register-WmiEvent -Query $query -Action { Write-Host "HARDWARE_CHANGE" }
      while($true) { Start-Sleep -Seconds 1 }
    `.trim();

    const encoded = Buffer.from(script, "utf16le").toString("base64");
    let listener;
    try {
      listener = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"]
      });
    } catch (spawnErr) {
      log(`[Peripheral] Failed to spawn native listener process: ${spawnErr.message}`);
      scheduleRestart();
      return;
    }

    peripheralListenerProcess = listener;
    let exited = false;

    listener.on("error", (err) => {
      if (isShuttingDown || exited) return;
      exited = true;
      if (peripheralListenerProcess === listener) {
        peripheralListenerProcess = null;
      }
      if (activeStableTimer) {
        clearTimeout(activeStableTimer);
        activeStableTimer = null;
      }
      log(`[Peripheral] Native listener process error: ${err.message}`);
      scheduleRestart();
    });

    listener.stdout.on("data", (data) => {
      if (isShuttingDown) return;
      const output = data.toString();
      if (output.includes("HARDWARE_CHANGE")) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (isShuttingDown) return;
          log("[Peripheral] Native hardware event detected. Triggering instant refresh...");
          invalidatePnpCache();
          refreshDetails(true).then(() => {
            if (!isShuttingDown) {
              socketClient?.sendMetrics(lastMetrics, lastDetails);
            }
          });
        }, 1500);
      }
    });

    listener.on("exit", (code, signal) => {
      if (isShuttingDown || exited) return;
      exited = true;
      if (peripheralListenerProcess === listener) {
        peripheralListenerProcess = null;
      }
      if (activeStableTimer) {
        clearTimeout(activeStableTimer);
        activeStableTimer = null;
      }
      log(`[Peripheral] Native listener exited (code: ${code}, signal: ${signal}).`);
      scheduleRestart();
    });

    // Reset restart attempts after 60s of stable running for this exact listener instance
    activeStableTimer = setTimeout(() => {
      if (!isShuttingDown && peripheralListenerProcess === listener) {
        restartAttempts = 0;
        activeStableTimer = null;
      }
    }, 60000);
    if (activeStableTimer.unref) activeStableTimer.unref();
  };

  const scheduleRestart = () => {
    if (isShuttingDown) return;
    if (peripheralRestartTimer) clearTimeout(peripheralRestartTimer);

    restartAttempts++;
    // Exponential backoff: 2s, 4s, 8s, 16s, capped at 30s
    const delay = Math.min(Math.pow(2, restartAttempts) * 1000, 30000);
    log(`[Peripheral] Scheduling native listener restart in ${delay / 1000}s (attempt ${restartAttempts})...`);
    peripheralRestartTimer = setTimeout(startPeripheralListener, delay);
  };

  if (process.platform === "win32") {
    startPeripheralListener();
  }

  let lastHeartbeatSentAt = 0;

  metricsTimer = setInterval(collectAndSendMetrics, metricsIntervalMs);
  softwareTimer = setInterval(collectAndSendSoftwareInventory, softwareInventoryIntervalMs);

  heartbeatTimer = setInterval(() => {
    if (isShuttingDown) return;
    const now = Date.now();
    if (now - lastHeartbeatSentAt >= heartbeatIntervalMs) {
      const heartbeatData = {
        status: "online",
        timestamp: now,
        lastMetricsAt: lastMetrics?.timestamp || lastMetrics?.lastUpdatedAt || null,
      };
      socketClient?.sendHeartbeat(heartbeatData);
      lastHeartbeatSentAt = now;
    }
  }, 2000);
}

async function gracefulShutdown(reason = "SIGNAL", exitCode = 0) {
  if (shutdownPromise) return shutdownPromise;

  shutdownPromise = (async () => {
    if (isShuttingDown) {
      return exitCode;
    }
    isShuttingDown = true;
    log(`[Shutdown] Initiating graceful shutdown (Reason: ${reason}, ExitCode: ${exitCode})...`);

    let listenerTerminatedSuccessfully = true;

    try {
      // 1. Stop all timers
      if (softwareTimer) { clearInterval(softwareTimer); softwareTimer = null; }
      if (metricsTimer) { clearInterval(metricsTimer); metricsTimer = null; }
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
      if (stopSignalPollInterval) { clearInterval(stopSignalPollInterval); stopSignalPollInterval = null; }
      if (peripheralRestartTimer) { clearTimeout(peripheralRestartTimer); peripheralRestartTimer = null; }
      if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }

      // 2. Terminate peripheral listener process: taskkill process tree first while PID is alive, fallback to direct SIGKILL
      if (peripheralListenerProcess) {
        const p = peripheralListenerProcess;
        peripheralListenerProcess = null;
        try {
          if (p.pid) {
            try {
              execFileSync("taskkill", ["/PID", String(p.pid), "/F", "/T"], { stdio: "ignore", windowsHide: true });
            } catch {}
          }
          try { p.kill("SIGKILL"); } catch {}

          await new Promise((resolve) => {
            let settled = false;
            const checkInterval = setInterval(() => {
              try {
                process.kill(p.pid, 0);
              } catch (err) {
                if (err.code === "ESRCH") {
                  if (!settled) {
                    settled = true;
                    clearInterval(checkInterval);
                    resolve();
                  }
                } else if (err.code === "EPERM") {
                  // EPERM means process exists but permission denied — do not treat as terminated
                }
              }
            }, 100);

            const timeoutTimer = setTimeout(() => {
              if (!settled) {
                settled = true;
                clearInterval(checkInterval);
                listenerTerminatedSuccessfully = false;
                log(`[Shutdown] WARNING: Peripheral listener process (PID: ${p.pid}) did not exit cleanly within bounded termination window.`);
                resolve();
              }
            }, 3000);

            const originalResolve = resolve;
            resolve = () => {
              clearTimeout(timeoutTimer);
              originalResolve();
            };
          });
        } catch {
          listenerTerminatedSuccessfully = false;
        }
      }

      // 3. Wait for in-flight collection operations with bounded timeout and status tracking
      const collectionStart = Date.now();
      while ((collectingMetrics || collectingDetails || collectingSoftware) && Date.now() - collectionStart < 3000) {
        await new Promise((r) => setTimeout(r, 100));
      }
      const timedOutCollections = collectingMetrics || collectingDetails || collectingSoftware;

      let finalExitCode = exitCode;
      if (!listenerTerminatedSuccessfully) {
        finalExitCode = 3; // Cleanup failure exit code
      } else if (timedOutCollections) {
        log(`[Shutdown] WARNING: Shutdown completed while collection operations were still in-flight (metrics: ${collectingMetrics}, details: ${collectingDetails}, software: ${collectingSoftware}).`);
        if (exitCode === 0) {
          finalExitCode = 2;
        }
      }

      // 4. Close socket client and stop session manager
      if (sessionManager) {
        try {
          await sessionManager.stop();
          log("[Shutdown] SessionManager stopped successfully.");
        } catch (mgrStopErr) {
          log(`[Shutdown] Error stopping SessionManager: ${mgrStopErr.message}`);
        }
      }

      if (socketClient) {
        try {
          socketClient.close();
        } catch {}
      }

      // 5. Release advisory lock
      cleanupLock();
      log(`[Shutdown] Cleanup complete. Exiting with code ${finalExitCode}.`);
      process.exit(finalExitCode);
    } catch (err) {
      log(`[Shutdown] Error during graceful shutdown: ${err.message}`);
      try { cleanupLock(); } catch {}
      process.exit(1);
    }
  })();

  return shutdownPromise;
}

process.on("SIGINT", () => gracefulShutdown("SIGINT", 0));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM", 0));

process.on("uncaughtException", (err) => {
  log(`CRITICAL: Uncaught Exception: ${err.stack || err.message}`);
  gracefulShutdown("UNCAUGHT_EXCEPTION", 1).catch(() => process.exit(1));
});

process.on("unhandledRejection", (reason) => {
  log(`CRITICAL: Unhandled Rejection: ${reason}`);
  gracefulShutdown("UNHANDLED_REJECTION", 1).catch(() => process.exit(1));
});

// Watch for graceful stop signal from AgentServiceHost (stale deletion delegated to host)
stopSignalPollInterval = setInterval(() => {
  try {
    const stopSigPath = path.join(exeDir, "stop.sig");
    if (fs.existsSync(stopSigPath)) {
      log("[Shutdown] Graceful stop signal detected.");
      try { fs.unlinkSync(stopSigPath); } catch {}
      gracefulShutdown("STOP_SIGNAL_FILE", 0);
    }
  } catch (err) {
    log(`[Shutdown] Error watching stop signal: ${err.message}`);
  }
}, 1000);

// Run startup initialization, then start the daemon
async function main() {
  await runStartupInitialization();
  if (isShuttingDown) return;
  await start();
}

if (!process.env.VITEST && process.env.NODE_ENV !== "test") {
  main().catch((error) => {
    log("Sentrix agent failed to start:", error.stack || error.message);
    gracefulShutdown("STARTUP_FAILURE", 1);
  });
}
