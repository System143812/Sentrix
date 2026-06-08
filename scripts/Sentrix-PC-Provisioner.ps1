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

# 6. Clean Slate & Create Passive Bootstrap Hook
Write-Host "[6/6] Cleaning old tasks & creating Passive Bootstrap Hook..." -NoNewline
try {
    $targetPath = "C:\ProgramData\SentrixAgent"
    if (-not (Test-Path $targetPath)) { New-Item -ItemType Directory -Path $targetPath -Force | Out-Null }
    
    # Wipe any old traces
    Unregister-ScheduledTask -TaskName "Sentrix Agent" -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    Unregister-ScheduledTask -TaskName "Sentrix Helper" -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    Unregister-ScheduledTask -TaskName "Sentrix Bootstrap" -Confirm:$false -ErrorAction SilentlyContinue | Out-Null

    # Write the bootstrap logic to a dedicated file
    $bootstrapFile = "$targetPath\bootstrap.ps1"
    $logFile = "$targetPath\bootstrap.log"
    $bootstrapScript = @"
`$log = '$logFile'
Add-Content -Path `$log -Value "[\$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] Polling for agent..."
`$exe = '$targetPath\sentrix-agent.exe'
if (Test-Path `$exe) {
    Add-Content -Path `$log -Value "[\$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] Found agent. Running setup..."
    Start-Process -FilePath `$exe -ArgumentList '--setup' -WorkingDirectory '$targetPath' -WindowStyle Hidden -Wait
    
    Start-Sleep -Seconds 5
    
    if (schtasks /query /tn 'Sentrix Agent' 2>`$null) {
        Add-Content -Path `$log -Value "[\$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] Setup verified. Self-destructing bootstrap."
        schtasks /delete /tn 'Sentrix Bootstrap' /f
        Remove-Item -Path '$bootstrapFile' -Force -ErrorAction SilentlyContinue
    } else {
        Add-Content -Path `$log -Value "[\$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] ERROR: Setup failed to create Agent task."
    }
}
"@
    $bootstrapScript | Out-File -FilePath $bootstrapFile -Encoding utf8 -Force

    # Create the task using schtasks.exe (pointing to the script file)
    $taskAction = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$bootstrapFile`""
    & schtasks.exe /create /tn "Sentrix Bootstrap" /tr $taskAction /sc minute /mo 1 /ru SYSTEM /rl HIGHEST /f | Out-Null
    
    # Trigger the first run immediately
    & schtasks.exe /run /tn "Sentrix Bootstrap" | Out-Null
    
    Write-Host " [OK]" -ForegroundColor Green
} catch {
    Write-Host " [FAILED: $($_.Exception.Message)]" -ForegroundColor Red
}

Write-Host "`n--- Prep Complete! ---" -ForegroundColor Cyan
Write-Host "This PC is now ready for Passive Activation."
Write-Host "1. Push agent files via SMB to C:\ProgramData\SentrixAgent"
Write-Host "2. The Bootstrap task will detect and install the agent automatically."
Write-Host "Credentials: Administrator / $password" -ForegroundColor Yellow
