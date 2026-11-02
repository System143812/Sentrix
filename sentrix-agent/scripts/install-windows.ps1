param(
  [string]$ServerUrl = "https://localhost:4000",
  [string]$InstallDir = "$env:ProgramData\SentrixAgent"
)

$ErrorActionPreference = "Stop"

$sourceDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$taskName = "Sentrix Agent"
$node = Get-Command node.exe -ErrorAction SilentlyContinue

if (-not $node) {
  throw "Node.js is required to run the lightweight Sentrix agent. Install Node.js first, then rerun this installer."
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

# Secure Installation Directory ACLs
try {
  $acl = Get-Acl $InstallDir
  $acl.SetAccessRuleProtection($true, $false)
  Set-Acl $InstallDir $acl
  & icacls.exe $InstallDir /grant "SYSTEM:(OI)(CI)F" /inheritance:e | Out-Null
  & icacls.exe $InstallDir /grant "Administrators:(OI)(CI)F" /inheritance:e | Out-Null
  & icacls.exe $InstallDir /grant "BUILTIN\Users:(OI)(CI)(RX)" | Out-Null
} catch {}

# Define binary paths
$agentExe = Join-Path $sourceDir "dist\sentrix-agent.exe"
$helperExe = Join-Path $sourceDir "dist\sentrix-helper.exe"
$isExeInstall = (Test-Path $agentExe) -and (Test-Path $helperExe)

if ($isExeInstall) {
  Write-Host "--- Performing EXE Installation ---"
  Copy-Item $agentExe -Destination $InstallDir -Force
  Copy-Item $helperExe -Destination $InstallDir -Force
  
  $agentCommand = "`"$InstallDir\sentrix-agent.exe`""
  $agentArgs = ""
  
  $helperCommand = "`"$InstallDir\sentrix-helper.exe`""
  $helperArgs = ""
} else {
  Write-Host "--- Performing Node.js/JS Installation ---"
  $exclude = @("node_modules", ".git", "dist")
  Get-ChildItem -Path $sourceDir -Force | Where-Object {
    $exclude -notcontains $_.Name
  } | Copy-Item -Destination $InstallDir -Recurse -Force

  Push-Location $InstallDir
  try {
    if (-not (Test-Path "node_modules")) {
      npm.cmd ci --omit=dev
    }
  } finally {
    Pop-Location
  }

  $agentCommand = $node.Source
  $agentArgs = "`"$InstallDir\src\headless.js`""

  $helperCommand = $node.Source
  $helperArgs = "`"$InstallDir\src\helper.js`""
}

# Principal for SYSTEM agent
$action = New-ScheduledTaskAction -Execute $agentCommand -Argument $agentArgs -WorkingDirectory $InstallDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Force | Out-Null

# Principal for Helper (Runs in interactive user session via Launcher & schtasks)
$helperTaskName = "Sentrix Helper"
$launcherPath = Join-Path $InstallDir "launch-helper.ps1"
$launcherContent = @"
Start-Process -FilePath "$helperPath" -WorkingDirectory "$InstallDir" -WindowStyle Hidden
"@
$launcherContent | Out-File -FilePath $launcherPath -Encoding utf8 -Force

Unregister-ScheduledTask -TaskName $helperTaskName -Confirm:$false -ErrorAction SilentlyContinue
schtasks /Create /TN "$helperTaskName" /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcherPath`"" /SC ONLOGON /RU "NT AUTHORITY\INTERACTIVE" /RL HIGHEST /F | Out-Null
schtasks /Run /TN "$helperTaskName" -ErrorAction SilentlyContinue | Out-Null

Start-ScheduledTask -TaskName $taskName
Write-Host "Sentrix lightweight agent and helper installed and started. Server: $ServerUrl"
