# Sentrix Home Edition Manual Installer
# Run this as Administrator on the laptop if the Dashboard "Deploy" fails.
# This script is .env reliant: it registers the tasks and assumes your config is in .env.

$ErrorActionPreference = "Stop"

# --- CONFIGURATION ---
$TargetDir = "C:\ProgramData\SentrixAgent"

Write-Host "--- Sentrix Home Installer (.env Reliant) Starting ---" -ForegroundColor Cyan

# 1. Check for Admin Privileges
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
if (-not $isAdmin) {
    Write-Host "ERROR: Please run this script as Administrator!" -ForegroundColor Red
    exit
}

# 2. Check for Files & .env
if (-not (Test-Path "$TargetDir\sentrix-agent.exe")) {
    Write-Host "ERROR: Agent files not found in $TargetDir." -ForegroundColor Red
    Write-Host "Please ensure you have run 'Deploy' from the dashboard first to copy the files."
    exit
}

if (-not (Test-Path "$TargetDir\.env")) {
    Write-Host "WARNING: .env file not found in $TargetDir." -ForegroundColor Yellow
    Write-Host "The agent will default to 'localhost' until you create a .env file with SENTRIX_SERVER_URL."
}

# 3. Add Defender Exclusion
Write-Host "[1/3] Adding Antivirus Exclusions..." -NoNewline
try {
    Add-MpPreference -ExclusionPath $TargetDir -ErrorAction SilentlyContinue
    Write-Host " [OK]" -ForegroundColor Green
} catch {
    Write-Host " [SKIPPED]" -ForegroundColor Yellow
}

# 4. Register Main Agent Task (Runs as SYSTEM)
# Note: No --server-url argument is passed, forcing the agent to use the .env file.
Write-Host "[2/3] Registering Sentrix Agent (SYSTEM task)..." -NoNewline
try {
    $action = New-ScheduledTaskAction -Execute "$TargetDir\sentrix-agent.exe" -WorkingDirectory $TargetDir
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    
    Unregister-ScheduledTask -TaskName "Sentrix Agent" -Confirm:$false -ErrorAction SilentlyContinue
    Register-ScheduledTask -TaskName "Sentrix Agent" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force
    Start-ScheduledTask -TaskName "Sentrix Agent"
    Write-Host " [OK]" -ForegroundColor Green
} catch {
    Write-Host " [ERROR: $($_.Exception.Message)]" -ForegroundColor Red
}

# 5. Register Helper Task (Runs on Login)
if (Test-Path "$TargetDir\sentrix-helper.exe") {
    Write-Host "[3/3] Registering Sentrix Helper (Login task)..." -NoNewline
    try {
        $hAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -Command `"$TargetDir\sentrix-helper.exe`"" -WorkingDirectory $TargetDir
        $hTrigger = New-ScheduledTaskTrigger -AtLogOn
        $hPrincipal = New-ScheduledTaskPrincipal -GroupId "Users" -RunLevel Highest
        $hSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Days 0)
        
        Unregister-ScheduledTask -TaskName "Sentrix Helper" -Confirm:$false -ErrorAction SilentlyContinue
        Register-ScheduledTask -TaskName "Sentrix Helper" -Action $hAction -Trigger $hTrigger -Principal $hPrincipal -Settings $hSettings -Force
        Start-ScheduledTask -TaskName "Sentrix Helper" -ErrorAction SilentlyContinue
        Write-Host " [OK]" -ForegroundColor Green
    } catch {
        Write-Host " [FAILED]" -ForegroundColor Yellow
    }
}

Write-Host "`n--- Installation Complete! ---" -ForegroundColor Cyan
Write-Host "The tasks are registered. The agent will now follow whatever is in your .env file."
Write-Host "If you change the IP in .env, just restart the 'Sentrix Agent' task in Task Scheduler."
