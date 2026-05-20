# Sentrix Master Image Prep Script
# Run this as Administrator. It "unlocks" the PC for Zero-Touch deployment.

$ErrorActionPreference = "Stop"

Write-Host "--- Sentrix Master Image Prep Starting ---" -ForegroundColor Cyan

# 1. Enable the built-in Administrator account
Write-Host "[1/5] Enabling built-in Administrator account..." -NoNewline
try {
    Enable-LocalUser -Name "Administrator"
    Write-Host " [OK]" -ForegroundColor Green
} catch {
    Write-Host " [FAILED or Already Enabled]" -ForegroundColor Yellow
}

# 2. Set a password for the Administrator account
# CHANGE THIS to your preferred lab password
$password = "SentrixLab2024!" 
Write-Host "[2/5] Setting Administrator password..." -NoNewline
$admin = [adsi]"WinNT://localhost/Administrator,user"
$admin.SetPassword($password)
Write-Host " [OK]" -ForegroundColor Green

# 3. Disable Remote UAC Filter (LocalAccountTokenFilterPolicy)
# This allows remote admins to have full power over the network.
Write-Host "[3/5] Configuring Remote UAC policy..." -NoNewline
$registryPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System"
$name = "LocalAccountTokenFilterPolicy"
if (-not (Test-Path $registryPath)) { New-Item -Path $registryPath -Force | Out-Null }
New-ItemProperty -Path $registryPath -Name $name -Value 1 -PropertyType DWord -Force | Out-Null
Write-Host " [OK]" -ForegroundColor Green

# 4. Enable PowerShell Remoting (WinRM) & WMI Services
Write-Host "[4/5] Enabling WinRM & WMI services..." -NoNewline
try {
    # Enable WinRM
    Enable-PSRemoting -Force -SkipNetworkProfileCheck | Out-Null
    Set-Service WinRM -StartupType Automatic
    Start-Service WinRM -ErrorAction SilentlyContinue

    # Enable WMI (Required for Admin Push)
    Set-Service WinMgmt -StartupType Automatic
    Start-Service WinMgmt -ErrorAction SilentlyContinue
    
    Write-Host " [OK]" -ForegroundColor Green
} catch {
    Write-Host " [ERROR: $($_.Exception.Message)]" -ForegroundColor Red
}

# 5. Open Firewall Ports (SMB, WMI, WinRM)
Write-Host "[5/5] Opening Firewall Ports (Comprehensive)..." -NoNewline
try {
    # Standard Rules
    $rules = @("WINRM-HTTP-In-TCP", "WINRM-HTTP-In-TCP-PUBLIC", "FPS-SMB-In-TCP", "WMI-In-TCP")
    foreach ($rule in $rules) {
        Enable-NetFirewallRule -Name $rule -ErrorAction SilentlyContinue
    }

    # Broader WMI/RPC Rules (For stubborn firewalls)
    Enable-NetFirewallRule -DisplayGroup "Remote Administration" -ErrorAction SilentlyContinue
    Enable-NetFirewallRule -DisplayGroup "Windows Remote Management" -ErrorAction SilentlyContinue
    Enable-NetFirewallRule -DisplayGroup "Windows Management Instrumentation (WMI)" -ErrorAction SilentlyContinue

    Write-Host " [OK]" -ForegroundColor Green
} catch {
    Write-Host " [FAILED]" -ForegroundColor Yellow
}

Write-Host "`n--- Prep Complete! ---" -ForegroundColor Cyan
Write-Host "This PC is now ready for Zero-Touch deployment."
Write-Host "Use these credentials in the Dashboard: Administrator / $password" -ForegroundColor Yellow
