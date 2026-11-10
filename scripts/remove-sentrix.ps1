# Sentrix Complete Removal & Reset Script (Windows Service & Multi-Session Architecture)
# Run this script as Administrator.
# It gracefully stops services and watchdog tasks, unregisters tasks with verification,
# terminates verified Sentrix processes by path with strict identity revalidation, and purges C:\ProgramData\SentrixAgent contents while preserving the root directory.

$ErrorActionPreference = "Stop"

Write-Host "--- Sentrix Removal & Reset Script Starting ---" -ForegroundColor Cyan

# 1. Check for Admin Privileges
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
if (-not $isAdmin) {
    Write-Host "ERROR: Please run this script as Administrator!" -ForegroundColor Red
    exit 1
}

$failedItems = @()

# 2. Stop and Unregister Scheduled Tasks with verification
Write-Host "[1/5] Stopping and unregistering scheduled tasks..." -NoNewline
$taskSectionFailed = $false
foreach ($taskName in @("Sentrix Watchdog", "Sentrix Agent", "Sentrix Helper")) {
    try {
        Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
        schtasks /Delete /TN $taskName /F 2>&1 | Out-Null
    } catch {}

    # Wait up to 5 seconds for Task Scheduler to release the task
    $deadline = (Get-Date).AddSeconds(5)
    while ((Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 200
    }

    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
        $failedItems += "Scheduled Task (still exists): $taskName"
        $taskSectionFailed = $true
    }
}
if (-not $taskSectionFailed) {
    Write-Host " [OK]" -ForegroundColor Green
} else {
    Write-Host " [WARN]" -ForegroundColor Yellow
}

# 3. Stop and Delete Windows Service (SentrixAgent)
Write-Host "[2/5] Stopping and deleting SentrixAgent Windows Service..." -NoNewline
$serviceSectionFailed = $false
$serviceName = "SentrixAgent"
try {
    $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if ($service) {
        if ($service.Status -ne 'Stopped') {
            Stop-Service -Name $serviceName -Force -ErrorAction Stop
        }

        $deadline = (Get-Date).AddSeconds(15)
        do {
            Start-Sleep -Milliseconds 500
            $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
        } while ($service -and $service.Status -ne 'Stopped' -and (Get-Date) -lt $deadline)

        if ($service -and $service.Status -ne 'Stopped') {
            throw "Service did not reach Stopped state."
        }

        & sc.exe delete $serviceName | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "sc.exe delete failed with exit code $LASTEXITCODE."
        }

        $deadline = (Get-Date).AddSeconds(15)
        while ((Get-Service -Name $serviceName -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {
            Start-Sleep -Milliseconds 500
        }

        if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) {
            throw "Service still exists after deletion timeout."
        }
    }
} catch {
    $failedItems += "Windows Service: $($_.Exception.Message)"
    $serviceSectionFailed = $true
}
if (-not $serviceSectionFailed) {
    Write-Host " [OK]" -ForegroundColor Green
} else {
    Write-Host " [WARN]" -ForegroundColor Yellow
}

# 4. Stop Running Sentrix Processes (Verified by Path under C:\ProgramData\SentrixAgent with strict identity revalidation)
Write-Host "[3/5] Stopping Sentrix processes with path & identity verification..." -NoNewline
$targetBasePath = "C:\ProgramData\SentrixAgent"
$processSectionFailed = $false
try {
    # Fail closed on discovery error (-ErrorAction Stop)
    $procs = @(Get-CimInstance Win32_Process -Filter "ExecutablePath LIKE 'C:\\ProgramData\\SentrixAgent\\%'" -ErrorAction Stop)
    foreach ($proc in $procs) {
        $pidNum = $proc.ProcessId
        $initialPath = $proc.ExecutablePath
        $initialCreation = $proc.CreationDate

        try {
            # Revalidate identity immediately before terminating (using PowerShell 5.1 compatible -or operators)
            $currentProc = Get-CimInstance Win32_Process -Filter "ProcessId = $pidNum" -ErrorAction Stop
            if (-not $currentProc -or $currentProc.ExecutablePath -ne $initialPath -or $currentProc.CreationDate -ne $initialCreation) {
                $failedItems += "Process PID ${pidNum} identity mismatch or exited prior to termination."
                $processSectionFailed = $true
                continue
            }

            Stop-Process -Id $pidNum -Force -ErrorAction SilentlyContinue
            $deadline = (Get-Date).AddSeconds(5)
            while ((Get-Process -Id $pidNum -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {
                Start-Sleep -Milliseconds 200
            }

            if (Get-Process -Id $pidNum -ErrorAction SilentlyContinue) {
                & taskkill.exe /PID $pidNum /F /T 2>&1 | Out-Null
                if ($LASTEXITCODE -ne 0) {
                    $failedItems += "taskkill failed for PID ${pidNum} with exit code $LASTEXITCODE"
                    $processSectionFailed = $true
                }
            }

            # Confirm exit
            $checkExit = Get-Process -Id $pidNum -ErrorAction SilentlyContinue
            if ($checkExit) {
                $failedItems += "Process still running after force termination (PID ${pidNum})"
                $processSectionFailed = $true
            }
        } catch {
            $failedItems += "Error processing PID ${pidNum}: $($_.Exception.Message)"
            $processSectionFailed = $true
        }
    }

    # Final check for remaining processes under path (fail closed)
    $remainingProcs = @(Get-CimInstance Win32_Process -Filter "ExecutablePath LIKE 'C:\\ProgramData\\SentrixAgent\\%'" -ErrorAction Stop)
    if ($remainingProcs.Count -gt 0) {
        foreach ($rp in $remainingProcs) {
            $failedItems += "Process still running (PID $($rp.ProcessId)): $($rp.Name)"
            $processSectionFailed = $true
        }
    }
} catch {
    $failedItems += "Process discovery/termination error: $($_.Exception.Message)"
    $processSectionFailed = $true
}

if (-not $processSectionFailed) {
    Write-Host " [OK]" -ForegroundColor Green
} else {
    Write-Host " [WARN]" -ForegroundColor Yellow
}

# 5. Purge C:\ProgramData\SentrixAgent Directory Contents (Preserving root directory)
Write-Host "[4/5] Purging C:\ProgramData\SentrixAgent directory contents..." -NoNewline
$dirSectionFailed = $false
if ($failedItems.Count -eq 0 -and (Test-Path $targetBasePath)) {
    try {
        & takeown.exe /F $targetBasePath /R /D Y 2>&1 | Out-Null
        & icacls.exe $targetBasePath /grant "*S-1-5-32-544:F" /T /C /Q 2>&1 | Out-Null
        Get-ChildItem -LiteralPath $targetBasePath -Force -ErrorAction Stop |
            Remove-Item -Force -Recurse -ErrorAction Stop
    } catch {
        $failedItems += "Directory content purge failed: $($_.Exception.Message)"
        $dirSectionFailed = $true
    }
} elseif (Test-Path $targetBasePath) {
    $failedItems += "Directory content purge skipped due to preceding cleanup failures."
    $dirSectionFailed = $true
}

if (-not (Test-Path -LiteralPath $targetBasePath -PathType Container)) {
    $failedItems += "Agent root directory is missing: $targetBasePath"
    $dirSectionFailed = $true
}

if (-not $dirSectionFailed) {
    Write-Host " [OK]" -ForegroundColor Green
} else {
    Write-Host " [WARN]" -ForegroundColor Yellow
}

# 6. Final Verification Summary
Write-Host "[5/5] Performing final verification..." -NoNewline
if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) {
    $failedItems += "Windows Service still exists: $serviceName"
}
if (-not (Test-Path -LiteralPath $targetBasePath -PathType Container)) {
    $failedItems += "Agent root directory is missing: $targetBasePath"
}

if ($failedItems.Count -eq 0) {
    Write-Host " [OK]" -ForegroundColor Green
    Write-Host "`n--- Sentrix Removal & Reset Complete! ---" -ForegroundColor Cyan
    Write-Host "All Windows services, tasks, processes, and agent files have been successfully purged (root directory preserved)." -ForegroundColor Green
} else {
    Write-Host " [WARN]" -ForegroundColor Yellow
    Write-Host "`n--- Sentrix Removal Completed with Warnings ---" -ForegroundColor Yellow
    Write-Host "The following resources could not be fully removed:" -ForegroundColor Yellow
    foreach ($item in $failedItems) {
        Write-Host "  - $item" -ForegroundColor Red
    }
    exit 1
}
