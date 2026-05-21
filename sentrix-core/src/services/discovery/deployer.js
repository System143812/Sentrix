import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { execFile } from "child_process";
import { getPrimaryInterfaceAddress } from "./scanner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execFileAsync = promisify(execFile);

async function deployAgentViaAdminPush(ip, credentials, serverUrl) {
  const agentExePath = path.resolve(__dirname, "../../../../sentrix-agent/dist/sentrix-agent.exe");
  const assetsPath = path.resolve(__dirname, "../../../../sentrix-agent/dist/assets");
  
  if (!fs.existsSync(agentExePath)) {
    throw new Error(`Agent executable not found at ${agentExePath}. Run 'npm run build:exe' in the sentrix-agent directory first.`);
  }

  const { username, password } = credentials;
  const b64 = (str) => Buffer.from(str || "").toString("base64");

  const pushScript = `
    \$ip = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(ip)}'))
    \$user = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(username)}'))
    \$passRaw = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(password)}'))
    \$url = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(serverUrl)}'))
    
    \$pass = \$passRaw | ConvertTo-SecureString -AsPlainText -Force
    \$cred = New-Object System.Management.Automation.PSCredential(\$user, \$pass)
    
    \$targetDir = "C:\\\\ProgramData\\\\SentrixAgent"
    
    Write-Host "Mapping administrative share..."
    \$driveName = "SentrixPush"
    if (Get-PSDrive \$driveName -ErrorAction SilentlyContinue) { Remove-PSDrive \$driveName -Force }
    New-PSDrive -Name \$driveName -PSProvider FileSystem -Root "\\\\\$ip\\C\$" -Credential \$cred -ErrorAction Stop
    
    try {
        \$remotePath = "\${driveName}:\\\\ProgramData\\\\SentrixAgent"
        if (-not (Test-Path \$remotePath)) {
            New-Item -ItemType Directory -Path \$remotePath -Force | Out-Null
        }
        
        Write-Host "Copying agent files..."
        Copy-Item -Path "${agentExePath.replace(/\\/g, "\\\\")}" -Destination "\$remotePath\\sentrix-agent.exe" -Force
        if (Test-Path "${assetsPath.replace(/\\/g, "\\\\")}") {
            Copy-Item -Path "${assetsPath.replace(/\\/g, "\\\\")}" -Destination \$remotePath -Recurse -Force
        }
        
        "SENTRIX_SERVER_URL=\$url" | Out-File -FilePath "\$remotePath\\.env" -Encoding utf8
        
        Write-Host "Triggering remote installation via WMI..."
        \$innerCommand = @"
            \`$dir = 'C:\\ProgramData\\SentrixAgent'
            # Registration and Start
            \`$action = New-ScheduledTaskAction -Execute "\`$dir\\sentrix-agent.exe" -Argument "--server-url $url" -WorkingDirectory \`$dir
            \`$trigger = New-ScheduledTaskTrigger -AtStartup
            \`$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest
            \`$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
            
            # Remove existing task if any
            Unregister-ScheduledTask -TaskName 'Sentrix Agent' -Confirm:\`$false -ErrorAction SilentlyContinue
            
            Register-ScheduledTask -TaskName 'Sentrix Agent' -Action \`$action -Trigger \`$trigger -Principal \`$principal -Settings \`$settings -Force
            Start-ScheduledTask -TaskName 'Sentrix Agent'
            
            # Lockdown Phase: Re-secure the machine
            Write-Host 'Securing machine...'
            Disable-LocalUser -Name 'Administrator' -ErrorAction SilentlyContinue
            Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System' -Name 'LocalAccountTokenFilterPolicy' -Value 0 -ErrorAction SilentlyContinue
            \`$rules = @('WINRM-HTTP-In-TCP', 'WINRM-HTTP-In-TCP-PUBLIC', 'FPS-SMB-In-TCP', 'WMI-In-TCP')
            foreach (\$rule in \$rules) { Disable-NetFirewallRule -Name \$rule -ErrorAction SilentlyContinue }
"@
        
        $encodedCommand = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($innerCommand))
        $commandLine = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand $encodedCommand"
        
        try {
            \$result = Invoke-WmiMethod -Path Win32_Process -Name Create -ArgumentList \$commandLine -ComputerName \$ip -Credential \$cred
            if (\$result.ReturnValue -ne 0) {
                throw "Failed to start remote installation process via WMI. ReturnValue: \$(\$result.ReturnValue)"
            }
        } catch {
            if (\$_.Exception.Message -match "RPC server is unavailable") {
                Write-Host "Note: Connection closed during lockdown (Graceful Disconnect). This is expected as the firewall is now secured."
            } else {
                throw \$_
            }
        }
    } finally {
        Remove-PSDrive -Name \$driveName -Force -ErrorAction SilentlyContinue
    }
  `;

  try {
    await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", pushScript], { timeout: 90000 });
  } catch (error) {
    const stderr = error.stderr ? `\nStderr: ${error.stderr}` : "";
    throw new Error(`${error.message}${stderr}`);
  }
}

export async function deployAgentToHostRemote(ip, credentials = null) {
  const serverUrl = process.env.SENTRIX_PUBLIC_SERVER_URL
    || process.env.CORE_PUBLIC_URL
    || process.env.BACKEND_URL
    || `http://${getPrimaryInterfaceAddress() || "localhost"}:${process.env.PORT || 4000}`;

  if (!credentials) {
    return {
      success: false,
      message: "Credentials are required for remote deployment.",
      needsCredentials: true,
      ip
    };
  }

  try {
    const { username, password } = credentials;
    const agentExePath = path.resolve(__dirname, "../../../../sentrix-agent/dist/sentrix-agent.exe");
    const assetsPath = path.resolve(__dirname, "../../../../sentrix-agent/dist/assets");

    if (!fs.existsSync(agentExePath)) {
      throw new Error(`Agent executable not found at ${agentExePath}. Run 'npm run build:exe' in the sentrix-agent directory first.`);
    }

    const b64 = (str) => Buffer.from(str || "").toString("base64");

    const winrmScript = `
      \$ip = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(ip)}'))
      \$user = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(username)}'))
      \$passRaw = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(password)}'))
      \$url = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(serverUrl)}'))

      \$pass = \$passRaw | ConvertTo-SecureString -AsPlainText -Force
      \$cred = New-Object System.Management.Automation.PSCredential(\$user, \$pass)
      
      try {
          \$localIsAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
          if (\$localIsAdmin) {
              \$currentTrusted = (Get-Item WSMan:\\localhost\\Client\\TrustedHosts).Value
              \$trustedList = if (\$currentTrusted) { \$currentTrusted.Split(',') } else { @() }
              if (\$trustedList -notcontains \$ip -and \$currentTrusted -ne '*') {
                  \$newTrusted = if (\$currentTrusted) { "\$currentTrusted,\$ip" } else { \$ip }
                  Set-Item WSMan:\\localhost\\Client\\TrustedHosts -Value \$newTrusted -Force
              }
          }
      } catch {
      }

      \$targetDir = "C:\\\\ProgramData\\\\SentrixAgent"
      \$session = New-PSSession -ComputerName \$ip -Credential \$cred -ErrorAction Stop

      try {
          Invoke-Command -Session \$session -ScriptBlock {
              param(\$dir)
              if (-not (Test-Path \$dir)) { New-Item -ItemType Directory -Path \$dir -Force }
          } -ArgumentList \$targetDir

          Copy-Item -Path "${agentExePath.replace(/\\/g, "\\\\")}" -Destination "\$targetDir\\\\sentrix-agent.exe" -ToSession \$session
          if (Test-Path "${assetsPath.replace(/\\/g, "\\\\")}") {
              Copy-Item -Path "${assetsPath.replace(/\\/g, "\\\\")}" -Destination "\$targetDir" -Recurse -Force -ToSession \$session
          }

          Invoke-Command -Session \$session -ScriptBlock {
              param(\$dir, \$u)
              \$envContent = "SENTRIX_SERVER_URL=\$u"
              \$envContent | Out-File -FilePath "\$dir\\.env" -Encoding utf8
              
              \$action = New-ScheduledTaskAction -Execute "\$dir\\sentrix-agent.exe" -Argument "--server-url \$u" -WorkingDirectory \$dir
              \$trigger = New-ScheduledTaskTrigger -AtStartup
              \$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
              \$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
              
              # Remove existing task if any
              Unregister-ScheduledTask -TaskName "Sentrix Agent" -Confirm:\$false -ErrorAction SilentlyContinue
              
              Register-ScheduledTask -TaskName "Sentrix Agent" -Action \$action -Trigger \$trigger -Principal \$principal -Settings \$settings -Force
              Start-ScheduledTask -TaskName "Sentrix Agent"

              # Lockdown Phase: Re-secure the machine
              Disable-LocalUser -Name "Administrator" -ErrorAction SilentlyContinue
              Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" -Name "LocalAccountTokenFilterPolicy" -Value 0 -ErrorAction SilentlyContinue
              \$rules = @("WINRM-HTTP-In-TCP", "WINRM-HTTP-In-TCP-PUBLIC", "FPS-SMB-In-TCP", "WMI-In-TCP")
              foreach (\$rule in \$rules) { Disable-NetFirewallRule -Name \$rule -ErrorAction SilentlyContinue }
          } -ArgumentList \$targetDir, \$url
      } finally {
          Remove-PSSession \$session
      }
    `;

    try {
      await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", winrmScript], { timeout: 60000 });
    } catch (error) {
      const stderr = error.stderr ? `\nStderr: ${error.stderr}` : "";
      let enhancedMessage = error.message;
      if (stderr.includes("ServerNotTrusted") || stderr.includes("TrustedHosts")) {
        enhancedMessage = "WinRM Trust Error: Your server PC does not trust the target machine. START YOUR TERMINAL AS ADMINISTRATOR, or run 'Set-Item WSMan:\\localhost\\Client\\TrustedHosts -Value \"*\" -Force' in an Admin PowerShell once.";
      }
      throw new Error(`${enhancedMessage}${stderr}`);
    }
    return { success: true, message: `Successfully deployed agent to ${ip} via WinRM`, ip };
  } catch (winrmError) {
    try {
      await deployAgentViaAdminPush(ip, credentials, serverUrl);
      return { success: true, message: `Successfully deployed agent to ${ip} via Zero-Touch Admin Push`, ip };
    } catch (pushError) {
      let message = pushError.message;
      if (message.includes("Access is denied")) {
        message = "Blocked by UAC: Windows restricted remote access. Ensure you have run the 'Sentrix Master Prep' script on the target PC and are using the built-in 'Administrator' account.";
      } else if (message.includes("network name cannot be found")) {
        message = "PC Offline: The target computer could not be found on the network. Check the IP address and ensure the PC is turned on.";
      } else if (message.includes("RPC server is unavailable")) {
        message = "Firewall Blocked (RPC/WMI): The WMI service is blocked by the target PC's firewall. Run the UPDATED 'Sentrix Master Prep' script on the target PC to open the necessary ports and start WMI.";
      } else if (message.includes("logon failure") || message.includes("unknown user name or bad password")) {
        message = "Login Failed: The username or password you entered is incorrect.";
      } else if (message.includes("WinRM client cannot process the request")) {
        message = "WinRM Disabled: Remote management is not enabled on the target PC. Run the 'Sentrix Master Prep' script to enable WinRM and TrustedHosts.";
      } else {
        message = `Deployment failed: ${message.split("\n")[0]}`;
      }

      return { success: false, message, ip };
    }
  }
}

export async function deployAgentToHost(ip, lastScanResults, credentials = null) {
  const scannedDevice = lastScanResults.get(ip);
  const serverUrl = process.env.SENTRIX_PUBLIC_SERVER_URL
    || process.env.CORE_PUBLIC_URL
    || process.env.BACKEND_URL
    || `http://${getPrimaryInterfaceAddress() || "localhost"}:${process.env.PORT || 4000}`;

  if (credentials) {
    return await deployAgentToHostRemote(ip, credentials);
  }

  if (!scannedDevice) {
    return {
      success: false,
      message: "Manual deployment requires credentials. Otherwise, deployment is only available for devices found in the latest scan.",
      ip,
    };
  }

  return {
    success: true,
    message: `Deployment package prepared for ${ip}. Run the standalone agent on the target PC or provide credentials for remote deployment.`,
    ip,
    device: scannedDevice,
    serverUrl,
    installer: {
      type: "standalone-exe",
      agent: "sentrix-agent/dist/sentrix-agent.exe",
      command: `sentrix-agent.exe --server-url "${serverUrl}"`,
    },
  };
}
