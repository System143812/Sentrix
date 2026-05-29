param(
  [string]$ServerUrl = "http://localhost:4000",
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

# Principal for Helper (Runs in interactive user session)
$helperTaskName = "Sentrix Helper"

# WRAPPER: Use hidden powershell to start the helper for zero-flash stealth
$helperArgsFinal = "-NoProfile -WindowStyle Hidden -Command `"Start-Process -FilePath '$helperCommand' -ArgumentList '$helperArgs' -WorkingDirectory '$InstallDir' -WindowStyle Hidden`""
$helperAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $helperArgsFinal

$helperTrigger = New-ScheduledTaskTrigger -AtLogOn
$helperPrincipal = New-ScheduledTaskPrincipal -GroupId "Users" -RunLevel Highest
$helperSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Days 0)
# Use the hidden setting
$helperSettings.Hidden = $true

Register-ScheduledTask `
  -TaskName $helperTaskName `
  -Action $helperAction `
  -Trigger $helperTrigger `
  -Principal $helperPrincipal `
  -Settings $helperSettings `
  -Force | Out-Null

Start-ScheduledTask -TaskName $taskName
Start-ScheduledTask -TaskName $helperTaskName
Write-Host "Sentrix lightweight agent and helper installed and started. Server: $ServerUrl"
