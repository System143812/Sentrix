import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const execAsync = promisify(exec);

const exeDir = (() => {
  if (process.pkg) return path.dirname(process.execPath);
  try {
    const filename = fileURLToPath(import.meta.url);
    return path.resolve(path.dirname(filename), "../../");
  } catch {
    return typeof __dirname !== 'undefined'
      ? path.resolve(__dirname, "../../")
      : process.cwd();
  }
})();

function toEncodedCommand(script) {
  return "powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand " + Buffer.from(script, "utf16le").toString("base64");
}

export async function registerAgentTasks(serverUrl) {
  console.log("[Installer] Registering Sentrix Agent Windows Service...");

  const hostExe = "AgentServiceHost.exe";
  const hostPath = path.join(exeDir, hostExe);

  if (!fs.existsSync(hostPath)) {
    const errorMsg = `[Installer] FATAL: Required host executable not found at ${hostPath}.`;
    console.error(errorMsg);
    return { success: false, error: errorMsg };
  }

  const setupScript = [
    "$ErrorActionPreference = 'Stop'",
    `$dir = '${exeDir.replace(/'/g, "''")}'`,
    `$url = '${serverUrl.replace(/'/g, "''")}'`,
    `$hostPath = Join-Path $dir '${hostExe}'`,
    'Unregister-ScheduledTask -TaskName "Sentrix Agent" -Confirm:$false -ErrorAction SilentlyContinue',
    'Unregister-ScheduledTask -TaskName "Sentrix Helper" -Confirm:$false -ErrorAction SilentlyContinue',
    'if (Get-ScheduledTask -TaskName "Sentrix Agent" -ErrorAction SilentlyContinue) { throw "Failed to remove legacy scheduled task: Sentrix Agent" }',
    'if (Get-ScheduledTask -TaskName "Sentrix Helper" -ErrorAction SilentlyContinue) { throw "Failed to remove legacy scheduled task: Sentrix Helper" }',
    '$serviceName = "SentrixAgent"',
    '$existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue',
    'if ($existingService) {',
    "    if ($existingService.Status -eq 'Running') {",
    '        Stop-Service -Name $serviceName -Force',
    '        $sw = [Diagnostics.Stopwatch]::StartNew()',
    '        while (($sw.ElapsedMilliseconds -lt 10000) -and ((Get-Service -Name $serviceName -ErrorAction SilentlyContinue).Status -eq \'Running\')) { Start-Sleep -Milliseconds 500 }',
    '    }',
    '    $stoppedService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue',
    '    if ($stoppedService -and $stoppedService.Status -ne \'Stopped\') {',
    '        throw "Existing service $serviceName did not stop within 10 seconds. Current status: $($stoppedService.Status)"',
    '    }',
    '    & sc.exe delete $serviceName | Out-Null',
    '    if ($LASTEXITCODE -ne 0) { throw "sc.exe delete failed with exit code $LASTEXITCODE" }',
    '    $sw = [Diagnostics.Stopwatch]::StartNew()',
    '    while ($sw.ElapsedMilliseconds -lt 15000) {',
    '        $check = Get-Service -Name $serviceName -ErrorAction SilentlyContinue',
    '        if (-not $check) { break }',
    '        Start-Sleep -Milliseconds 500',
    '    }',
    '    $checkFinal = Get-Service -Name $serviceName -ErrorAction SilentlyContinue',
    '    if ($checkFinal) { throw "Service $serviceName is still marked for deletion after timeout." }',
    '}',
    '$binPath = "`"$hostPath`""',
    '& sc.exe create $serviceName binPath= $binPath start= auto obj= "NT AUTHORITY\\SYSTEM" | Out-Null',
    'if ($LASTEXITCODE -ne 0) { throw "sc.exe create failed with exit code $LASTEXITCODE" }',
    '& sc.exe config $serviceName displayName= "Sentrix Agent Service" | Out-Null',
    'if ($LASTEXITCODE -ne 0) { throw "sc.exe config failed with exit code $LASTEXITCODE" }',
    '& sc.exe failure $serviceName reset= 86400 actions= restart/60000/restart/60000/restart/60000 | Out-Null',
    'if ($LASTEXITCODE -ne 0) { throw "sc.exe failure failed with exit code $LASTEXITCODE" }',
    'Start-Service -Name $serviceName',
    '$sw = [Diagnostics.Stopwatch]::StartNew()',
    '$started = $false',
    'while ($sw.ElapsedMilliseconds -lt 15000) {',
    '    $svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue',
    '    if ($svc -and $svc.Status -eq \'Running\') { $started = $true; break }',
    '    Start-Sleep -Milliseconds 500',
    '}',
    'if (-not $started) { throw "Service $serviceName failed to reach Running state within timeout." }',
    'Write-Host "[Installer] Sentrix Agent Windows Service successfully registered and running."'
  ].join("\r\n");

  try {
    const { stdout, stderr } = await execAsync(toEncodedCommand(setupScript), {
      maxBuffer: 1024 * 1024,
    });
    console.log("[Installer] Windows Service registration complete.");
    return { success: true, stdout, stderr };
  } catch (error) {
    const details = [error.message, error.stderr?.trim()].filter(Boolean).join("\n");
    console.error("[Installer] Windows Service registration failed:", details);
    return { success: false, error: details };
  }
}

export async function performLockdown() {
  console.log("[Installer] Performing security lockdown...");

  const lockdownScript = [
    'Disable-LocalUser -Name "Administrator" -ErrorAction SilentlyContinue',
    'Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" -Name "LocalAccountTokenFilterPolicy" -Value 0 -ErrorAction SilentlyContinue',
    '$rules = @("WINRM-HTTP-In-TCP", "WINRM-HTTP-In-TCP-PUBLIC", "FPS-SMB-In-TCP", "WMI-In-TCP")',
    'foreach ($rule in $rules) { Disable-NetFirewallRule -Name $rule -ErrorAction SilentlyContinue }',
    'Disable-NetFirewallRule -DisplayGroup "Remote Administration" -ErrorAction SilentlyContinue',
    'Disable-NetFirewallRule -DisplayGroup "Windows Remote Management" -ErrorAction SilentlyContinue',
    'Disable-NetFirewallRule -DisplayGroup "Windows Management Instrumentation (WMI)" -ErrorAction SilentlyContinue',
    "$path = 'C:\\ProgramData\\SentrixAgent'",
    'if (Test-Path $path) {',
    '    $acl = Get-Acl $path',
    '    $acl.SetAccessRuleProtection($true, $false)',
    '    Set-Acl $path $acl',
    '    & icacls.exe $path /grant "SYSTEM:(OI)(CI)F" /inheritance:e | Out-Null',
    '    & icacls.exe $path /grant "Administrators:(OI)(CI)F" /inheritance:e | Out-Null',
    '    & icacls.exe $path /grant "BUILTIN\\Users:(OI)(CI)(RX)" | Out-Null',
    '}'
  ].join("\r\n");

  try {
    const { stdout, stderr } = await execAsync(toEncodedCommand(lockdownScript));
    console.log("[Installer] Lockdown complete.");
    return { success: true, stdout };
  } catch (error) {
    console.error("[Installer] Lockdown failed:", error.message);
    return { success: false, error: error.message };
  }
}
