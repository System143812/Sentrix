# Sentrix Master Image Prep Script (Windows Service Architecture + Watchdog)
# Run this as Administrator. It unlocks the PC, configures Administrator and SMB, and registers the local Watchdog for binary swapping and service recovery.

$ErrorActionPreference = "Stop"

Write-Host "--- Sentrix Master Image Prep Starting ---" -ForegroundColor Cyan
Write-Host "Configuring Administrator account and local Watchdog..." -ForegroundColor Yellow
Write-Host ""

# Load centralized build configuration for Administrator credentials (Fail-closed)
$configPath = Join-Path $PSScriptRoot "provisioner-config.json"

if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    throw "Provisioner configuration not found: $configPath"
}

try {
    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json -ErrorAction Stop
} catch {
    throw "Failed to read provisioner configuration: $($_.Exception.Message)"
}

if ([string]::IsNullOrWhiteSpace($config.adminUsername) -or
    [string]::IsNullOrWhiteSpace($config.adminPassword)) {
    throw "Provisioner configuration must contain adminUsername and adminPassword."
}

$adminUser = $config.adminUsername
$adminPass = $config.adminPassword

# 1. Enable the built-in Administrator account and verify SID (-500)
Write-Host "[1/6] Enabling and verifying built-in Administrator account..." -NoNewline
try {
    $adminAccount = Get-LocalUser -Name $adminUser -ErrorAction Stop
    if (-not $adminAccount.Enabled) {
        Enable-LocalUser -Name $adminUser -ErrorAction Stop
        $adminAccount = Get-LocalUser -Name $adminUser -ErrorAction Stop
    }

    $sidStr = $adminAccount.Sid.Value
    if (-not $sidStr.EndsWith("-500")) {
        throw "Account '$adminUser' (SID: $sidStr) is not the built-in Administrator account (SID must end in -500)."
    }
    Write-Host " [OK]" -ForegroundColor Green
} catch {
    Write-Host " [FAILED: $($_.Exception.Message)]" -ForegroundColor Red
    throw
}

# 2. Set a password for the Administrator account (do not print password)
Write-Host "[2/6] Setting Administrator password..." -NoNewline
try {
    $admin = [adsi]"WinNT://localhost/$adminUser,user"
    $admin.SetPassword($adminPass)
    Write-Host " [OK]" -ForegroundColor Green
} catch {
    Write-Host " [FAILED: $($_.Exception.Message)]" -ForegroundColor Red
    throw
}

# 3. Disable Remote UAC Filter (LocalAccountTokenFilterPolicy)
Write-Host "[3/6] Configuring Remote UAC policy..." -NoNewline
try {
    $registryPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System"
    $name = "LocalAccountTokenFilterPolicy"
    if (-not (Test-Path $registryPath)) { New-Item -Path $registryPath -Force | Out-Null }
    New-ItemProperty -Path $registryPath -Name $name -Value 1 -PropertyType DWord -Force | Out-Null
    Write-Host " [OK]" -ForegroundColor Green
} catch {
    Write-Host " [FAILED: $($_.Exception.Message)]" -ForegroundColor Red
    throw
}

# 4. Open Firewall Ports (SMB Only) with strict error checking
Write-Host "[4/6] Opening Firewall Ports (SMB)..." -NoNewline
try {
    Enable-NetFirewallRule -Name "FPS-SMB-In-TCP" -ErrorAction Stop
    $rule = Get-NetFirewallRule -Name "FPS-SMB-In-TCP" -ErrorAction Stop
    if ($rule.Enabled -ne 'True') {
        throw "Firewall rule FPS-SMB-In-TCP is not enabled."
    }
    Write-Host " [OK]" -ForegroundColor Green
} catch {
    throw "Firewall configuration failed: $($_.Exception.Message)"
}

# 5. Add Antivirus Exclusions & Secure Folder ACLs (Consistent ACL protection without conflicting /inheritance:e)
Write-Host "[5/6] Adding Windows Defender Exclusions & ACLs..." -NoNewline
try {
    $targetPath = "C:\ProgramData\SentrixAgent"
    if (-not (Test-Path $targetPath)) { New-Item -ItemType Directory -Path $targetPath -Force | Out-Null }

    try {
        Add-MpPreference -ExclusionPath $targetPath -ErrorAction Stop
    } catch {
        Write-Warning "Add-MpPreference failed or Windows Defender is restricted/disabled ($($_.Exception.Message)). Skipping Defender exclusion."
    }

    $acl = Get-Acl $targetPath
    $acl.SetAccessRuleProtection($true, $false)
    Set-Acl $targetPath $acl

    & icacls.exe $targetPath /grant "SYSTEM:(OI)(CI)F" /q 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "icacls SYSTEM grant failed with exit code $LASTEXITCODE" }
    & icacls.exe $targetPath /grant "Administrators:(OI)(CI)F" /q 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "icacls Administrators grant failed with exit code $LASTEXITCODE" }
    & icacls.exe $targetPath /grant "BUILTIN\Users:(OI)(CI)(RX)" /q 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "icacls Users grant failed with exit code $LASTEXITCODE" }

    Write-Host " [OK]" -ForegroundColor Green
} catch {
    Write-Host " [SKIPPED/FAILED: $($_.Exception.Message)]" -ForegroundColor Yellow
    throw
}

# 6. Clean Slate (Authoritative cleanup via remove-sentrix.ps1) & Register Watchdog Task
Write-Host "[6/6] Performing clean-slate cleanup and registering Watchdog Task..." -NoNewline
try {
    $targetPath = "C:\ProgramData\SentrixAgent"
    if (-not (Test-Path $targetPath)) { New-Item -ItemType Directory -Path $targetPath -Force | Out-Null }

    # Locate authoritative remove-sentrix.ps1
    $removeScriptPath = Join-Path $PSScriptRoot "remove-sentrix.ps1"

    if (-not (Test-Path -LiteralPath $removeScriptPath -PathType Leaf)) {
        throw "Required cleanup script not found: $removeScriptPath"
    }

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $removeScriptPath

    if ($LASTEXITCODE -ne 0) {
        throw "Sentrix cleanup failed with exit code $LASTEXITCODE. Provisioning aborted."
    }

    # Verify authoritative removal of old service
    if (Get-Service -Name "SentrixAgent" -ErrorAction SilentlyContinue) {
        throw "Cleanup validation failed: SentrixAgent service still exists."
    }

    # Verify authoritative removal of legacy scheduled tasks (including old Watchdog)
    foreach ($taskName in @("Sentrix Agent", "Sentrix Helper", "Sentrix Bootstrap", "Sentrix Watchdog")) {
        if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
            throw "Cleanup validation failed: Scheduled task '$taskName' still exists."
        }
    }

    # Ensure target directory exists
    if (-not (Test-Path $targetPath)) {
        New-Item -ItemType Directory -Path $targetPath -Force | Out-Null
    }

    # Verify stale deployment files are removed (directory contents must be empty)
    $remainingItems = @(
        Get-ChildItem -LiteralPath $targetPath -Force -ErrorAction Stop
    )

    if ($remainingItems.Count -gt 0) {
        $remainingNames = ($remainingItems | Select-Object -ExpandProperty Name) -join ", "
        throw "Cleanup validation failed. Unexpected files remain: $remainingNames"
    }

    # Create provisional Watchdog Script for binary swapping & health checks
    $watchdogFile = "$targetPath\watchdog.ps1"
    $watchdogScript = @'
$log = 'C:\ProgramData\SentrixAgent\watchdog.log'
$serviceName = 'SentrixAgent'
$baseDir = 'C:\ProgramData\SentrixAgent'

function Log-Message($msg) {
    $timestamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    Add-Content -Path $log -Value "[$timestamp] $msg"
}

# 1. Check for pending updates (deferred for future SCM coordination)
$updateFiles = @(
    'C:\ProgramData\SentrixAgent\sentrix-agent-update.exe',
    'C:\ProgramData\SentrixAgent\sentrix-helper-update.exe',
    'C:\ProgramData\SentrixAgent\AgentServiceHost-update.exe'
)
foreach ($uf in $updateFiles) {
    if (Test-Path $uf) {
        Log-Message "Detected pending update package $uf (deferred pending SCM coordination)."
    }
}

# 2. Check service status, deployment readiness marker, and independently validate manifest & payload
$service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
$readyMarker = 'C:\ProgramData\SentrixAgent\.deployment-ready'
$manifestPath = 'C:\ProgramData\SentrixAgent\asset-manifest.json'

if (($null -eq $service) -and (Test-Path $readyMarker) -and (Test-Path $manifestPath)) {
    Log-Message "Deployment readiness marker and manifest detected. Performing strict integrity validation..."
    $payloadValid = $true

    try {
        $markerData = Get-Content -LiteralPath $readyMarker -Raw | ConvertFrom-Json -ErrorAction Stop
        if ([string]::IsNullOrWhiteSpace($markerData.deploymentId)) {
            Log-Message "Payload validation failed: Marker missing deploymentId."
            $payloadValid = $false
        }

        $rawManifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json -ErrorAction Stop
        $metaEntry = $rawManifest | Where-Object { $null -ne $_.deploymentId }
        if (-not $metaEntry -or $metaEntry.deploymentId -ne $markerData.deploymentId) {
            Log-Message "Payload validation failed: Deployment ID mismatch between marker and manifest."
            $payloadValid = $false
        }

        $manifestItems = $rawManifest | Where-Object { $null -ne $_.relPath }
        foreach ($item in $manifestItems) {
            $itemPath = Join-Path $baseDir $item.relPath
            if (-not (Test-Path -LiteralPath $itemPath -PathType Leaf)) {
                Log-Message "Payload validation failed: Missing file $($item.relPath)"
                $payloadValid = $false
                break
            }
            $itemSize = (Get-Item -LiteralPath $itemPath).Length
            if ($itemSize -eq 0 -or $itemSize -ne [long]$item.size) {
                Log-Message "Payload validation failed: Size mismatch or empty file for $($item.relPath)"
                $payloadValid = $false
                break
            }
            $itemHash = (Get-FileHash -LiteralPath $itemPath -Algorithm SHA256).Hash.ToLower()
            if ($itemHash -ne $item.hash.ToLower()) {
                Log-Message "Payload validation failed: SHA-256 hash mismatch for $($item.relPath)"
                $payloadValid = $false
                break
            }
        }
    } catch {
        Log-Message "Exception during payload integrity validation: $_"
        $payloadValid = $false
    }

    if ($payloadValid) {
        Log-Message "Payload integrity validation passed successfully. Executing setup-service.ps1..."
        $setupScriptPath = 'C:\ProgramData\SentrixAgent\src\utils\setup-service.ps1'
        try {
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $setupScriptPath 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Log-Message "setup-service.ps1 executed successfully (Exit Code 0)."
            } else {
                Log-Message "setup-service.ps1 failed with exit code $LASTEXITCODE."
            }
        } catch {
            Log-Message "Exception during setup-service.ps1 execution: $_"
        }
    } else {
        Log-Message "Bootstrap skipped due to incomplete, modified, or invalid deployment payload."
    }
}
'@
    $watchdogScript | Out-File -FilePath $watchdogFile -Encoding utf8 -Force

    # Register Watchdog Scheduled Task (Runs at Startup and every minute as SYSTEM)
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watchdogFile`""
    $startupTrigger = New-ScheduledTaskTrigger -AtStartup
    $repeatTrigger = New-ScheduledTaskTrigger -Once -At "2020-01-01T00:00:00" -RepetitionInterval (New-TimeSpan -Minutes 1)
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

    Register-ScheduledTask -TaskName "Sentrix Watchdog" -Action $action -Trigger @($startupTrigger, $repeatTrigger) -Settings $settings -Principal $principal -Force | Out-Null
    Start-ScheduledTask -TaskName "Sentrix Watchdog" -ErrorAction SilentlyContinue

    Write-Host " [OK]" -ForegroundColor Green
} catch {
    Write-Host " [FAILED: $($_.Exception.Message)]" -ForegroundColor Red
    throw
}

Write-Host "`n--- Sentrix Master Image Prep Complete ---" -ForegroundColor Cyan
