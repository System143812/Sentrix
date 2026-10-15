# Sentrix PC Lockdown Script
# Run this as Administrator. It "locks down" the PC by reversing the provisioning steps.

$ErrorActionPreference = "Continue"

Write-Host "--- Sentrix PC Lockdown Starting ---" -ForegroundColor Cyan

# 1. Disable the built-in Administrator account
Write-Host "[1/6] Disabling built-in Administrator account..." -NoNewline
try {
    Disable-LocalUser -Name "Administrator" -ErrorAction Stop
    Write-Host " [OK]" -ForegroundColor Green
} catch {
    Write-Host " [SKIPPED/FAILED: $($_.Exception.Message)]" -ForegroundColor Yellow
}

# 2. Re-enable Remote UAC Filter (LocalAccountTokenFilterPolicy)
# Restores the default secure state (0).
Write-Host "[2/6] Restoring Remote UAC policy to secure state..." -NoNewline
try {
    $registryPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System"
    $name = "LocalAccountTokenFilterPolicy"
    if (Test-Path $registryPath) {
        Set-ItemProperty -Path $registryPath -Name $name -Value 0 -Force -ErrorAction Stop
        Write-Host " [OK]" -ForegroundColor Green
    } else {
        Write-Host " [SKIPPED: Path not found]" -ForegroundColor Yellow
    }
} catch {
    Write-Host " [FAILED: $($_.Exception.Message)]" -ForegroundColor Red
}

# 3. Close Firewall Ports (SMB Only)
Write-Host "[3/6] Closing Firewall Ports (SMB)..." -NoNewline
try {
    Disable-NetFirewallRule -Name "FPS-SMB-In-TCP" -ErrorAction Stop
    Write-Host " [OK]" -ForegroundColor Green
} catch {
    Write-Host " [SKIPPED/FAILED: $($_.Exception.Message)]" -ForegroundColor Yellow
}

# 4. Remove Antivirus Exclusions
Write-Host "[4/6] Removing Windows Defender Exclusions..." -NoNewline
try {
    $targetPath = "C:\ProgramData\SentrixAgent"
    Remove-MpPreference -ExclusionPath $targetPath -ErrorAction Stop
    Write-Host " [OK]" -ForegroundColor Green
} catch {
    Write-Host " [SKIPPED/FAILED: $($_.Exception.Message)]" -ForegroundColor Yellow
}

# 5. Remove Scheduled Tasks
Write-Host "[5/6] Removing Sentrix Scheduled Tasks..." -NoNewline
try {
    $tasks = @("Sentrix Watchdog", "Sentrix Agent", "Sentrix Helper", "Sentrix Bootstrap")
    foreach ($task in $tasks) {
        if (Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue) {
            Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction Stop
        }
    }
    Write-Host " [OK]" -ForegroundColor Green
} catch {
    Write-Host " [FAILED: $($_.Exception.Message)]" -ForegroundColor Red
}

# 6. Remove Sentrix Files
Write-Host "[6/6] Removing Sentrix Files and Directories..." -NoNewline
try {
    $targetPath = "C:\ProgramData\SentrixAgent"
    if (Test-Path $targetPath) {
        # Kill any remaining agent/helper processes first to release file locks
        Get-Process -Name "sentrix-agent" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        Get-Process -Name "sentrix-helper" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        
        Start-Sleep -Seconds 2
        Remove-Item -Path $targetPath -Recurse -Force -ErrorAction Stop
        Write-Host " [OK]" -ForegroundColor Green
    } else {
        Write-Host " [SKIPPED: Path not found]" -ForegroundColor Yellow
    }
} catch {
    Write-Host " [FAILED: $($_.Exception.Message)]" -ForegroundColor Red
}

Write-Host "`n--- Lockdown Complete! ---" -ForegroundColor Cyan
Write-Host "The PC has been hardened and Sentrix management components have been removed."
