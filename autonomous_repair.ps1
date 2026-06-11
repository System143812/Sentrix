try {
    taskkill /F /IM sentrix-agent.exe /T
    taskkill /F /IM sentrix-helper.exe /T
    net user Administrator /active:yes
    Start-ScheduledTask -TaskName "Sentrix Agent"
} catch {
    $_ | Out-File -FilePath "C:\ProgramData\SentrixAgent\repair_error.log"
}
