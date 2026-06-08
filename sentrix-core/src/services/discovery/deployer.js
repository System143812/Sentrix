import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { execFile } from "child_process";
import { getPrimaryInterfaceAddress } from "./scanner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execFileAsync = promisify(execFile);

/**
 * Deploys agent files to a host via SMB Administrative Share (C$).
 * Activation is handled passively by the 'Sentrix Bootstrap' task on the client.
 */
async function deployAgentViaSMB(ip, credentials, serverUrl) {
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
    
    \$driveName = "SentrixPush"
    \$ErrorActionPreference = "Stop"

    Write-Host "Mapping administrative share..."
    if (Get-PSDrive \$driveName -ErrorAction SilentlyContinue) { Remove-PSDrive \$driveName -Force }
    New-PSDrive -Name \$driveName -PSProvider FileSystem -Root "\\\\\$ip\\C\$" -Credential \$cred
    
    try {
        \$remotePath = "\${driveName}:\\\\ProgramData\\\\SentrixAgent"
        if (-not (Test-Path \$remotePath)) {
            New-Item -ItemType Directory -Path \$remotePath -Force | Out-Null
        }
        
        Write-Host "Copying agent files..."
        Copy-Item -Path "${agentExePath.replace(/\\/g, "\\\\")}" -Destination "\$remotePath\\sentrix-agent.exe" -Force
        if (Test-Path "${helperExePath.replace(/\\/g, "\\\\")}") {
            Copy-Item -Path "${helperExePath.replace(/\\/g, "\\\\")}" -Destination "\$remotePath\\sentrix-helper.exe" -Force
        }
        if (Test-Path "${assetsPath.replace(/\\/g, "\\\\")}") {
            Copy-Item -Path "${assetsPath.replace(/\\/g, "\\\\")}" -Destination \$remotePath -Recurse -Force
        }
        
        "SENTRIX_SERVER_URL=\$url" | Out-File -FilePath "\$remotePath\\.env" -Encoding utf8
        Write-Host "Files successfully delivered. Passive activation will follow."
    } finally {
        Remove-PSDrive -Name \$driveName -Force -ErrorAction SilentlyContinue
    }
  `;

  try {
    await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", pushScript], { timeout: 60000 });
  } catch (error) {
    let message = error.message;
    const stderr = error.stderr || "";
    
    if (message.includes("Access is denied") || stderr.includes("Access is denied")) {
      message = "Blocked by UAC: Windows restricted remote access. Ensure you have run the 'Sentrix Master Prep' script on the target PC and are using the built-in 'Administrator' account.";
    } else if (message.includes("network name cannot be found") || stderr.includes("network name cannot be found")) {
      message = "PC Offline: The target computer could not be found on the network. Check the IP address and ensure the PC is turned on.";
    } else if (message.includes("logon failure") || message.includes("unknown user name or bad password")) {
      message = "Login Failed: The username or password you entered is incorrect.";
    } else {
      message = `Deployment failed: ${message.split("\n")[0]}`;
    }
    throw new Error(message);
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
    try {
      await deployAgentViaSMB(ip, credentials, serverUrl);
      return { 
        success: true, 
        message: `Successfully pushed agent files to ${ip}. Activation will occur automatically within 60 seconds.`,
        ip 
      };
    } catch (error) {
      return { success: false, message: error.message, ip };
    }
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
      ? `Activation prepared for ${ip}. Provide credentials to push the latest agent files via SMB.`
      : action === "update"
        ? `Update prepared for ${ip}. Provide credentials to redeploy the latest Sentrix Agent build.`
      : `Setup package prepared for ${ip}. Run the standalone agent on the target PC or provide credentials for remote SMB setup.`,
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
