# Sentrix Remote Service Setup Script
$ErrorActionPreference = "Stop"

Unregister-ScheduledTask -TaskName "Sentrix Agent" -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "Sentrix Helper" -Confirm:$false -ErrorAction SilentlyContinue

$serviceName = "SentrixAgent"
$hostPath = "C:\ProgramData\SentrixAgent\AgentServiceHost.exe"

$existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existingService) {
    if ($existingService.Status -ne 'Stopped') {
        Stop-Service -Name $serviceName -Force -ErrorAction Stop
    }
    & sc.exe delete $serviceName | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "sc.exe delete failed with exit code $LASTEXITCODE."
    }

    # Wait for service to be fully removed (up to 15 seconds)
    $deadline = (Get-Date).AddSeconds(15)
    while ((Get-Service -Name $serviceName -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 500
    }
    if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) {
        throw "Timeout waiting for old service $serviceName to be deleted."
    }
}

$binPath = "`"$hostPath`""
& sc.exe create $serviceName binPath= $binPath start= auto obj= "NT AUTHORITY\SYSTEM" | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "sc.exe create failed with exit code $LASTEXITCODE."
}

& sc.exe config $serviceName displayName= "Sentrix Agent Service" | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "sc.exe config failed with exit code $LASTEXITCODE."
}

& sc.exe failure $serviceName reset= 86400 actions= restart/60000/restart/60000/restart/60000 | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "sc.exe failure failed with exit code $LASTEXITCODE."
}

Start-Service -Name $serviceName -ErrorAction Stop

# Wait for service to reach Running state (up to 15 seconds)
$deadline = (Get-Date).AddSeconds(15)
do {
    Start-Sleep -Milliseconds 500
    $svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
} while ($svc -and $svc.Status -ne 'Running' -and (Get-Date) -lt $deadline)

if (-not $svc -or $svc.Status -ne 'Running') {
    throw "Service $serviceName failed to reach Running state (Current status: $($svc.Status))."
}

# Ensure Sentrix Watchdog Task is registered
$watchdogFile = "C:\ProgramData\SentrixAgent\watchdog.ps1"
if (Test-Path $watchdogFile) {
    $existingTask = Get-ScheduledTask -TaskName "Sentrix Watchdog" -ErrorAction SilentlyContinue
    if (-not $existingTask) {
        $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watchdogFile`""
        $startupTrigger = New-ScheduledTaskTrigger -AtStartup
        $repeatTrigger = New-ScheduledTaskTrigger -Once -At "2020-01-01T00:00:00" -RepetitionInterval (New-TimeSpan -Minutes 1)
        $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
        $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

        Register-ScheduledTask -TaskName "Sentrix Watchdog" -Action $action -Trigger @($startupTrigger, $repeatTrigger) -Settings $settings -Principal $principal -Force | Out-Null
        Start-ScheduledTask -TaskName "Sentrix Watchdog" -ErrorAction SilentlyContinue
    }
}

Write-Host "[DEPLOY] SentrixAgent Windows Service and Watchdog successfully configured and started."
