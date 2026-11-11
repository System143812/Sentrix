# Build script for Sentrix Agent executable
$ErrorActionPreference = "Stop"

Write-Host "--- Bundling with esbuild ---"
node esbuild.config.js

Write-Host "--- Packaging Agents with pkg ---"
# Package headless agent
npx pkg dist/headless.js --targets node18-win-x64 --output dist/sentrix-agent.exe
# Package helper agent
npx pkg dist/helper.js --targets node18-win-x64 --output dist/sentrix-helper.exe

Write-Host "--- Compiling C# Executables ---"

$cscPath = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $cscPath)) {
    $cscPath = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
}

if (-not (Test-Path $cscPath)) {
    throw "Required C# compiler (csc.exe) not found. Build cannot continue."
}

$agentRoot = Split-Path -Parent $PSScriptRoot

# Compile AgentServiceHost.exe
$serviceHostSource = Join-Path $agentRoot "src\utils\AgentServiceHost.cs"
$serviceHostOutput = Join-Path $agentRoot "dist\AgentServiceHost.exe"

Write-Host "--- Compiling AgentServiceHost.exe ---"

if (-not (Test-Path $serviceHostSource)) {
    throw "AgentServiceHost source not found: $serviceHostSource"
}

& $cscPath /nologo /target:winexe "/out:$serviceHostOutput" $serviceHostSource

if ($LASTEXITCODE -ne 0) {
    throw "AgentServiceHost.exe compilation failed with exit code $LASTEXITCODE."
}

Write-Host "AgentServiceHost.exe compiled successfully."

# Compile SessionLauncher.exe
$sessionLauncherSource = Join-Path $agentRoot "src\utils\SessionLauncher.cs"
$sessionLauncherOutput = Join-Path $agentRoot "src\utils\SessionLauncher.exe"

Write-Host "--- Compiling SessionLauncher.exe ---"

if (-not (Test-Path $sessionLauncherSource)) {
    throw "SessionLauncher source not found: $sessionLauncherSource"
}

& $cscPath /nologo /target:exe "/out:$sessionLauncherOutput" $sessionLauncherSource

if ($LASTEXITCODE -ne 0) {
    throw "SessionLauncher.exe compilation failed with exit code $LASTEXITCODE."
}

Write-Host "SessionLauncher.exe compiled successfully."

Write-Host "--- Preparing Assets Folder ---"
$distDir = Join-Path $PSScriptRoot "..\dist"
$assetsDir = Join-Path $distDir "assets"
$binHardwareDir = Join-Path $assetsDir "bin\hardware"
$modulesDestDir = Join-Path $assetsDir "Modules"

# Create directories
if (-not (Test-Path $assetsDir)) { New-Item -ItemType Directory -Path $assetsDir | Out-Null }
if (-not (Test-Path $binHardwareDir)) { New-Item -ItemType Directory -Path $binHardwareDir | Out-Null }
if (-not (Test-Path $modulesDestDir)) { New-Item -ItemType Directory -Path $modulesDestDir | Out-Null }

Write-Host "--- Copying Temperature Bridge ---"
Copy-Item "src\services\metrics\temp-bridge.ps1" -Destination $assetsDir -Force
foreach ($img in @("sentrix-dark.png", "sentrix-white.png", "sentrix-dark.ico", "sentrix-white.ico", "sentrix-dark.jpg", "sentrix-white.jpg", "sentrix-logo.png")) {
    $srcImg = Join-Path "src\assets" $img
    if (Test-Path $srcImg) {
        Copy-Item $srcImg -Destination $assetsDir -Force
    }
}

Write-Host "--- Copying Hardware DLLs ---"
Copy-Item "bin\hardware\*.dll" -Destination $binHardwareDir -Force

Write-Host "--- Copying Modules ---"
if (Test-Path "Modules") {
    Copy-Item "Modules\*" -Destination $modulesDestDir -Recurse -Force
}

Write-Host "--- Copying Source Utilities & SessionLauncher ---"
$distSrcDir = Join-Path $distDir "src"
if (-not (Test-Path $distSrcDir)) { New-Item -ItemType Directory -Path $distSrcDir | Out-Null }
Copy-Item "src\utils" -Destination $distSrcDir -Recurse -Force

Write-Host "--- Packaging dist folder into sentrix-agent-dist.zip ---"
$zipPath = Join-Path $distDir "sentrix-agent-dist.zip"
$tempZipPath = Join-Path $agentRoot "sentrix-agent-dist-temp.zip"

if (Test-Path $tempZipPath) { Remove-Item $tempZipPath -Force }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$zipSourceDir = Join-Path $agentRoot "dist_zip_temp"
if (Test-Path $zipSourceDir) { Remove-Item $zipSourceDir -Recurse -Force }
Copy-Item $distDir -Destination $zipSourceDir -Recurse -Force

$serviceHostInZip = Join-Path $zipSourceDir "AgentServiceHost.exe"
if (Test-Path $serviceHostInZip) { Remove-Item $serviceHostInZip -Force }

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($zipSourceDir, $tempZipPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)

try { Remove-Item $zipSourceDir -Recurse -Force } catch { }

Move-Item $tempZipPath $zipPath -Force

Write-Host "dist.zip created successfully at $zipPath"

Write-Host "--- Build Complete: dist\sentrix-agent.exe & sentrix-agent-dist.zip ---"
