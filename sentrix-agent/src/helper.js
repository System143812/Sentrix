import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import { exec, execFile } from "child_process";
import { listenForMessages } from "./utils/ipc.js";
import screenshot from "screenshot-desktop";

// Robust way to get __dirname in both ESM and CJS/bundled environments
const __filename_robust = typeof __filename !== "undefined"
  ? __filename
  : (import.meta && import.meta.url ? fileURLToPath(import.meta.url) : "");
const __dirname_robust = typeof __dirname !== "undefined"
  ? __dirname
  : (path && __filename_robust ? path.dirname(__filename_robust) : "");

const exeDir = process.pkg ? path.dirname(process.execPath) : __dirname_robust;
const externalEnvPath = path.join(exeDir, ".env");

try {
  if (fs.existsSync(externalEnvPath)) {
    dotenv.config({ path: externalEnvPath });
  } else {
    dotenv.config();
  }
} catch (err) {
  // Ignore dotenv config errors due to permissions
}

let rawPort = null;
const portArgIdx = process.argv.indexOf("--port");
if (portArgIdx !== -1 && portArgIdx + 1 < process.argv.length) {
  rawPort = process.argv[portArgIdx + 1];
  const parsedPort = Number(rawPort);
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    console.error(`FATAL: Invalid explicit --port value: "${rawPort}"`);
    process.exit(1);
  }
}
const IPC_PORT = rawPort !== null ? Number(rawPort) : Number(process.env.SENTRIX_IPC_PORT || 4101);
if (!Number.isInteger(IPC_PORT) || IPC_PORT < 1 || IPC_PORT > 65535) {
  console.error(`FATAL: Invalid IPC port value: "${IPC_PORT}"`);
  process.exit(1);
}

let logFilePath = path.join(exeDir, "helper.log");
try {
  fs.mkdirSync(exeDir, { recursive: true });
  fs.appendFileSync(logFilePath, "");
} catch (err) {
  // If exeDir is read-only for standard users, fallback to LocalAppData
  const localAppData = process.env.LOCALAPPDATA || process.env.USERPROFILE || "C:\\Temp";
  const fallbackDir = path.join(localAppData, "SentrixAgent");
  try {
    fs.mkdirSync(fallbackDir, { recursive: true });
    logFilePath = path.join(fallbackDir, "helper.log");
  } catch (e) {}
}

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  process.stdout.write(line);
  try {
    fs.appendFileSync(logFilePath, line);
  } catch (err) {}
}

const activeChildProcesses = new Set();
let activeOperations = 0;
let isShuttingDown = false;
let isCleaningUp = false;
let ipcServer = null;

async function cleanupAndExit(exitCode = 0) {
  if (isCleaningUp) return;
  isCleaningUp = true;

  log(`[Helper] Cleaning up resources before exit (code ${exitCode})...`);
  try {
    if (ipcServer) {
      ipcServer.close();
    }
  } catch {}

  const cleanupPromise = (async () => {
    const promises = [];
    for (const child of activeChildProcesses) {
      try {
        child.kill();
      } catch (err) {
        log(`[Helper] Failed to signal child process: ${err.message}`);
      }

      try {
        if (child.pid && Number.isSafeInteger(child.pid) && child.pid > 0) {
          promises.push(
            new Promise((resolve) => {
              execFile("taskkill", ["/PID", String(child.pid), "/F", "/T"], {
                windowsHide: true
              }, () => {
                resolve();
              });
            })
          );
        }
      } catch {}
    }
    await Promise.all(promises);
  })();

  let timeout;
  const timeoutPromise = new Promise((resolve) => {
    timeout = setTimeout(() => {
      log("[Helper] Cleanup timed out; forcing exit.");
      resolve();
    }, 3000);
  });

  try {
    await Promise.race([cleanupPromise, timeoutPromise]);
  } catch (err) {
    log(`[Helper] Cleanup encountered an error: ${err.message}`);
  } finally {
    clearTimeout(timeout);
    process.exit(exitCode);
  }
}

process.on("uncaughtException", (err) => {
  log(`CRITICAL: Uncaught Exception: ${err.stack || err.message}`);
  cleanupAndExit(1);
});

process.on("unhandledRejection", (reason) => {
  log(`CRITICAL: Unhandled Rejection: ${reason}`);
});

log("--- Sentrix Helper Starting ---");
log(`Working Dir: ${process.cwd()}`);
log(`IPC Port: ${IPC_PORT}`);

// Define writable per-user temp directory for broadcast scripts and temp files
const userTempDir = path.join(process.env.LOCALAPPDATA || os.tmpdir(), "SentrixAgent", "Temp");
try {
  fs.mkdirSync(userTempDir, { recursive: true });
} catch (err) {
  log(`[Helper] WARNING: Failed to create user temp dir: ${err.message}`);
}

const cleanupFiles = (sPath, mPath) => {
  try { if (sPath && fs.existsSync(sPath)) fs.unlinkSync(sPath); } catch {}
  try { if (mPath && fs.existsSync(mPath)) fs.unlinkSync(mPath); } catch {}
};
void cleanupFiles;

try {
  ipcServer = listenForMessages(IPC_PORT, async (payload, reply) => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { success: false, error: "Invalid payload: must be a JSON object" };
    }

    const { type, text, senderRole } = payload;
    if (typeof type !== "string") {
      return { success: false, error: "Invalid message type" };
    }

    log(`Received IPC Message: ${type}`);

    if (isShuttingDown && type !== "shutdown") {
      return {
        success: false,
        error: "Helper is shutting down"
      };
    }

    if (type === "ping") {
      return {
        success: true,
        type: "pong",
        status: "ok",
        pid: process.pid
      };
    }

    if (type === "shutdown") {
      if (isShuttingDown) {
        return { success: true, message: "Shutdown already in progress" };
      }
      isShuttingDown = true;
      log(`[Helper] Received shutdown request. Acknowledging...`);
      reply({ success: true, message: "Shutdown acknowledged" }, () => {
        // Stop accepting new IPC requests
        try {
          ipcServer.close();
        } catch {}
      });

      // Wait for active operations and active child processes up to 5 seconds
      const startTime = Date.now();
      while ((activeOperations > 0 || activeChildProcesses.size > 0) && Date.now() - startTime < 5000) {
        await new Promise((r) => setTimeout(r, 200));
      }

      // Force terminate any remaining tracked child processes and bounded wait for taskkill completion
      if (activeChildProcesses.size > 0) {
        log(`[Helper] Force terminating ${activeChildProcesses.size} remaining child process(es)...`);
        for (const child of activeChildProcesses) {
          try {
            child.kill("SIGKILL");
            if (child.pid) {
              await new Promise((resolve) => {
                const timer = setTimeout(() => resolve(), 2000); // Bounded wait for taskkill (max 2s per process)
                exec(`taskkill /PID ${child.pid} /F /T`, { stdio: "ignore" }, () => {
                  clearTimeout(timer);
                  resolve();
                });
              });
            }
          } catch {}
        }
      }

      log(`[Helper] Shutdown complete. Exiting.`);
      process.exit(0);
    }

    if (type === "get_screen_frame") {
      const qInput = Number(payload.quality) || 720;
      let quality = 70;
      if (qInput <= 480 || qInput === 50) quality = 50;
      else if (qInput <= 720 || qInput === 60 || qInput === 70) quality = 70;
      else quality = 85;

      try {
        const imgBuffer = await screenshot({ format: 'jpeg', quality });
        if (imgBuffer) {
          return {
            success: true,
            frame: imgBuffer.toString("base64")
          };
        }
        return { success: false, error: "Empty screenshot buffer" };
      } catch (err) {
        log(`[Helper] ERROR capturing screen: ${err.message}`);
        return { success: false, error: err.message };
      }
    }

    if (type === "lock") {
      activeOperations++;
      let decremented = false;
      const decrementOnce = () => {
        if (!decremented) {
          decremented = true;
          activeOperations--;
        }
      };

      log(`[Helper] Received lock command. Executing LockWorkStation in Session...`);
      return new Promise((resolve) => {
        try {
          const child = exec("rundll32.exe user32.dll,LockWorkStation", (error, __stdout, stderr) => {
            activeChildProcesses.delete(child);
            decrementOnce();
            if (error) {
              log(`[Helper] ERROR executing lock: ${error.message}`);
              if (stderr) log(`[Helper] Stderr: ${stderr.trim()}`);
              resolve({ success: false, error: error.message });
            } else {
              log(`[Helper] Workstation locked successfully.`);
              resolve({ success: true, type: "accepted", message: "Workstation locked successfully" });
            }
          });
          activeChildProcesses.add(child);
        } catch (err) {
          decrementOnce();
          resolve({ success: false, error: `Failed to execute lock process: ${err.message}` });
        }
      });
    }

    if (type === "workspace-reset") {
      activeOperations++;
      let decremented = false;
      const decrementOnce = () => {
        if (!decremented) {
          decremented = true;
          activeOperations--;
        }
      };

      log(`[Helper] Received workspace-reset command in user session.`);
      return new Promise((resolve) => {
        try {
          const workspaceResetScript = `
            $ErrorActionPreference = 'SilentlyContinue'
            $ProgressPreference = 'SilentlyContinue'

            # Close open File Explorer folder windows via Shell.Application COM object
            try {
                $shell = New-Object -ComObject Shell.Application
                $windows = $shell.Windows()
                foreach ($window in $windows) {
                    $fullName = $window.FullName
                    if ($fullName -and $fullName.ToLower() -like "*explorer.exe*") {
                        $window.Quit()
                    }
                }
            } catch {}

            $exclude = @(
                'sentrix-helper', 'sentrix-agent', 'explorer', 'dwm', 'sihost', 'taskhostw',
                'ctfmon', 'fontdrvhost', 'shlexperiencehost', 'startmenuexperiencehost',
                'searchhost', 'applicationframehost', 'lockapp', 'TextInputHost',
                'ShellExperienceHost', 'WindowsInternal.ComposableShell.Experiences.TextInput.InputApp',
                'audiodg', 'conhost', 'dllhost', 'runtimebroker', 'searchindexer', 'svchost',
                'dwm.exe', 'WUDFHost', 'userinit', 'winlogon'
            )
            $procs = Get-Process | Where-Object {
                $_.MainWindowTitle -ne '' -and
                $exclude -notcontains $_.ProcessName.ToLower()
            }
            foreach ($p in $procs) {
                try {
                    $p.CloseMainWindow() | Out-Null
                } catch {}
            }

            Get-Process -Name 'SystemSettings', 'ApplicationFrameHost' -ErrorAction SilentlyContinue | Where-Object {
                $exclude -notcontains $_.ProcessName.ToLower()
            } | ForEach-Object {
                try {
                    $_.CloseMainWindow() | Out-Null
                } catch {}
            }

            Start-Sleep -Seconds 3

            Get-Process | Where-Object {
                ($_.MainWindowTitle -ne '' -or $_.ProcessName.ToLower() -in @('systemsettings', 'applicationframehost')) -and
                $exclude -notcontains $_.ProcessName.ToLower()
            } | Stop-Process -Force -ErrorAction SilentlyContinue

            exit 0
          `.trim();

          const encoded = Buffer.from(workspaceResetScript, "utf16le").toString("base64");
          const child = exec(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`, (error, __stdout, stderr) => {
            activeChildProcesses.delete(child);
            decrementOnce();
            if (error) {
              log(`[Helper] ERROR executing workspace-reset: ${error.message}`);
              if (stderr) log(`[Helper] Stderr: ${stderr.trim()}`);
              resolve({ success: false, error: error.message });
            } else {
              log(`[Helper] Workspace reset successfully executed in user session.`);
              resolve({ success: true, message: "Workspace reset successfully executed in user session." });
            }
          });
          activeChildProcesses.add(child);
        } catch (err) {
          decrementOnce();
          resolve({ success: false, error: `Failed to execute workspace reset process: ${err.message}` });
        }
      });
    }

    if (type === "broadcast") {
      if (typeof text !== "string") {
        return { success: false, error: "Invalid text parameter: must be a string" };
      }
      if (text.length > 150) {
        return { success: false, error: "Broadcast message exceeds maximum allowed length (150 characters)" };
      }

      let formattedRole = "Administrator";
      if (senderRole !== undefined) {
        if (typeof senderRole !== "string") {
          return { success: false, error: "Invalid senderRole parameter: must be a string" };
        }
        if (senderRole.length > 100) {
          return { success: false, error: "senderRole exceeds maximum allowed length (100 characters)" };
        }
        const cleanedRole = senderRole.replace(/[_-]/g, " ").trim();
        formattedRole = cleanedRole ? cleanedRole.charAt(0).toUpperCase() + cleanedRole.slice(1) : "Administrator";
      }

      activeOperations++;
      let decremented = false;
      const decrementOnce = () => {
        if (!decremented) {
          decremented = true;
          activeOperations--;
        }
      };

      log(`[Helper] Received broadcast: "${text.substring(0, 30)}..." from role: ${formattedRole}`);

      const debugLogPath = "C:\\ProgramData\\SentrixAgent\\native-toast-debug.log";
      const agentDataDir = "C:\\ProgramData\\SentrixAgent";

      const escapedMsg = text.replace(/'/g, "''");
      const escapedRole = formattedRole.replace(/'/g, "''");
      const escapedDebugLog = debugLogPath.replace(/'/g, "''");
      const escapedDataDir = agentDataDir.replace(/'/g, "''");

      const psCommand = [
        "$ErrorActionPreference = 'Stop'",
        `$logFile = '${escapedDebugLog}'`,
        "function Log-Debug($msg) {",
        "    $line = '[$(Get-Date -Format \"yyyy-MM-dd HH:mm:ss.fff\")] ' + $msg",
        "    Add-Content -Path $logFile -Value $line",
        "}",
        "Log-Debug 'BurntToast script started.'",
        `$rawRole = '${escapedRole}'`,
        `$rawMsg = '${escapedMsg}'`,
        `$baseDir = '${escapedDataDir}'`,
        "try {",
        "    Log-Debug 'Resolving BurntToast module path...'",
        "    $modulePath = Join-Path $baseDir 'assets\\Modules\\BurntToast\\BurntToast.psd1'",
        "    if (-not (Test-Path $modulePath)) {",
        "        $modulePath = Join-Path $baseDir 'Modules\\BurntToast\\BurntToast.psd1'",
        "    }",
        "    if (Test-Path $modulePath) {",
        "        Import-Module $modulePath -Force | Out-Null",
        "        Log-Debug 'BurntToast module loaded successfully.'",
        "    } else {",
        "        Log-Debug 'WARNING: BurntToast module not found on disk.'",
        "    }",
        "    $logoPath = Join-Path $baseDir 'sentrix-dark.png'",
        "    if (-not (Test-Path $logoPath)) {",
        "        $logoPath = Join-Path $baseDir 'assets\\sentrix-dark.png'",
        "    }",
        "    if (-not (Test-Path $logoPath)) {",
        "        $logoPath = Join-Path $baseDir 'src\\assets\\sentrix-dark.png'",
        "    }",
        "    if (-not (Test-Path $logoPath)) {",
        "        $localDevLogo = Join-Path (Get-Location) 'src\\assets\\sentrix-dark.png'",
        "        if (Test-Path $localDevLogo) { $logoPath = $localDevLogo }",
        "    }",
        "    $params = @{ Text = @(\"Message from $rawRole\", $rawMsg) }",
        "    if (Test-Path $logoPath) { $params['AppLogo'] = $logoPath }",
        "    New-BurntToastNotification @params | Out-Null",
        "    Log-Debug 'SUCCESS: BurntToast notification displayed successfully.'",
        "    Write-Host 'SUCCESS: BurntToast notification displayed.'",
        "} catch {",
        "    Log-Debug ('ERROR in BurntToast: ' + $_.Exception.Message + ' (Stack: ' + $_.ScriptStackTrace + ')')",
        "    Write-Host ('ERROR: ' + $_.Exception.Message)",
        "    exit 1",
        "}"
      ].join("; ");

      const command = `powershell -NoProfile -Sta -ExecutionPolicy Bypass -EncodedCommand ${Buffer.from(psCommand, "utf16le").toString("base64")}`;

      log(`[Helper] Dispatching native WinRT Toast command asynchronously...`);
      try {
        const child = exec(command, { windowsHide: true }, (error, stdout, stderr) => {
          activeChildProcesses.delete(child);
          decrementOnce();
          if (error) {
            log(`[Helper] ERROR executing native toast: ${error.message}`);
            if (stderr) log(`[Helper] Stderr: ${stderr.trim()}`);
          } else {
            log(`[Helper] Native toast command completed. Output: ${stdout.trim() || "none"}`);
          }
        });
        activeChildProcesses.add(child);
      } catch (err) {
        decrementOnce();
        log(`[Helper] Failed to execute native toast process: ${err.message}`);
      }

      return { success: true, type: "accepted", message: "Broadcast notification accepted" };
    }

    return { success: false, error: `Unknown message type: ${type}` };
  }, {
    onError(error) {
      if (error?.code === "EADDRINUSE") {
        log(`[Helper] IPC port ${IPC_PORT} is already owned by another helper. Exiting duplicate instance cleanly.`);
        process.exit(0);
      }

      log(`CRITICAL: IPC server failed: ${error.stack || error.message}`);
      process.exit(1);
    },
  });
} catch (err) {
  log(`CRITICAL: Server failed to start: ${err.stack || err.message}`);
  process.exit(1);
}
