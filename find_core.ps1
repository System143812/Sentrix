Get-WmiObject Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*sentrix-core*" } | Select-Object ProcessId, CommandLine | ConvertTo-Json
