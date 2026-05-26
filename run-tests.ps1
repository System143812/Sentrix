Write-Host "--- Starting Sentrix Test Suite ---" -ForegroundColor Cyan

$projects = @("sentrix-agent", "sentrix-core", "sentrix-dashboard")
$failedCount = 0

foreach ($project in $projects) {
    Write-Host ""
    Write-Host "[Project: $project] Running tests..." -ForegroundColor Yellow
    
    # Run npm test and capture output/exit code
    # We use --silent to keep it clean, but the user wants detailed logs.
    # So we'll run it normally.
    npm test --prefix $project
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[Project: $project] Result: FAILED" -ForegroundColor Red
        $failedCount++
    } else {
        Write-Host "[Project: $project] Result: PASSED" -ForegroundColor Green
    }
}

Write-Host ""
if ($failedCount -gt 0) {
    Write-Host "Total Failures: $failedCount" -ForegroundColor Red
    Write-Host "Test Suite Failed" -ForegroundColor Red
    exit 1
} else {
    Write-Host "All Projects Passed!" -ForegroundColor Green
    Write-Host "Test Suite Successful" -ForegroundColor Green
    exit 0
}
