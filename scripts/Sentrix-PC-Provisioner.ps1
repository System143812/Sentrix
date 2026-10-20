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

# 1. Check for pending updates (helper or agent)
if ((Test-Path $updateExe) -or (Test-Path $updateHelperExe)) {
    Log-Message "Detected pending update binaries. Preparing for surgical swap..."

    # Stop scheduled tasks to release file locks
    Stop-ScheduledTask -TaskName "Sentrix Helper" -ErrorAction SilentlyContinue
    Stop-ScheduledTask -TaskName "Sentrix Agent" -ErrorAction SilentlyContinue

    # Kill running processes
    Get-Process sentrix-helper -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Get-Process sentrix-agent -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    taskkill /F /IM sentrix-helper* 2>&1 | Out-Null
    taskkill /F /IM sentrix-agent* 2>&1 | Out-Null

    Start-Sleep -Seconds 2

    # Swap helper first if pending update exists
    if (Test-Path $updateHelperExe) {
        Log-Message "Swapping sentrix-helper.exe with retries..."
        $helperSwapped = $false
        for ($i = 1; $i -le 5; $i++) {
            try {
                Get-Process sentrix-helper -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
                taskkill /F /IM sentrix-helper* 2>&1 | Out-Null
                if (Test-Path $helperExe) {
                    Remove-Item -Path $helperExe -Force -ErrorAction SilentlyContinue
                }
                Move-Item -Path $updateHelperExe -Destination $helperExe -Force -ErrorAction Stop
                $helperSwapped = $true
                Log-Message "Successfully swapped sentrix-helper.exe on attempt $i."
                break
            } catch {
                Log-Message "Attempt $i to swap sentrix-helper.exe failed: $_. Retrying in 1s..."
                Start-Sleep -Seconds 1
            }
        }
        if (-not $helperSwapped) {
            Log-Message "WARNING: Failed to swap sentrix-helper.exe after 5 attempts. Removing update binary."
            Remove-Item -Path $updateHelperExe -Force -ErrorAction SilentlyContinue
        }
    }

    # Swap agent second if pending update exists
    if (Test-Path $updateExe) {
        Log-Message "Swapping sentrix-agent.exe with retries..."
        $agentSwapped = $false
        for ($i = 1; $i -le 5; $i++) {
            try {
                Get-Process sentrix-agent -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
                taskkill /F /IM sentrix-agent* 2>&1 | Out-Null
                if (Test-Path $exe) {
                    Remove-Item -Path $exe -Force -ErrorAction SilentlyContinue
                }
                Move-Item -Path $updateExe -Destination $exe -Force -ErrorAction Stop
                $agentSwapped = $true
                Log-Message "Successfully swapped sentrix-agent.exe on attempt $i."
                break
            } catch {
                Log-Message "Attempt $i to swap sentrix-agent.exe failed: $_. Retrying in 1s..."
                Start-Sleep -Seconds 1
            }
        }
        if (-not $agentSwapped) {
            Log-Message "WARNING: Failed to swap sentrix-agent.exe after 5 attempts. Removing update binary."
            Remove-Item -Path $updateExe -Force -ErrorAction SilentlyContinue
        }
    }

    # Restart scheduled tasks
    Log-Message "Restarting Sentrix Helper and Sentrix Agent tasks..."
    Start-ScheduledTask -TaskName "Sentrix Helper" -ErrorAction SilentlyContinue
    Start-ScheduledTask -TaskName "Sentrix Agent" -ErrorAction SilentlyContinue
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

    # Create the permanent watchdog task using PowerShell cmdlets for better control
    $watchdogScriptPath = $watchdogFile

    # Remove any existing task first
    Unregister-ScheduledTask -TaskName "Sentrix Watchdog" -Confirm:$false -ErrorAction SilentlyContinue

    # Build a robust task with BOTH triggers so it runs immediately and survives reboots:
    #   1. AtStartup — fires on every boot (covers reboots and fresh deployments)
    #   2. Once + RepetitionInterval — repeats every minute indefinitely (keeps the agent alive)
    # Using a safe epoch start time so the repeating trigger is never "in the past"
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watchdogScriptPath`""
    $startupTrigger = New-ScheduledTaskTrigger -AtStartup
    $repeatTrigger = New-ScheduledTaskTrigger -Once -At "2020-01-01T00:00:00" -RepetitionInterval (New-TimeSpan -Minutes 1)
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

    # Register with BOTH triggers — the repeating trigger fires immediately (start time is in the past + StartWhenAvailable)
    Register-ScheduledTask -TaskName "Sentrix Watchdog" -Action $action -Trigger @($startupTrigger, $repeatTrigger) -Settings $settings -Principal $principal -Force | Out-Null

    # Start it now so it doesn't wait for the next trigger cycle
    Start-ScheduledTask -TaskName "Sentrix Watchdog"
    
    Write-Host " [OK]" -ForegroundColor Green
} catch {
    Write-Host " [FAILED: $($_.Exception.Message)]" -ForegroundColor Red
}

Write-Host "`n--- Prep Complete! ---" -ForegroundColor Cyan
Write-Host "This PC is now ready for Permanent Zero-Touch management."
Write-Host "1. Push agent files via SMB to C:\ProgramData\SentrixAgent"
Write-Host "2. The Watchdog task will detect and install the agent automatically."
Write-Host "Credentials: Administrator / $password" -ForegroundColor Yellow
