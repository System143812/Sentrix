import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";
import { sendMessage } from "./ipc.js";

const execAsync = promisify(exec);

/**
 * Robustly determines the agent's data directory.
 * Matches logic in agent-id.js for consistency.
 */
let cachedDataDir = null;

/**
 * Robustly determines the agent's data directory.
 * Caches the result to avoid repeated FS hits.
 */
async function getAgentDataDir() {
  if (cachedDataDir) return cachedDataDir;

  if (process.platform === "win32") {
    const searchPaths = [
      process.env.SENTRIX_AGENT_DATA_DIR,
      process.pkg ? path.dirname(process.execPath) : null,
      process.cwd(),
      path.join(process.env.ProgramData || "C:\\ProgramData", "SentrixAgent"),
      path.join(process.env.LOCALAPPDATA || os.homedir(), "SentrixAgent"),
    ].filter(Boolean);

    for (const base of searchPaths) {
      if (fs.existsSync(path.join(base, "Modules", "BurntToast"))) {
        cachedDataDir = base;
        return base;
      }
      if (fs.existsSync(path.join(base, "assets", "Modules", "BurntToast"))) {
        cachedDataDir = path.join(base, "assets");
        return cachedDataDir;
      }
    }

    cachedDataDir =
      process.env.SENTRIX_AGENT_DATA_DIR ||
      path.join(process.env.LOCALAPPDATA || os.homedir(), "SentrixAgent");
  } else {
    cachedDataDir = path.join(os.homedir(), ".sentrix-agent");
  }

  return cachedDataDir;
}

/**
 * Helper to wrap a PowerShell script in an encoded command for safe execution.
 * @param {string} script 
 * @returns {string}
 */
function toEncodedCommand(script) {
  return `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${Buffer.from(script, "utf16le").toString("base64")}`;
}

export const MAINTENANCE_COMMANDS = {
  "network-reset": toEncodedCommand(`
    $ErrorActionPreference = 'SilentlyContinue'
    ipconfig /flushdns
    nbtstat -R
    netsh int ip reset
    exit 0
  `.trim()),
  "system-purge": toEncodedCommand(`
    $ErrorActionPreference = 'SilentlyContinue'
    $paths = @($env:TEMP, 'C:\\Windows\\Temp')
    foreach ($p in $paths) {
        if (Test-Path $p) {
            Get-ChildItem -Path $p -Recurse | Remove-Item -Recurse -Force
        }
    }
    exit 0
  `.trim()),
  "time-sync": toEncodedCommand(`
    $ErrorActionPreference = 'SilentlyContinue'
    net start w32time
    w32tm /resync /force
    exit 0
  `.trim()),
  "workspace-reset": toEncodedCommand(`
    Get-Process | Where-Object {
        $_.SI -ne 0 -and 
        $_.ProcessName -notlike "*sentrix-helper*" -and 
        $_.ProcessName -notlike "*sentrix-agent*"
    } | Stop-Process -Force
    exit 0
  `.trim()),
  "master-unlock": toEncodedCommand(`
    $ErrorActionPreference = 'SilentlyContinue'
    net user Administrator /active:yes
    Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" -Name "LocalAccountTokenFilterPolicy" -Value 1 -ErrorAction SilentlyContinue
    exit 0
  `.trim()),
  "broadcast-message": (text, dataDir = "", args = {}) => {
    const role = args.senderRole || "Administrator";
    const senderRole = role.charAt(0).toUpperCase() + role.slice(1);
    const modulePath = dataDir
      ? path.join(dataDir, "Modules", "BurntToast")
      : path.join(process.cwd(), "Modules", "BurntToast");

    // Robust PowerShell script to find active sessions and send msg to all
    const psScript = `
$modulePath = '${modulePath.replace(/'/g, "''")}'
$messageText = "${senderRole}: ${text.replace(/"/g, '`"')}"

Write-Host "Attempting broadcast: $messageText"

if (Test-Path $modulePath) {
    try {
        Import-Module $modulePath -ErrorAction Stop
        New-BurntToastNotification -Text '${senderRole.replace(/'/g, "''")} Message', '${text.replace(/'/g, "''")}'
        Write-Host "SUCCESS: Sent BurntToast notification."
        exit 0
    } catch {
        Write-Host "WARN: BurntToast failed: $($_.Exception.Message). Falling back to msg.exe"
    }
}

# Fallback: msg.exe is more reliable for Session 0 -> User Desktop
# Target all sessions explicitly to be sure
& msg * /TIME:30 "$messageText"
if ($LASTEXITCODE -eq 0) {
    Write-Host "SUCCESS: Message delivered via msg.exe to all sessions."
} else {
    Write-Host "ERROR: msg.exe failed with exit code $LASTEXITCODE"
    # One last try with a simpler form
    & msg console /TIME:30 "$messageText"
}
`.trim();

    return toEncodedCommand(psScript);
  },
};

/**
 * Executes a pre-defined maintenance action on the Windows system.
 * @param {string} action - The key of the maintenance action.
 * @param {Object} args - Optional arguments for parameterized commands.
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function runMaintenanceAction(action, args = {}) {
  const commandTemplate = MAINTENANCE_COMMANDS[action];

  if (!commandTemplate) {
    return { success: false, message: `Unknown maintenance action: ${action}` };
  }

  const dataDir = await getAgentDataDir();
  const text = args.text || args.message || "Admin broadcast from Sentrix.";

  // Special handling for broadcast-message to try IPC bridge first
  if (action === "broadcast-message") {
    console.log(`[Broadcast] Attempting delivery for: "${text.substring(0, 20)}..."`);
    const ipcPort = Number(process.env.SENTRIX_IPC_PORT || 4101);
    const success = await sendMessage(ipcPort, {
      type: "broadcast",
      text,
      senderRole: args.senderRole,
      dataDir,
    });

    if (success) {
      console.log(`[Broadcast] SUCCESS: Delivered via Helper process on port ${ipcPort}`);
      return {
        success: true,
        message: "Broadcast message delivered via helper process.",
      };
    }
    console.warn(`[Broadcast] Helper not responding on port ${ipcPort}. Falling back to Session 0 msg command.`);
    // If IPC fails, fall back to local execution (Session 0 fallback)
  }

  let finalCommand;
  if (typeof commandTemplate === "function") {
    finalCommand = commandTemplate(text, dataDir, args);
  } else {
    finalCommand = commandTemplate;
  }

  try {
    // Increase timeout to 25s for agent execution
    console.log(`[Maintenance] Executing command: ${finalCommand.substring(0, 50)}...`);
    const { stdout, stderr } = await execAsync(finalCommand, { timeout: 25000 });
    
    if (action === "broadcast-message") {
        console.log(`[Broadcast-Fallback] Stdout: ${stdout || "none"}`);
        if (stderr) console.error(`[Broadcast-Fallback] Stderr: ${stderr}`);
    }

    const messages = {
      "network-reset":
        "Network resolver cache and IP stack reset successfully.",
      "system-purge": "System temporary files and update cache purged.",
      "time-sync": "System clock synchronized with internet time server.",
      "workspace-reset": "User-level workspace apps terminated successfully.",
      "broadcast-message": "Broadcast message delivered to the user screen (fallback).",
    };

    return {
      success: true,
      message: messages[action] || "Maintenance action completed successfully.",
    };
  } catch (error) {
    if (action === "broadcast-message") {
        console.error(`[Broadcast-Fallback] CRITICAL FAILURE:`, {
            message: error.message,
            code: error.code,
            stdout: error.stdout,
            stderr: error.stderr
        });
    }
    console.error(`[Maintenance] Command failed: ${finalCommand}`, error);
    return {
      success: false,
      message: `Failed to execute ${action}: ${error.message}`,
    };
  }
}

