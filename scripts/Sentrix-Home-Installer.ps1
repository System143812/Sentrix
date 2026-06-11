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

# 2. Check for Files & Setup .env / Identity
if (-not (Test-Path "$TargetDir\sentrix-agent.exe")) {
    Write-Host "ERROR: Agent files not found in $TargetDir." -ForegroundColor Red
    Write-Host "Please ensure you have copied the agent files to $TargetDir first."
    exit
}

$envPath = "$TargetDir\.env"
$agentId = [guid]::NewGuid().ToString()

if (-not (Test-Path $envPath)) {
    Write-Host "WARNING: .env file not found. Generating default with local identity..." -ForegroundColor Yellow
    "SENTRIX_SERVER_URL=https://localhost:4000`nSENTRIX_AGENT_ID=$agentId" | Out-File -FilePath $envPath -Encoding utf8 -Force
} else {
    $envContent = Get-Content $envPath
    $hasAgentId = $envContent | Select-String "SENTRIX_AGENT_ID"
    if (-not $hasAgentId) {
        Write-Host "Appending generated agent identity (SENTRIX_AGENT_ID) to .env..." -ForegroundColor Yellow
        Add-Content -Path $envPath -Value "`nSENTRIX_AGENT_ID=$agentId"
    }
}

# 3. Add Defender Exclusion
Write-Host "[1/4] Adding Antivirus Exclusions..." -NoNewline
try {
    Add-MpPreference -ExclusionPath $TargetDir -ErrorAction SilentlyContinue
    Write-Host " [OK]" -ForegroundColor Green
} catch {
    Write-Host " [SKIPPED]" -ForegroundColor Yellow
}

# 4. Register Main Agent Task (Runs as SYSTEM)
Write-Host "[2/4] Registering Sentrix Agent (SYSTEM task)..." -NoNewline
try {
    $agentPath = Join-Path $TargetDir "sentrix-agent.exe"
    $action = New-ScheduledTaskAction -Execute $agentPath -WorkingDirectory $TargetDir
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    
    Unregister-ScheduledTask -TaskName "Sentrix Agent" -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    Register-ScheduledTask -TaskName "Sentrix Agent" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
    
    if (-not (Get-ScheduledTask -TaskName "Sentrix Agent" -ErrorAction SilentlyContinue)) {
        throw "Failed to verify task creation."
    }
    
    Start-ScheduledTask -TaskName "Sentrix Agent" -ErrorAction SilentlyContinue | Out-Null
    Write-Host " [OK]" -ForegroundColor Green
} catch {
    Write-Host " [ERROR: $($_.Exception.Message)]" -ForegroundColor Red
    exit
}

# 5. Register Helper Task (Runs on Login)
if (Test-Path "$TargetDir\sentrix-helper.exe") {
    Write-Host "[3/4] Registering Sentrix Helper (Login task)..." -NoNewline
    try {
        $helperPath = Join-Path $TargetDir "sentrix-helper.exe"
        $hAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -Command `"Start-Process -FilePath '$helperPath' -WorkingDirectory '$TargetDir' -WindowStyle Hidden`"" -WorkingDirectory $TargetDir
        $hTrigger = New-ScheduledTaskTrigger -AtLogOn
        $hPrincipal = New-ScheduledTaskPrincipal -GroupId "Users" -RunLevel Highest
        $hSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Days 0)
        
        Unregister-ScheduledTask -TaskName "Sentrix Helper" -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
        Register-ScheduledTask -TaskName "Sentrix Helper" -Action $hAction -Trigger $hTrigger -Principal $hPrincipal -Settings $hSettings -Force | Out-Null
        
        if (-not (Get-ScheduledTask -TaskName "Sentrix Helper" -ErrorAction SilentlyContinue)) {
            throw "Failed to verify task creation."
        }
        
        Start-ScheduledTask -TaskName "Sentrix Helper" -ErrorAction SilentlyContinue | Out-Null
        Write-Host " [OK]" -ForegroundColor Green
    } catch {
        Write-Host " [FAILED: $($_.Exception.Message)]" -ForegroundColor Yellow
    }
}

# 6. Apply Directory Lockdown (Permissions Hardening)
Write-Host "[4/4] Hardening directory permissions..." -NoNewline
try {
    # Disable inheritance and copy existing rules
    $acl = Get-Acl $TargetDir
    $acl.SetAccessRuleProtection($true, $false)
    Set-Acl $TargetDir $acl
    
    # Grant Full Control to SYSTEM and Administrators
    & icacls.exe $TargetDir /grant "SYSTEM:(OI)(CI)F" /inheritance:e | Out-Null
    & icacls.exe $TargetDir /grant "Administrators:(OI)(CI)F" /inheritance:e | Out-Null
    
    # Explicitly remove access for 'Users' and 'Everyone'
    & icacls.exe $TargetDir /remove "Users" | Out-Null
    & icacls.exe $TargetDir /remove "Everyone" | Out-Null
    
    Write-Host " [OK]" -ForegroundColor Green
} catch {
    Write-Host " [FAILED: $($_.Exception.Message)]" -ForegroundColor Yellow
}

Write-Host "`n--- Installation Complete! ---" -ForegroundColor Cyan
Write-Host "The tasks are registered and folder permissions are locked down."
Write-Host "The agent will follow the configuration inside $TargetDir\.env."
Write-Host "If you need to change settings, edit that file and restart the 'Sentrix Agent' task."

