# Sentrix Home Edition Manual Installer (Windows Service & Multi-Session Architecture)
# Run this as Administrator on the laptop if the Dashboard "Deploy" fails.

$ErrorActionPreference = "Stop"

# --- CONFIGURATION ---
$TargetDir = "C:\ProgramData\SentrixAgent"

Write-Host "--- Sentrix Home Installer (Windows Service Architecture) Starting ---" -ForegroundColor Cyan

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
Write-Host "[1/3] Adding Antivirus Exclusions..." -NoNewline
try {
    Add-MpPreference -ExclusionPath $TargetDir -ErrorAction SilentlyContinue
    Write-Host " [OK]" -ForegroundColor Green
} catch {
    Write-Host " [SKIPPED]" -ForegroundColor Yellow
}

# 4. Register Sentrix Agent as Windows Service (SYSTEM) & Clean up legacy Scheduled Tasks
Write-Host "[2/3] Registering Sentrix Agent Windows Service..." -NoNewline
try {
    Unregister-ScheduledTask -TaskName "Sentrix Agent" -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    Unregister-ScheduledTask -TaskName "Sentrix Helper" -Confirm:$false -ErrorAction SilentlyContinue | Out-Null

    $serviceName = "SentrixAgent"
    $existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if ($existingService) {
        if ($existingService.Status -eq 'Running') {
            Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
        }
        & sc.exe delete $serviceName | Out-Null
    }

    $hostPath = Join-Path $TargetDir "AgentServiceHost.exe"
    $binPath = "`"$hostPath`""

    & sc.exe create $serviceName binPath= $binPath start= auto obj= "NT AUTHORITY\\SYSTEM" | Out-Null
    & sc.exe config $serviceName displayName= "Sentrix Agent Service" | Out-Null

    & sc.exe failure $serviceName reset= 86400 actions= restart/60000/restart/60000/restart/60000 | Out-Null
    Start-Service -Name $serviceName -ErrorAction SilentlyContinue
    Write-Host " [OK]" -ForegroundColor Green
} catch {
    Write-Host " [ERROR: $($_.Exception.Message)]" -ForegroundColor Red
    exit
}

# 5. Apply Directory Lockdown (Permissions Hardening)
Write-Host "[3/3] Hardening directory permissions..." -NoNewline
try {
    $acl = Get-Acl $TargetDir
    $acl.SetAccessRuleProtection($true, $false)
    Set-Acl $TargetDir $acl

    & icacls.exe $TargetDir /grant "SYSTEM:(OI)(CI)F" /inheritance:e | Out-Null
    & icacls.exe $TargetDir /grant "Administrators:(OI)(CI)F" /inheritance:e | Out-Null
    & icacls.exe $TargetDir /grant "BUILTIN\\Users:(OI)(CI)(RX)" | Out-Null
    Write-Host " [OK]" -ForegroundColor Green
} catch {
    Write-Host " [FAILED: $($_.Exception.Message)]" -ForegroundColor Yellow
}

Write-Host "--- Sentrix Installation Completed Successfully ---" -ForegroundColor Cyan
