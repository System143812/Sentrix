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
  const helperExePath = path.resolve(__dirname, "../../../../sentrix-agent/dist/sentrix-helper.exe");
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
    
    \$ErrorActionPreference = "Stop"

    Write-Host "Mapping administrative share..."
    \$driveName = "SentrixPush"
    if (Get-PSDrive \$driveName -ErrorAction SilentlyContinue) { Remove-PSDrive \$driveName -Force }
    New-PSDrive -Name \$driveName -PSProvider FileSystem -Root "\\\\\$ip\\C\$" -Credential \$cred
    
    try {
        \$remotePath = "\${driveName}:\\\\ProgramData\\\\SentrixAgent"
        if (-not (Test-Path \$remotePath)) {
            New-Item -ItemType Directory -Path \$remotePath -Force | Out-Null
        }
        
        Write-Host "Stopping existing agent and helper if running..."
        \$innerStopCommand = @"
            Stop-ScheduledTask -TaskName 'Sentrix Agent' -ErrorAction SilentlyContinue
            Stop-ScheduledTask -TaskName 'Sentrix Helper' -ErrorAction SilentlyContinue
            Get-Process -Name 'sentrix-agent' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
            Get-Process -Name 'sentrix-helper' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
"@
        \$stopEncoded = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes(\$innerStopCommand))
        try {
            Invoke-WmiMethod -Path Win32_Process -Name Create -ArgumentList "powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand \$stopEncoded" -ComputerName \$ip -Credential \$cred | Out-Null
            Start-Sleep -Seconds 2
        } catch {}

        Write-Host "Copying agent files..."
        Copy-Item -Path "${agentExePath.replace(/\\/g, "\\\\")}" -Destination "\$remotePath\\sentrix-agent.exe" -Force
        if (Test-Path "${helperExePath.replace(/\\/g, "\\\\")}") {
            Copy-Item -Path "${helperExePath.replace(/\\/g, "\\\\")}" -Destination "\$remotePath\\sentrix-helper.exe" -Force
        }
        if (Test-Path "${assetsPath.replace(/\\/g, "\\\\")}") {
            Copy-Item -Path "${assetsPath.replace(/\\/g, "\\\\")}" -Destination \$remotePath -Recurse -Force
        }
        
        "SENTRIX_SERVER_URL=\$url" | Out-File -FilePath "\$remotePath\\.env" -Encoding utf8
        
        Write-Host "Triggering remote installation via WMI..."
        \$innerCommand = @"
            \`$dir = 'C:\\ProgramData\\SentrixAgent'
            
            # 1. Main Agent Registration
            \`$action = New-ScheduledTaskAction -Execute "\`$dir\\sentrix-agent.exe" -Argument "--server-url $url" -WorkingDirectory \`$dir
            \`$trigger = New-ScheduledTaskTrigger -AtStartup
            \`$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest
            \`$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
            
            Unregister-ScheduledTask -TaskName 'Sentrix Agent' -Confirm:\`$false -ErrorAction SilentlyContinue
            Register-ScheduledTask -TaskName 'Sentrix Agent' -Action \`$action -Trigger \`$trigger -Principal \`$principal -Settings \`$settings -Force
            Start-ScheduledTask -TaskName 'Sentrix Agent'

            # 2. Helper Registration (User Session)
            if (Test-Path "\`$dir\\sentrix-helper.exe") {
                \`$hAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -Command \`"\`$d = '\`$dir'; Start-Process -FilePath \`"\`$d\sentrix-helper.exe\`" -WindowStyle Hidden\`"" -WorkingDirectory \`$dir
                \`$hTrigger = New-ScheduledTaskTrigger -AtLogOn
                \`$hPrincipal = New-ScheduledTaskPrincipal -GroupId 'Users' -RunLevel Highest
                \`$hSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Days 0)
                
                Unregister-ScheduledTask -TaskName 'Sentrix Helper' -Confirm:\`$false -ErrorAction SilentlyContinue
                Register-ScheduledTask -TaskName 'Sentrix Helper' -Action \`$hAction -Trigger \`$hTrigger -Principal \`$hPrincipal -Settings \`$hSettings -Force
                Start-ScheduledTask -TaskName 'Sentrix Helper' -ErrorAction SilentlyContinue
            }
            
            # Lockdown Phase: Re-secure the machine (Grace period for agent startup)
            Write-Host 'Ensuring agent connectivity before lockdown...'
            Start-Sleep -Seconds 10

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
    || `https://${getPrimaryInterfaceAddress() || "localhost"}:${process.env.PORT || 4000}`;

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
    const helperExePath = path.resolve(__dirname, "../../../../sentrix-agent/dist/sentrix-helper.exe");
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
      
      \$ErrorActionPreference = "Stop"

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
      \$session = New-PSSession -ComputerName \$ip -Credential \$cred

      try {
          Invoke-Command -Session \$session -ScriptBlock {
              param(\$dir)
              if (-not (Test-Path \$dir)) { New-Item -ItemType Directory -Path \$dir -Force }
              
              Write-Host "Stopping existing agent and helper if running..."
              Stop-ScheduledTask -TaskName "Sentrix Agent" -ErrorAction SilentlyContinue
              Stop-ScheduledTask -TaskName "Sentrix Helper" -ErrorAction SilentlyContinue
              Get-Process -Name "sentrix-agent" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
              Get-Process -Name "sentrix-helper" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
              Start-Sleep -Seconds 2
          } -ArgumentList \$targetDir

          Copy-Item -Path "${agentExePath.replace(/\\/g, "\\\\")}" -Destination "\$targetDir\\\\sentrix-agent.exe" -ToSession \$session
          if (Test-Path "${helperExePath.replace(/\\/g, "\\\\")}") {
              Copy-Item -Path "${helperExePath.replace(/\\/g, "\\\\")}" -Destination "\$targetDir\\\\sentrix-helper.exe" -ToSession \$session
          }
          if (Test-Path "${assetsPath.replace(/\\/g, "\\\\")}") {
              Copy-Item -Path "${assetsPath.replace(/\\/g, "\\\\")}" -Destination "\$targetDir" -Recurse -Force -ToSession \$session
          }

          Invoke-Command -Session \$session -ScriptBlock {
              param(\$dir, \$u)
              \$envContent = "SENTRIX_SERVER_URL=\$u"
              \$envContent | Out-File -FilePath "\$dir\\.env" -Encoding utf8
              
              # 1. Main Agent Registration
              \$action = New-ScheduledTaskAction -Execute "\$dir\\sentrix-agent.exe" -Argument "--server-url \$u" -WorkingDirectory \$dir
              \$trigger = New-ScheduledTaskTrigger -AtStartup
              \$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
              \$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
              
              # Remove existing task if any
              Unregister-ScheduledTask -TaskName "Sentrix Agent" -Confirm:\$false -ErrorAction SilentlyContinue
              
              Register-ScheduledTask -TaskName "Sentrix Agent" -Action \$action -Trigger \$trigger -Principal \$principal -Settings \$settings -Force
              Start-ScheduledTask -TaskName "Sentrix Agent"

              # 2. Helper Registration (User Session)
              if (Test-Path "\$dir\\sentrix-helper.exe") {
                  \$hAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -Command \`"Start-Process -FilePath '\$dir\\sentrix-helper.exe' -WorkingDirectory '\$dir' -WindowStyle Hidden\`""
                  \$hTrigger = New-ScheduledTaskTrigger -AtLogOn
                  \$hPrincipal = New-ScheduledTaskPrincipal -GroupId "Users" -RunLevel Highest
                  \$hSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Days 0)
                  \$hSettings.Hidden = \$true
                  
                  Unregister-ScheduledTask -TaskName "Sentrix Helper" -Confirm:\$false -ErrorAction SilentlyContinue
                  Register-ScheduledTask -TaskName "Sentrix Helper" -Action \$hAction -Trigger \$hTrigger -Principal \$hPrincipal -Settings \$hSettings -Force
                  Start-ScheduledTask -TaskName "Sentrix Helper" -ErrorAction SilentlyContinue
              }

              # Lockdown Phase: Re-secure the machine (Grace period for agent startup)
              Start-Sleep -Seconds 10

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

export async function deployAgentToHost(ip, lastScanResults, credentials = null, options = {}) {
  const scannedDevice = lastScanResults.get(ip);
  const action = ["activate", "update"].includes(options.action) ? options.action : "deploy";
  const serverUrl = process.env.SENTRIX_PUBLIC_SERVER_URL
    || process.env.CORE_PUBLIC_URL
    || process.env.BACKEND_URL
    || `https://${getPrimaryInterfaceAddress() || "localhost"}:${process.env.PORT || 4000}`;

  if (credentials) {
    const result = await deployAgentToHostRemote(ip, credentials);
    if (result.success && action === "activate") {
      return {
        ...result,
        message: `Agent activation started for ${ip}. Sentrix will start the existing scheduled task when present or install a fresh agent if needed.`,
      };
    }
    if (result.success && action === "update") {
      return {
        ...result,
        message: `Agent update started for ${ip}. Sentrix will replace the current agent build and restart the scheduled task.`,
      };
    }
    return result;
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
    message: action === "activate"
      ? `Activation prepared for ${ip}. Provide credentials to start the existing Sentrix Agent task or reinstall it if missing.`
      : action === "update"
        ? `Update prepared for ${ip}. Provide credentials to redeploy the latest Sentrix Agent build.`
      : `Setup package prepared for ${ip}. Run the standalone agent on the target PC or provide credentials for remote setup.`,
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
