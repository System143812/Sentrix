$ErrorActionPreference = "SilentlyContinue"
$taskName = "Sentrix Agent"
$installDir = "$env:ProgramData\SentrixAgent"

Stop-ScheduledTask -TaskName $taskName
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
Remove-Item -LiteralPath $installDir -Recurse -Force
Write-Host "Sentrix lightweight agent removed."
