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

$exclude = @("node_modules", ".git", "dist")
Get-ChildItem -Path $sourceDir -Force | Where-Object {
  $exclude -notcontains $_.Name
} | Copy-Item -Destination $InstallDir -Recurse -Force

Push-Location $InstallDir
try {
  if (-not (Test-Path "node_modules")) {
    npm.cmd ci --omit=dev
  }

  @"
SENTRIX_SERVER_URL=$ServerUrl
SENTRIX_AGENT_DATA_DIR=$InstallDir
METRICS_INTERVAL_MS=5000
HEARTBEAT_INTERVAL_MS=10000
DETAILS_INTERVAL_MS=60000
"@ | Set-Content -Path ".env" -Encoding ASCII
} finally {
  Pop-Location
}

$action = New-ScheduledTaskAction `
  -Execute $node.Source `
  -Argument "`"$InstallDir\src\headless.js`"" `
  -WorkingDirectory $InstallDir
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

Start-ScheduledTask -TaskName $taskName
Write-Host "Sentrix lightweight agent installed and started. Server: $ServerUrl"
