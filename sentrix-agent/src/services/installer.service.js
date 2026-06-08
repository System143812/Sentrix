import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const execAsync = promisify(exec);

// Robust way to get the directory where the EXE is located (Works in CJS and pkg)
const exeDir = (() => {
  if (process.pkg) return path.dirname(process.execPath);
  
  // Fallback for development/Node
  try {
    const filename = fileURLToPath(import.meta.url);
    return path.resolve(path.dirname(filename), "../../");
  } catch {
    // If import.meta is not available (bundled CJS), use __dirname
    return typeof __dirname !== 'undefined' 
      ? path.resolve(__dirname, "../../") 
      : process.cwd();
  }
})();

/**
 * Helper to wrap a PowerShell script in an encoded command for safe execution.
 */
function toEncodedCommand(script) {
  return `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${Buffer.from(script, "utf16le").toString("base64")}`;
}

/**
 * Registers the Sentrix Agent and Helper as scheduled tasks.
 */
export async function registerAgentTasks(serverUrl) {
  console.log("[Installer] Registering scheduled tasks...");
  
  const agentExe = path.join(exeDir, "sentrix-agent.exe");
  const helperExe = path.join(exeDir, "sentrix-helper.exe");
  
  const setupScript = `
    $dir = '${exeDir.replace(/'/g, "''")}'
    $url = '${serverUrl.replace(/'/g, "''")}'
    
    # 1. Main Agent Registration (SYSTEM)
    $action = New-ScheduledTaskAction -Execute "$dir\\sentrix-agent.exe" -Argument "--server-url $url" -WorkingDirectory $dir
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    
    Unregister-ScheduledTask -TaskName "Sentrix Agent" -Confirm:$false -ErrorAction SilentlyContinue
    Register-ScheduledTask -TaskName "Sentrix Agent" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force
    Start-ScheduledTask -TaskName "Sentrix Agent" -ErrorAction SilentlyContinue

    # 2. Helper Registration (User Session)
    if (Test-Path "$dir\\sentrix-helper.exe") {
        $hAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -Command \`"Start-Process -FilePath '$dir\\sentrix-helper.exe' -WorkingDirectory '$dir' -WindowStyle Hidden\`""
        $hTrigger = New-ScheduledTaskTrigger -AtLogOn
        $hPrincipal = New-ScheduledTaskPrincipal -GroupId "Users" -RunLevel Highest
        $hSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Days 0)
        
        Unregister-ScheduledTask -TaskName "Sentrix Helper" -Confirm:$false -ErrorAction SilentlyContinue
        Register-ScheduledTask -TaskName "Sentrix Helper" -Action $hAction -Trigger $hTrigger -Principal $hPrincipal -Settings $hSettings -Force
        Start-ScheduledTask -TaskName "Sentrix Helper" -ErrorAction SilentlyContinue
    }
  `;

  try {
    const { stdout, stderr } = await execAsync(toEncodedCommand(setupScript));
    console.log("[Installer] Task registration complete.");
    return { success: true, stdout };
  } catch (error) {
    console.error("[Installer] Task registration failed:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Performs security lockdown on the machine.
 */
export async function performLockdown() {
  console.log("[Installer] Performing security lockdown...");
  
  const lockdownScript = `
    # 1. Disable built-in Administrator
    Disable-LocalUser -Name "Administrator" -ErrorAction SilentlyContinue

    # 2. Re-enable Remote UAC Filter
    Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" -Name "LocalAccountTokenFilterPolicy" -Value 0 -ErrorAction SilentlyContinue

    # 3. Close Setup Firewall Rules
    $rules = @("WINRM-HTTP-In-TCP", "WINRM-HTTP-In-TCP-PUBLIC", "FPS-SMB-In-TCP", "WMI-In-TCP")
    foreach ($rule in $rules) {
        Disable-NetFirewallRule -Name $rule -ErrorAction SilentlyContinue
    }
    
    # Also broader groups
    Disable-NetFirewallRule -DisplayGroup "Remote Administration" -ErrorAction SilentlyContinue
    Disable-NetFirewallRule -DisplayGroup "Windows Remote Management" -ErrorAction SilentlyContinue
    Disable-NetFirewallRule -DisplayGroup "Windows Management Instrumentation (WMI)" -ErrorAction SilentlyContinue
  `;

  try {
    const { stdout, stderr } = await execAsync(toEncodedCommand(lockdownScript));
    console.log("[Installer] Lockdown complete.");
    return { success: true, stdout };
  } catch (error) {
    console.error("[Installer] Lockdown failed:", error.message);
    return { success: false, error: error.message };
  }
}
