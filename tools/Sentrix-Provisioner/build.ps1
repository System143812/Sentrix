# Sentrix Provisioner Build Script
# Compiles the C# application using MSBuild (comes with .NET Framework)

param(
    [string]$Configuration = "Release",
    [string]$OutputPath = ".\dist"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Sentrix Provisioner Build Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Find MSBuild
$msbuildPaths = @(
    "C:\Program Files\Microsoft Visual Studio\2022\*\MSBuild\Current\Bin\MSBuild.exe",
    "C:\Program Files (x86)\Microsoft Visual Studio\2019\*\MSBuild\Current\Bin\MSBuild.exe",
    "C:\Program Files (x86)\Microsoft Visual Studio\2017\*\MSBuild\15.0\Bin\MSBuild.exe",
    "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\MSBuild.exe",
    "C:\Windows\Microsoft.NET\Framework\v4.0.30319\MSBuild.exe"
)

$msbuild = $null
foreach ($pathPattern in $msbuildPaths) {
    $found = Get-Item $pathPattern -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) {
        $msbuild = $found.FullName
        break
    }
}

if (-not $msbuild) {
    Write-Host "ERROR: MSBuild not found!" -ForegroundColor Red
    Write-Host "Please install .NET Framework 4.8 SDK or Visual Studio" -ForegroundColor Yellow
    exit 1
}

Write-Host "[INFO] Found MSBuild: $msbuild" -ForegroundColor Green

# Build the project
Write-Host ""
Write-Host "[BUILD] Synchronizing provisioner resources..." -ForegroundColor Yellow

$resourcesDir = "$PSScriptRoot\Resources"
if (-not (Test-Path $resourcesDir)) {
    New-Item -ItemType Directory -Path $resourcesDir -Force | Out-Null
}

$sourceScript = "$PSScriptRoot\..\..\scripts\Sentrix-PC-Provisioner.ps1"
$targetScript = "$PSScriptRoot\Resources\provisioner.ps1"
if (-not (Test-Path -LiteralPath $sourceScript -PathType Leaf)) {
    throw "Required source script not found: $sourceScript"
}
Copy-Item -Path $sourceScript -Destination $targetScript -Force
Write-Host " [OK] Synchronized provisioner.ps1" -ForegroundColor Green

$sourceConfig = "$PSScriptRoot\..\..\provisioner-config.json"
$targetConfig = "$PSScriptRoot\Resources\provisioner-config.json"
if (-not (Test-Path -LiteralPath $sourceConfig -PathType Leaf)) {
    throw "Required provisioner configuration not found: $sourceConfig"
}
Copy-Item -Path $sourceConfig -Destination $targetConfig -Force
Write-Host " [OK] Synchronized provisioner-config.json" -ForegroundColor Green

$sourceRemove = "$PSScriptRoot\..\..\remove-sentrix.ps1"
$targetRemove = "$PSScriptRoot\Resources\remove-sentrix.ps1"
if (-not (Test-Path -LiteralPath $sourceRemove -PathType Leaf)) {
    throw "Required remove script not found: $sourceRemove"
}
Copy-Item -Path $sourceRemove -Destination $targetRemove -Force
Write-Host " [OK] Synchronized remove-sentrix.ps1" -ForegroundColor Green

Write-Host "[BUILD] Compiling Sentrix Provisioner..." -ForegroundColor Yellow

$projectFile = "$PSScriptRoot\Sentrix-Provisioner.csproj"

& $msbuild $projectFile /t:Rebuild /p:Configuration=$Configuration /p:OutputPath=$OutputPath /verbosity:minimal /nologo

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  BUILD SUCCESSFUL!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Output: $PSScriptRoot\$OutputPath\Sentrix-Provisioner.exe" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  BUILD FAILED!" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    exit 1
}
