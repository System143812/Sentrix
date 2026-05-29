$ErrorActionPreference = "SilentlyContinue"
$taskName = "Sentrix Agent"
$helperTaskName = "Sentrix Helper"
$installDir = "$env:ProgramData\SentrixAgent"

Stop-ScheduledTask -TaskName $taskName
Stop-ScheduledTask -TaskName $helperTaskName
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
Unregister-ScheduledTask -TaskName $helperTaskName -Confirm:$false
Remove-Item -LiteralPath $installDir -Recurse -Force
Write-Host "Sentrix lightweight agent and helper removed."
