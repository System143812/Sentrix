$headers = @{ "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Ijk5Y2RmZmM2LTQ5YTUtMTFmMS05MzQ0LWI0YjUyZjgyZDgyNSIsImVtYWlsIjoiYWRtaW5AZXhhbXBsZS5jb20iLCJyb2xlIjoibmV0d29ya19hZG1pbiIsImlhdCI6MTc4MTEyNzcwNywiZXhwIjoxNzgxMTU2NTA3fQ.1X8BxmWwyYSRR_QG9z0YejAw_0w7EfCJruM5XNiMZm4"; "X-Requested-With" = "XMLHttpRequest" }
$url = "https://localhost:4000/api/clients/b12d75e6-b63f-4c37-8495-a0eb655f598a"
$commandUrl = "$url/command"

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }

while ($true) {
    try {
        $res = Invoke-RestMethod -Uri $url -Method Get -Headers $headers
        $status = $res.data.status
        Write-Host "Agent is $status..."
        
        if ($status -eq "online") {
            Write-Host "Agent ONLINE! Triggering update..."
            $body = @{ command = "update" }
            $res = Invoke-RestMethod -Uri $commandUrl -Method Post -Headers $headers -Body ($body | ConvertTo-Json) -ContentType "application/json"
            Write-Host "Update Triggered: $($res.message)"
            break
        }
    } catch {
        Write-Host "Error checking status: $($_.Exception.Message)"
    }
    Start-Sleep -Seconds 5
}
