import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";
import { sendMessage } from "./ipc.js";
import { DEFAULT_BROADCAST_SCRIPT } from "./broadcast-template.js";

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

    # 1. Gather unique target Temp paths (System + All User Profiles)
    $targetPaths = New-Object System.Collections.Generic.HashSet[string]
    if ($env:TEMP) { $targetPaths.Add($env:TEMP) | Out-Null }
    if ($env:TMP) { $targetPaths.Add($env:TMP) | Out-Null }
    if (Test-Path 'C:\\Windows\\Temp') { $targetPaths.Add('C:\\Windows\\Temp') | Out-Null }

    $userProfiles = Get-ChildItem -Path 'C:\\Users' -Directory -ErrorAction SilentlyContinue
    foreach ($profile in $userProfiles) {
        $userTemp = Join-Path $profile.FullName 'AppData\\Local\\Temp'
        if (Test-Path $userTemp) { $targetPaths.Add($userTemp) | Out-Null }
    }

    # 2. Purge temp files and folders
    foreach ($p in $targetPaths) {
        if ($p -and (Test-Path $p)) {
            Get-ChildItem -Path $p -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
                try {
                    Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
                } catch {}
            }
        }
    }

    # 3. Clear Recycle Bin (PowerShell cmdlet + Shell.Application COM + direct traversal)
    try {
        Clear-RecycleBin -Force -ErrorAction SilentlyContinue
    } catch {}

    try {
        $shell = New-Object -ComObject Shell.Application
        $recycleBin = $shell.Namespace(10)
        foreach ($item in $recycleBin.Items()) {
            $item.InvokeVerb("delete")
        }
    } catch {}

    $recycleBins = Get-ChildItem -Path 'C:\\' -Filter '$Recycle.Bin' -Force -ErrorAction SilentlyContinue
    foreach ($rb in $recycleBins) {
        Get-ChildItem -Path $rb.FullName -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
            try {
                Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
            } catch {}
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
    $ErrorActionPreference = 'SilentlyContinue'
    $exclude = @('sentrix-helper', 'sentrix-agent', 'explorer', 'dwm', 'sihost', 'taskhostw', 'ctfmon', 'fontdrvhost', 'shlexperiencehost', 'startmenuexperiencehost', 'searchhost', 'applicationframehost', 'lockapp')
    $procs = Get-Process | Where-Object { $_.SI -ne 0 -and $exclude -notcontains $_.ProcessName.ToLower() }
    foreach ($p in $procs) {
        try {
            $p.CloseMainWindow() | Out-Null
        } catch {}
    }
    Start-Sleep -Seconds 2
    Get-Process | Where-Object {
        $_.SI -ne 0 -and
        $exclude -notcontains $_.ProcessName.ToLower()
    } | Stop-Process -Force -ErrorAction SilentlyContinue
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
    const senderRole = role
      .toString()
      .replace(/[_-]/g, " ")
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");

    const scriptPath = path.join(dataDir || process.cwd(), "broadcast-dialog.ps1");
    const possibleAssetPaths = [
      path.join(dataDir || "", "assets", "broadcast-dialog.ps1"),
      path.join(dataDir || "", "src", "assets", "broadcast-dialog.ps1"),
      path.join(process.cwd(), "assets", "broadcast-dialog.ps1"),
      path.join(process.cwd(), "src", "assets", "broadcast-dialog.ps1"),
      path.join(dataDir || "", "broadcast-dialog.ps1"),
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

    try {
      fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
      fs.writeFileSync(scriptPath, DEFAULT_BROADCAST_SCRIPT, "utf8");
    } catch (err) {}

    // Broadcast message using WPF dialog with Acknowledge button
    const psScript = `
      $env:SENTRIX_BROADCAST_ROLE = '${senderRole.replace(/'/g, "''")}'
      $env:SENTRIX_BROADCAST_MSG = @'
${text}
'@
      & '${scriptPath}'
    `.trim();
    const encodedCmd = Buffer.from(psScript, "utf16le").toString("base64");
    return `powershell -NoProfile -Sta -ExecutionPolicy Bypass -EncodedCommand ${encodedCmd}`;
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
    // Increase timeout to 120s for agent execution
    console.log(`[Maintenance] Executing command: ${finalCommand.substring(0, 50)}...`);
    const { stdout, stderr } = await execAsync(finalCommand, { timeout: 120000 });
    
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

