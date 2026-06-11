# Sentrix Master Image Prep Script (Streamlined)
# Run this as Administrator. It "unlocks" the PC for Passive SMB deployment.

$ErrorActionPreference = "Stop"

Write-Host "--- Sentrix Master Image Prep Starting ---" -ForegroundColor Cyan

# 1. Enable the built-in Administrator account
# Needed for the initial SMB Administrative Share (C$) connection.
Write-Host "[1/6] Enabling built-in Administrator account..." -NoNewline
try {
    Enable-LocalUser -Name "Administrator"
    Write-Host " [OK]" -ForegroundColor Green
} catch {
    Write-Host " [FAILED or Already Enabled]" -ForegroundColor Yellow
}

# 2. Set a password for the Administrator account
$password = "SentrixLab2024!" 
Write-Host "[2/6] Setting Administrator password..." -NoNewline
$admin = [adsi]"WinNT://localhost/Administrator,user"
$admin.SetPassword($password)
Write-Host " [OK]" -ForegroundColor Green

# 3. Disable Remote UAC Filter (LocalAccountTokenFilterPolicy)
# Allows remote admins to map administrative shares (C$) over the network.
Write-Host "[3/6] Configuring Remote UAC policy..." -NoNewline
$registryPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System"
$name = "LocalAccountTokenFilterPolicy"
if (-not (Test-Path $registryPath)) { New-Item -Path $registryPath -Force | Out-Null }
New-ItemProperty -Path $registryPath -Name $name -Value 1 -PropertyType DWord -Force | Out-Null
Write-Host " [OK]" -ForegroundColor Green

# 4. Open Firewall Ports (SMB Only)
Write-Host "[4/6] Opening Firewall Ports (SMB)..." -NoNewline
try {
    Enable-NetFirewallRule -Name "FPS-SMB-In-TCP" -ErrorAction SilentlyContinue
    Write-Host " [OK]" -ForegroundColor Green
} catch {
    Write-Host " [FAILED]" -ForegroundColor Yellow
}

# 5. Add Antivirus Exclusions
Write-Host "[5/6] Adding Windows Defender Exclusions..." -NoNewline
try {
    $targetPath = "C:\ProgramData\SentrixAgent"
    if (-not (Test-Path $targetPath)) { New-Item -ItemType Directory -Path $targetPath -Force | Out-Null }
    Add-MpPreference -ExclusionPath $targetPath -ErrorAction SilentlyContinue
    Write-Host " [OK]" -ForegroundColor Green
} catch {
    Write-Host " [SKIPPED/FAILED]" -ForegroundColor Yellow
}

# 6. Clean Slate & Create Permanent Sentrix Watchdog
# This task ensures the agent is always running and handles updates/reactivation.
Write-Host "[6/6] Cleaning old tasks & creating Permanent Watchdog..." -NoNewline
try {
    $targetPath = "C:\ProgramData\SentrixAgent"
    if (-not (Test-Path $targetPath)) { New-Item -ItemType Directory -Path $targetPath -Force | Out-Null }
    
    # Wipe any old traces
    Unregister-ScheduledTask -TaskName "Sentrix Agent" -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    Unregister-ScheduledTask -TaskName "Sentrix Helper" -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    Unregister-ScheduledTask -TaskName "Sentrix Bootstrap" -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    Unregister-ScheduledTask -TaskName "Sentrix Watchdog" -Confirm:$false -ErrorAction SilentlyContinue | Out-Null

    # Write the watchdog logic to a dedicated file
    $watchdogFile = "$targetPath\watchdog.ps1"
    $logFile = "$targetPath\watchdog.log"
    $watchdogScript = @'
$log = 'C:\ProgramData\SentrixAgent\watchdog.log'
$exe = 'C:\ProgramData\SentrixAgent\sentrix-agent.exe'
$updateExe = 'C:\ProgramData\SentrixAgent\sentrix-agent-update.exe'
$helperExe = 'C:\ProgramData\SentrixAgent\sentrix-helper.exe'
$updateHelperExe = 'C:\ProgramData\SentrixAgent\sentrix-helper-update.exe'
$targetPath = 'C:\ProgramData\SentrixAgent'

function Log-Message($msg) {
    $timestamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    Add-Content -Path $log -Value "[$timestamp] $msg"
}

# 1. Check for pending updates
if (Test-Path $updateExe) {
    Log-Message "Found pending agent update. Preparing for swap..."
    
    # Kill the current agent if it's running
    $running = Get-Process -Name "sentrix-agent" -ErrorAction SilentlyContinue
    if ($running) {
        Log-Message "Stopping running agent for update..."
        $running | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
    
    # Swap files
    try {
        Move-Item -Path $updateExe -Destination $exe -Force -ErrorAction Stop
        Log-Message "Agent binary updated successfully."
        
        if (Test-Path $updateHelperExe) {
            Move-Item -Path $updateHelperExe -Destination $helperExe -Force -ErrorAction SilentlyContinue
            Log-Message "Helper binary updated successfully."
        }
    } catch {
        Log-Message "FAILED to swap binaries: $($_.Exception.Message)"
    }
}

# 2. Ensure agent is running
$agentProcess = Get-Process -Name "sentrix-agent" -ErrorAction SilentlyContinue

if ($null -eq $agentProcess) {
    if (Test-Path $exe) {
        Log-Message "Agent not running. Triggering setup/activation..."
        $setup = Start-Process -FilePath $exe -ArgumentList "--setup" -WorkingDirectory $targetPath -WindowStyle Hidden -Wait -PassThru
        Log-Message "Setup attempt finished with exit code $($setup.ExitCode)."

        $agentTask = Get-ScheduledTask -TaskName "Sentrix Agent" -ErrorAction SilentlyContinue
        if ($null -ne $agentTask) {
            try {
                Start-ScheduledTask -TaskName "Sentrix Agent" -ErrorAction Stop
                Log-Message "Sentrix Agent task verified and start signal sent."
            } catch {
                Log-Message "FAILED to start Sentrix Agent task: $($_.Exception.Message)"
            }
        } else {
            Log-Message "Sentrix Agent task is still missing after setup. Starting executable directly as fallback."
            try {
                Start-Process -FilePath $exe -WorkingDirectory $targetPath -WindowStyle Hidden
            } catch {
                Log-Message "FAILED to start agent fallback: $($_.Exception.Message)"
            }
        }
    }
}
'@
    $watchdogScript | Out-File -FilePath $watchdogFile -Encoding utf8 -Force

    # Create the permanent watchdog task (runs every minute as SYSTEM)
    $taskAction = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""$watchdogFile"""
    & schtasks.exe /create /tn "Sentrix Watchdog" /tr "$taskAction" /sc minute /mo 1 /ru SYSTEM /rl HIGHEST /f | Out-Null
    
    # Trigger the first run immediately
    & schtasks.exe /run /tn "Sentrix Watchdog" | Out-Null
    
    Write-Host " [OK]" -ForegroundColor Green
} catch {
    Write-Host " [FAILED: $($_.Exception.Message)]" -ForegroundColor Red
}

Write-Host "`n--- Prep Complete! ---" -ForegroundColor Cyan
Write-Host "This PC is now ready for Permanent Zero-Touch management."
Write-Host "1. Push agent files via SMB to C:\ProgramData\SentrixAgent"
Write-Host "2. The Watchdog task will detect and install the agent automatically."
Write-Host "Credentials: Administrator / $password" -ForegroundColor Yellow
