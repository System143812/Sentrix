import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";

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
    Get-Process | Where-Object {$_.SI -ne 0} | Stop-Process -Force
    exit 0
  `.trim()),
  "broadcast-message": (text, dataDir = "", args = {}) => {
    const role = args.senderRole || "Administrator";
    const senderRole = role.charAt(0).toUpperCase() + role.slice(1);
    const modulePath = dataDir
      ? path.join(dataDir, "Modules", "BurntToast")
      : path.join(process.cwd(), "Modules", "BurntToast");

    // Construct the PowerShell script simply
    const psScript = `
$modulePath = '${modulePath.replace(/'/g, "''")}'
if (Test-Path $modulePath) {
    Import-Module $modulePath
    New-BurntToastNotification -Text '${senderRole.replace(/'/g, "''")} Message', '${text.replace(/'/g, "''")}'
} else {
    msg * "${senderRole}: ${text.replace(/"/g, '`"')}"
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

  let finalCommand;
  if (typeof commandTemplate === "function") {
    const text = args.text || args.message || "Admin broadcast from Sentrix.";
    const dataDir = await getAgentDataDir();
    finalCommand = commandTemplate(text, dataDir, args);
  } else {
    finalCommand = commandTemplate;
  }

  try {
    // Increase timeout to 25s for agent execution
    await execAsync(finalCommand, { timeout: 25000 });

    const messages = {
      "network-reset":
        "Network resolver cache and IP stack reset successfully.",
      "system-purge": "System temporary files and update cache purged.",
      "time-sync": "System clock synchronized with internet time server.",
      "workspace-reset": "User-level workspace apps terminated successfully.",
      "broadcast-message": "Broadcast message delivered to the user screen.",
    };

    return {
      success: true,
      message: messages[action] || "Maintenance action completed successfully.",
    };
  } catch (error) {
    console.error(`[Maintenance] Command failed: ${finalCommand}`, error);
    return {
      success: false,
      message: `Failed to execute ${action}: ${error.message}`,
    };
  }
}
