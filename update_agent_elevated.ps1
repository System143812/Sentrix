Stop-Process -Name sentrix-agent -Force -ErrorAction SilentlyContinue
Stop-Process -Name sentrix-helper -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Copy-Item 'C:\Users\Gabby\Desktop\Sentrix\Sentrix\sentrix-agent\dist\sentrix-agent.exe' -Destination 'C:\ProgramData\SentrixAgent\sentrix-agent.exe' -Force
Copy-Item 'C:\Users\Gabby\Desktop\Sentrix\Sentrix\sentrix-agent\dist\sentrix-helper.exe' -Destination 'C:\ProgramData\SentrixAgent\sentrix-helper.exe' -Force
Copy-Item 'C:\Users\Gabby\Desktop\Sentrix\Sentrix\sentrix-agent\dist\assets\*' -Destination 'C:\ProgramData\SentrixAgent\assets\' -Recurse -Force
Start-ScheduledTask -TaskName 'Sentrix Agent' -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName 'Sentrix Helper' -ErrorAction SilentlyContinue
