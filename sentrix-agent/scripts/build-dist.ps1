# Build script for Sentrix Agent executable
$ErrorActionPreference = "Stop"

Write-Host "--- Bundling with esbuild ---"
node esbuild.config.js

Write-Host "--- Packaging Agent with pkg ---"
# We package the bundled CJS file
npx pkg dist/bundled-agent.cjs --targets node18-win-x64 --output dist/sentrix-agent.exe

Write-Host "--- Preparing Assets Folder ---"
$distDir = Join-Path $PSScriptRoot "..\dist"
$assetsDir = Join-Path $distDir "assets"
$binHardwareDir = Join-Path $assetsDir "bin\hardware"

# Create directories
if (-not (Test-Path $assetsDir)) { New-Item -ItemType Directory -Path $assetsDir | Out-Null }
if (-not (Test-Path $binHardwareDir)) { New-Item -ItemType Directory -Path $binHardwareDir | Out-Null }

Write-Host "--- Copying Temperature Bridge ---"
Copy-Item "src\services\metrics\temp-bridge.ps1" -Destination $assetsDir -Force

Write-Host "--- Copying Hardware DLLs ---"
Copy-Item "bin\hardware\*.dll" -Destination $binHardwareDir -Force

Write-Host "--- Build Complete: dist\sentrix-agent.exe ---"
