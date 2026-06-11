$log = "C:\ProgramData\SentrixAgent\unlock_test.log"
"Starting unlock test at $(Get-Date)" | Out-File -FilePath $log
try {
    $out = net user Administrator /active:yes 2>&1
    "Output: $out" | Out-File -FilePath $log -Append
    $status = net user Administrator | Select-String "Account active"
    "Status: $status" | Out-File -FilePath $log -Append
} catch {
    "Error: $_" | Out-File -FilePath $log -Append
}
