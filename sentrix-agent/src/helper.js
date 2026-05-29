import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { listenForMessages } from "./utils/ipc.js";

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

    if (type === "broadcast") {
      log(`[Helper] Received broadcast: "${text.substring(0, 30)}..." from role: ${senderRole}`);

      const role = senderRole || "Administrator";
      const modulePath = dataDir
        ? path.join(dataDir, "Modules", "BurntToast")
        : path.join(process.cwd(), "Modules", "BurntToast");

      const psScript = `
$modulePath = '${modulePath.replace(/'/g, "''")}'
if (Test-Path $modulePath) {
    Import-Module $modulePath
    New-BurntToastNotification -Text '${role.replace(/'/g, "''")} Message', '${text.replace(/'/g, "''")}'
    Write-Host "SUCCESS: BurntToast notification sent."
} else {
    # Fallback to msg command if BurntToast is missing
    Write-Host "WARN: BurntToast missing at $modulePath. Falling back to msg command."
    msg * /TIME:30 "${role}: ${text.replace(/"/g, '`"')}"
}
`.trim();

      const encodedCommand = Buffer.from(psScript, "utf16le").toString("base64");
      const command = `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encodedCommand}`;

      log(`[Helper] Executing broadcast command...`);
      exec(command, (error, stdout, stderr) => {
        if (error) {
          log(`[Helper] ERROR executing broadcast: ${error.message}`);
          if (stderr) log(`[Helper] Stderr: ${stderr.trim()}`);
        } else {
          log(`[Helper] Broadcast command completed. Output: ${stdout.trim() || "none"}`);
        }
      });
    }
  });
} catch (err) {
  log(`CRITICAL: Server failed to start: ${err.message}`);
}
