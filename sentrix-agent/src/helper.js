import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { listenForMessages } from "./utils/ipc.js";
import { DEFAULT_BROADCAST_SCRIPT } from "./utils/broadcast-template.js";

// Robust way to get __dirname in both ESM and CJS/bundled environments
const __filename_robust = typeof __filename !== "undefined" 
  ? __filename 
  : (import.meta && import.meta.url ? fileURLToPath(import.meta.url) : "");
const __dirname_robust = typeof __dirname !== "undefined" 
  ? __dirname 
  : (path && __filename_robust ? path.dirname(__filename_robust) : "");

const exeDir = process.pkg ? path.dirname(process.execPath) : __dirname_robust;
const externalEnvPath = path.join(exeDir, ".env");

if (fs.existsSync(externalEnvPath)) {
  dotenv.config({ path: externalEnvPath });
} else {
  dotenv.config();
}

const IPC_PORT = Number(process.env.SENTRIX_IPC_PORT || 4101);

const logFilePath = path.join(exeDir, "helper.log");

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  process.stdout.write(line);
  try {
    fs.appendFileSync(logFilePath, line);
  } catch (err) {}
}

process.on("uncaughtException", (err) => {
  log(`CRITICAL: Uncaught Exception: ${err.stack || err.message}`);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  log(`CRITICAL: Unhandled Rejection: ${reason}`);
});

log("--- Sentrix Helper Starting ---");

// Self-hide console window on startup
if (process.platform === "win32") {
  const hideScript = `
    \$definition = @'
      [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
      [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
      [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);
'@
    \$type = Add-Type -MemberDefinition \$definition -Name "Win32Utils" -Namespace "Win32" -PassThru
    \$hwnd = \$type::GetConsoleWindow()
    if (\$hwnd -ne [IntPtr]::Zero) {
        # SW_HIDE = 0
        \$type::ShowWindow(\$hwnd, 0)
        # Move window off-screen just in case it flashes
        \$type::SetWindowPos(\$hwnd, [IntPtr](-1), -10000, -10000, 0, 0, 0x0080)
    }
  `;
  exec(`powershell -NoProfile -Command "${hideScript.replace(/\n/g, "")}"`);
}

log(`Working Dir: ${process.cwd()}`);
log(`IPC Port: ${IPC_PORT}`);

try {
  listenForMessages(IPC_PORT, (payload) => {
    const { type, text, senderRole, dataDir } = payload;
    log(`Received IPC Message: ${type}`);

    if (type === "lock") {
      log(`[Helper] Received lock command. Executing LockWorkStation in Session 1...`);
      exec("rundll32.exe user32.dll,LockWorkStation", (error, stdout, stderr) => {
        if (error) {
          log(`[Helper] ERROR executing lock: ${error.message}`);
          if (stderr) log(`[Helper] Stderr: ${stderr.trim()}`);
        } else {
          log(`[Helper] Workstation locked successfully.`);
        }
      });
      return;
    }

    if (type === "broadcast") {
      log(`[Helper] Received broadcast: "${text.substring(0, 30)}..." from role: ${senderRole}`);

      const role = senderRole || "Administrator";
      const formattedRole = role.charAt(0).toUpperCase() + role.slice(1);

      const scriptPath = path.join(exeDir, "broadcast-dialog.ps1");
      const possibleAssetPaths = [
        path.join(exeDir, "assets", "broadcast-dialog.ps1"),
        path.join(exeDir, "src", "assets", "broadcast-dialog.ps1"),
        path.join(process.cwd(), "assets", "broadcast-dialog.ps1"),
        path.join(process.cwd(), "src", "assets", "broadcast-dialog.ps1"),
        path.join(exeDir, "broadcast-dialog.ps1"),
      ];

      let srcAssetPath = null;
      for (const p of possibleAssetPaths) {
        if (fs.existsSync(p) && path.resolve(p) !== path.resolve(scriptPath)) {
          srcAssetPath = p;
          break;
        }
      }
      if (!srcAssetPath && fs.existsSync(scriptPath)) {
        srcAssetPath = scriptPath;
      }

      log(`[Helper] Target scriptPath: ${scriptPath}`);
      log(`[Helper] Resolved source assetPath: ${srcAssetPath} (Exists: ${Boolean(srcAssetPath && fs.existsSync(srcAssetPath))})`);

      try {
        fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
        fs.writeFileSync(scriptPath, DEFAULT_BROADCAST_SCRIPT, "utf8");
        log(`[Helper] SUCCESS: Synchronized broadcast-dialog.ps1 from embedded DEFAULT_BROADCAST_SCRIPT.`);
      } catch (err) {
        log(`[Helper] ERROR: Failed to write broadcast script: ${err.message}`);
      }

      const psScript = `
        $env:SENTRIX_BROADCAST_ROLE = '${formattedRole.replace(/'/g, "''")}'
        $env:SENTRIX_BROADCAST_MSG = @'
${text}
'@
        & '${scriptPath}'
      `.trim();
      const encodedCmd = Buffer.from(psScript, "utf16le").toString("base64");
      const command = `powershell -NoProfile -Sta -ExecutionPolicy Bypass -EncodedCommand ${encodedCmd}`;

      log(`[Helper] Executing broadcast WPF Acknowledge modal command...`);
      exec(command, (error, stdout, stderr) => {
        if (error) {
          log(`[Helper] ERROR executing broadcast modal: ${error.message}`);
          if (stderr) log(`[Helper] Stderr: ${stderr.trim()}`);
        } else {
          log(`[Helper] Broadcast modal command completed. Output: ${stdout.trim() || "none"}`);
        }
      });
    }
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
  log(`CRITICAL: Server failed to start: ${err.message}`);
}
