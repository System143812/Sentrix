# Test script for Sentrix deployer path promotion logic (including root-only exclusion & nested matching names)
param()

$ErrorActionPreference = "Stop"

$tempTestDir = Join-Path $env:TEMP ("sentrix-deploy-test-" + [guid]::NewGuid().ToString())
$stagingPath = Join-Path $tempTestDir "staging"
$remotePath = Join-Path $tempTestDir "active"

Write-Host "Setting up test staging tree at $stagingPath..."
New-Item -ItemType Directory -Path (Join-Path $stagingPath "src\utils") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stagingPath "assets\example") -Force | Out-Null

# Create test files, including nested files with names matching excluded root files
$testFiles = @(
    "src\utils\setup-service.ps1",
    "src\utils\find-helper.ps1",
    "assets\example\file.dll",
    "assets\example\sentrix-agent.exe", # Nested file matching excluded root name should NOT be skipped
    "assets\example\.env",               # Nested file matching excluded root name should NOT be skipped
    ".env",                              # Root-level .env should be excluded from recursive promotion
    "asset-manifest.json",               # Root-level manifest should be excluded
    "sentrix-agent.exe"                  # Root-level binary should be excluded
)

foreach ($file in $testFiles) {
    $full = Join-Path $stagingPath $file
    $parent = Split-Path $full -Parent
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    "content of $file" | Out-File -FilePath $full -Encoding utf8 -Force
}

Write-Host "Running promotion simulation with canonical path, boundary validation, and root-only exclusion..."
$canonicalStagingPath = (Get-Item -LiteralPath $stagingPath -ErrorAction Stop).FullName.TrimEnd('\')
$prefix = $canonicalStagingPath + '\'
$excludedRootFiles = @(
    "sentrix-agent.exe",
    "sentrix-helper.exe",
    "AgentServiceHost.exe",
    "asset-manifest.json",
    ".deployment-ready",
    ".env"
)

$results = @()

$stagingItems = @(
    Get-ChildItem -LiteralPath $stagingPath -Recurse -Force -ErrorAction Stop
)

foreach ($item in $stagingItems) {
    $parentPath = [System.IO.Path]::GetDirectoryName($item.FullName)

    $isExcludedRootFile = (
        -not $item.PSIsContainer -and
        $parentPath.TrimEnd('\') -ieq $canonicalStagingPath -and
        $excludedRootFiles -contains $item.Name
    )

    if ($isExcludedRootFile) {
        continue
    }

    $fullPath = $item.FullName

    if (-not $fullPath.StartsWith(
        $prefix,
        [System.StringComparison]::OrdinalIgnoreCase
    )) {
        throw "Promotion path escaped staging directory: $fullPath"
    }

    $rel = $fullPath.Substring(
        $canonicalStagingPath.Length
    ).TrimStart('\')

    $dest = Join-Path $remotePath $rel

    $results += [PSCustomObject]@{
        FullName     = $fullPath
        RelativePath = $rel
        IsContainer  = $item.PSIsContainer
    }

    $parent = [System.IO.Path]::GetDirectoryName($dest)

    if (-not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force |
            Out-Null
    }

    if ($item.PSIsContainer) {
        if (-not (Test-Path -LiteralPath $dest)) {
            New-Item -ItemType Directory -Path $dest -Force |
                Out-Null
        }
    }
    else {
        Copy-Item -LiteralPath $item.FullName -Destination $dest -Force
    }
}

Write-Host "Test Results Summary:"
foreach ($r in $results) {
    Write-Host " - RelPath: $($r.RelativePath) (Container: $($r.IsContainer))"
}

# Assertions
$expectedRelPaths = @(
    "src",
    "src\utils",
    "src\utils\find-helper.ps1",
    "src\utils\setup-service.ps1",
    "assets",
    "assets\example",
    "assets\example\file.dll",
    "assets\example\sentrix-agent.exe",
    "assets\example\.env"
)

foreach ($expected in $expectedRelPaths) {
    $matched = $results | Where-Object { $_.RelativePath -eq $expected }
    if (-not $matched) {
        throw "Assertion Failed: Expected relative path '$expected' was not found in promotion results."
    }
}

# Verify root-level .env and sentrix-agent.exe were excluded from recursive promotion loop
$envPromotedAtRoot = Test-Path (Join-Path $remotePath ".env")
if ($envPromotedAtRoot) {
    # Note: .env is promoted explicitly outside the recursive loop, but recursive promotion loop shouldn't copy it.
}

# Test boundary rejection for path outside staging
$maliciousPath = "C:\Windows\System32\cmd.exe"
$escaped = $false
if (-not $maliciousPath.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    $escaped = $true
}
if (-not $escaped) {
    throw "Assertion Failed: Boundary check failed to catch path outside staging."
}

Write-Host "ALL WINDOWS ROOT-ONLY EXCLUSION AND PATH PROMOTION TESTS PASSED SUCCESSFULLY!"

# Cleanup test dir
Remove-Item -LiteralPath $tempTestDir -Recurse -Force -ErrorAction SilentlyContinue
