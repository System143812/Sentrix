import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";
import { sendMessage } from "./ipc.js";
import { getActiveSessionManager } from "../services/session-manager.js";

const execAsync = promisify(exec);

/**
 * Robustly determines the agent's data directory.
 * Caches the result to avoid repeated FS hits.
 */
let cachedDataDir = null;

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

    $targetPaths = New-Object System.Collections.Generic.HashSet[string]
    if ($env:TEMP) { $targetPaths.Add($env:TEMP) | Out-Null }
    if ($env:TMP) { $targetPaths.Add($env:TMP) | Out-Null }
    if (Test-Path 'C:\\Windows\\Temp') { $targetPaths.Add('C:\\Windows\\Temp') | Out-Null }

    $userProfiles = Get-ChildItem -Path 'C:\\Users' -Directory -ErrorAction SilentlyContinue
    foreach ($profile in $userProfiles) {
        $userTemp = Join-Path $profile.FullName 'AppData\\Local\\Temp'
        if (Test-Path $userTemp) { $targetPaths.Add($userTemp) | Out-Null }
    }

    foreach ($p in $targetPaths) {
        if ($p -and (Test-Path $p)) {
            Get-ChildItem -Path $p -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
                try {
                    Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
                } catch {}
            }
        }
    }

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

    # Comprehensive safety exclusion list protecting Windows shell, DWM, input, audio, and graphics infrastructure
    $exclude = @(
        'sentrix-helper', 'sentrix-agent', 'explorer', 'dwm', 'sihost', 'taskhostw',
        'ctfmon', 'fontdrvhost', 'shlexperiencehost', 'startmenuexperiencehost',
        'searchhost', 'applicationframehost', 'lockapp', 'TextInputHost',
        'ShellExperienceHost', 'WindowsInternal.ComposableShell.Experiences.TextInput.InputApp',
        'audiodg', 'conhost', 'dllhost', 'runtimebroker', 'searchindexer', 'svchost',
        'dwm.exe', 'WUDFHost', 'userinit', 'winlogon'
    )

    # Target standard user applications and UWP Settings with visible windows in active user sessions
    $procs = Get-Process | Where-Object {
        $_.SI -ne 0 -and
        $_.MainWindowTitle -ne '' -and
        $exclude -notcontains $_.ProcessName.ToLower()
    }

    foreach ($p in $procs) {
        try {
            $p.CloseMainWindow() | Out-Null
        } catch {}
    }

    Get-Process -Name 'SystemSettings', 'ApplicationFrameHost' -ErrorAction SilentlyContinue | Where-Object {
        $_.SI -ne 0 -and
        $exclude -notcontains $_.ProcessName.ToLower()
    } | ForEach-Object {
        try {
            $_.CloseMainWindow() | Out-Null
        } catch {}
    }

    Start-Sleep -Seconds 3

    # Force close any remaining user app windows or settings apps gracefully
    Get-Process | Where-Object {
        $_.SI -ne 0 -and
        ($_.MainWindowTitle -ne '' -or $_.ProcessName.ToLower() -in @('systemsettings', 'applicationframehost')) -and
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
  "broadcast-message": (text, dataDir = "C:\\ProgramData\\SentrixAgent", args = {}) => {
    const role = args.senderRole || "Administrator";
    const senderRole = role
      .toString()
      .replace(/[_-]/g, " ")
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");

    const escapedMsg = (text || "").replace(/'/g, "''");
    const escapedRole = senderRole.replace(/'/g, "''");
    const escapedDataDir = (dataDir || "C:\\ProgramData\\SentrixAgent").replace(/'/g, "''");

    const psCommand = [
      "$ErrorActionPreference = 'Stop'",
      `$rawRole = '${escapedRole}'`,
      `$rawMsg = '${escapedMsg}'`,
      `$baseDir = '${escapedDataDir}'`,
      "try {",
      "    $role = $rawRole",
      "    $msg = $rawMsg",
      "    $modulePath = Join-Path $baseDir 'Modules\\BurntToast\\BurntToast.psd1'",
      "    if (-not (Test-Path $modulePath)) {",
      "        $modulePath = Join-Path $baseDir 'assets\\Modules\\BurntToast\\BurntToast.psd1'",
      "    }",
      "    if (Test-Path $modulePath) {",
      "        Import-Module $modulePath -Force | Out-Null",
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
      "    $params = @{ Text = @(\"Message from $role\", $msg) }",
      "    if (Test-Path $logoPath) { $params['AppLogo'] = $logoPath }",
      "    New-BurntToastNotification @params | Out-Null",
      "    Write-Host 'SUCCESS: BurntToast notification displayed.'",
      "} catch {",
      "    Write-Host ('ERROR: ' + $_.Exception.Message)",
      "    exit 1",
      "}"
    ].join("; ");

    return `powershell -NoProfile -Sta -ExecutionPolicy Bypass -EncodedCommand ${Buffer.from(psCommand, "utf16le").toString("base64")}`;
  },
};

export async function runMaintenanceAction(action, args = {}) {
  const commandTemplate = MAINTENANCE_COMMANDS[action];

  if (!commandTemplate) {
    return { success: false, message: `Unknown maintenance action: ${action}` };
  }

  const dataDir = await getAgentDataDir();
  const text = args.text || args.message || "Admin broadcast from Sentrix.";

  if (action === "broadcast-message") {
    console.log(`[Broadcast] Attempting delivery for: "${text.substring(0, 20)}..."`);
    const sm = getActiveSessionManager();
    const endpoints = sm ? sm.getActiveHelperEndpoints() : [];

    if (endpoints.length > 0) {
      const results = await Promise.allSettled(
        endpoints.map(ep => sendMessage(ep.port, {
          type: "broadcast",
          text,
          senderRole: args.senderRole,
          dataDir,
        }))
      );

      const successCount = results.filter(r => r.status === "fulfilled" && r.value && r.value.success).length;
      if (successCount > 0) {
        console.log(`[Broadcast] SUCCESS: Delivered to ${successCount} active helper session(s).`);
        return {
          success: true,
          message: `Broadcast message delivered to ${successCount} helper process(es).`,
        };
      }
    }
    console.warn(`[Broadcast] No active session helpers responding. Skipping Session 0 fallback to prevent E_ACCESSDENIED.`);
    return {
      success: false,
      message: "Broadcast message delivery failed: no active user-session helper processes responding.",
    };
  }

  if (action === "workspace-reset") {
    console.log(`[Maintenance] Attempting workspace-reset via active user-session helper(s)...`);
    const sm = getActiveSessionManager();
    const endpoints = sm ? sm.getActiveHelperEndpoints() : [];

    if (endpoints.length > 0) {
      const results = await Promise.allSettled(
        endpoints.map(ep => sendMessage(ep.port, { type: "workspace-reset" }))
      );

      const successCount = results.filter(r => r.status === "fulfilled" && r.value && r.value.success).length;
      if (successCount > 0) {
        console.log(`[Maintenance] SUCCESS: Workspace reset executed in ${successCount} user session helper(s).`);
        return {
          success: true,
          message: `User-level workspace apps terminated successfully in ${successCount} user session(s).`,
        };
      }
    }
    console.warn(`[Maintenance] No active session helpers responding. Falling back to direct Session 0 execution.`);
  }

  let finalCommand;
  if (typeof commandTemplate === "function") {
    finalCommand = commandTemplate(text, dataDir, args);
  } else {
    finalCommand = commandTemplate;
  }

  try {
    const startTime = Date.now();
    console.log(`[Maintenance] Executing command [${action}] targeting active user sessions (SI != 0)...`);
    const { stdout, stderr } = await execAsync(finalCommand, { timeout: 120000 });
    const duration = Date.now() - startTime;

    console.log(`[Maintenance] Command [${action}] executed successfully in ${duration}ms.`);
    if (stdout && stdout.trim()) {
      console.log(`[Maintenance] [${action}] Stdout: ${stdout.trim()}`);
    }
    if (stderr && stderr.trim()) {
      console.warn(`[Maintenance] [${action}] Stderr: ${stderr.trim()}`);
    }

    const messages = {
      "network-reset": "Network resolver cache and IP stack reset successfully.",
      "system-purge": "System temporary files and update cache purged.",
      "time-sync": "System clock synchronized with internet time server.",
      "workspace-reset": "User-level workspace apps terminated successfully.",
      "broadcast-message": "Broadcast message delivered to the user screen (Session 0 fallback).",
    };

    return {
      success: true,
      message: messages[action] || "Maintenance action completed successfully.",
    };
  } catch (error) {
    console.error(`[Maintenance] CRITICAL FAILURE executing [${action}]:`, {
      message: error.message,
      code: error.code,
      stdout: error.stdout,
      stderr: error.stderr,
    });
    return {
      success: false,
      message: `Failed to execute ${action}: ${error.message}`,
    };
  }
}
