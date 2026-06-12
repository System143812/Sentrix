import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { execFile } from "child_process";
import { getPrimaryInterfaceAddress } from "./scanner.js";
import { generateProvisioningToken } from "../security.service.js";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execFileAsync = promisify(execFile);

/**
 * Deploys agent files to a host via SMB Administrative Share (C$).
 * Activation is handled passively by the 'Sentrix Bootstrap' task on the client.
 */
async function deployAgentViaSMB(ip, credentials, serverUrl, agentId, token) {
  const agentExePath = path.resolve(__dirname, "../../../../sentrix-agent/dist/sentrix-agent.exe");
  const helperExePath = path.resolve(__dirname, "../../../../sentrix-agent/dist/sentrix-helper.exe");
  const assetsPath = path.resolve(__dirname, "../../../../sentrix-agent/dist/assets");
  
  if (!fs.existsSync(agentExePath)) {
    throw new Error(`Agent executable not found at ${agentExePath}. Run 'npm run build:exe' in the sentrix-agent directory first.`);
  }

  const username = credentials.user || credentials.username;
  const password = credentials.pass || credentials.password;
  
  if (!username || !password) {
    throw new Error("Invalid credentials provided. Both username and password are required.");
  }

  const b64 = (str) => Buffer.from(str || "").toString("base64");

  const pushScript = `
    \$ip = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(ip)}'))
    \$user = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(username)}'))
    \$passRaw = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(password)}'))
    \$url = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(serverUrl)}'))
    \$id = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(agentId)}'))
    \$token = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(token)}'))
    
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
        \$targetExe = "\$remotePath\\sentrix-agent.exe"
        try {
            Copy-Item -Path "${agentExePath.replace(/\\/g, "\\\\")}" -Destination "\$targetExe" -Force
        } catch {
            Write-Host "Agent is currently running (locked). Copying as update package..."
            Copy-Item -Path "${agentExePath.replace(/\\/g, "\\\\")}" -Destination "\$remotePath\\sentrix-agent-update.exe" -Force
        }

        if (Test-Path "${helperExePath.replace(/\\/g, "\\\\")}") {
            \$targetHelper = "\$remotePath\\sentrix-helper.exe"
            try {
                Copy-Item -Path "${helperExePath.replace(/\\/g, "\\\\")}" -Destination "\$targetHelper" -Force
            } catch {
                Copy-Item -Path "${helperExePath.replace(/\\/g, "\\\\")}" -Destination "\$remotePath\\sentrix-helper-update.exe" -Force
            }
        }
        if (Test-Path "${assetsPath.replace(/\\/g, "\\\\")}") {
            Copy-Item -Path "${assetsPath.replace(/\\/g, "\\\\")}" -Destination \$remotePath -Recurse -Force
        }
        
        \$envContent = "SENTRIX_SERVER_URL=\$url\`nSENTRIX_AGENT_ID=\$id"
        if (\$token) {
            \$envContent += "\`nSENTRIX_PROVISIONING_TOKEN=\$token"
        }
        
        \$envContent | Out-File -FilePath "\$remotePath\\.env" -Encoding utf8
        Write-Host "Files successfully delivered. Passive activation will follow."
    } finally {
        Remove-PSDrive -Name \$driveName -Force -ErrorAction SilentlyContinue
    }
  `;

  try {
    await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", pushScript], { timeout: 60000 });
  } catch (error) {
    const stderr = error.stderr || "";
    let message = error.message;

    if (stderr.includes("Access is denied") || message.includes("Access is denied")) {
      message = "Blocked by UAC: Windows restricted remote access. Ensure you have run the 'Sentrix Master Prep' script on the target PC and are using the built-in 'Administrator' account.";
    } else if (stderr.includes("network name cannot be found") || message.includes("network name cannot be found")) {
      message = "PC Offline: The target computer could not be found on the network. Check the IP address and ensure the PC is turned on.";
    } else if (stderr.includes("logon failure") || message.includes("logon failure") || stderr.includes("unknown user name or bad password")) {
      message = "Login Failed: The username or password you entered is incorrect.";
    } else {
      // Include the actual stderr for better debugging
      message = `Deployment failed: ${stderr.split("\n")[0] || message.split("\n")[0]}`;
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

  const agentId = scannedDevice?.registered_client_id || options.clientId || crypto.randomUUID();
  let provisioningToken = null;

  if (credentials) {
    try {
      // For both deploy and update, we want to (re)bind the hardware securely.
      provisioningToken = await generateProvisioningToken(agentId);
      
      await deployAgentViaSMB(ip, credentials, serverUrl, agentId, provisioningToken);
      return { 
        success: true, 
        message: `Successfully pushed agent files to ${ip}. Activation will occur automatically within 60 seconds.`,
        ip 
      };
    } catch (error) {
      // Return agentId so the caller can clean up the ghost provisioning record
      return { success: false, message: error.message, ip, agentId };
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
