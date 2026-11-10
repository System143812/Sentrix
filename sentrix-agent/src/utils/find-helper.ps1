Get-CimInstance Win32_Process -Filter "Name='sentrix-helper.exe'" | Select-Object ProcessId, SessionId, ExecutablePath, CreationDate | ConvertTo-Json -Compress
