import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { getPrimaryInterfaceAddress } from "./scanner.js";
import { generateProvisioningToken } from "../security/security.service.js";
import { ClientRepository } from "../clients/clients.repository.js";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

    Write-Host "[DEPLOY] Checking SMB connectivity (Port 445)..."
    \$tcp = New-Object System.Net.Sockets.TcpClient
    try {
        \$ar = \$tcp.BeginConnect(\$ip, 445, \$null, \$null)
        \$wait = \$ar.AsyncWaitHandle.WaitOne(5000, \$false)
        if (-not \$wait) { throw "Timed out connecting to port 445" }
        \$tcp.EndConnect(\$ar)
        Write-Host "[DEPLOY] SMB Port 445 is open."
    } catch {
        throw "SMB Connection Failed: Target PC is either offline or blocking Port 445 (File & Printer Sharing). Ensure the PC is on the same network and not behind a restrictive firewall."
    } finally {
        \$tcp.Close()
    }

    Write-Host "[DEPLOY] Mapping administrative share (C\$)..."
    if (Get-PSDrive \$driveName -ErrorAction SilentlyContinue) { Remove-PSDrive \$driveName -Force }
    try {
        New-PSDrive -Name \$driveName -PSProvider FileSystem -Root "\\\\\$ip\\C\$" -Credential \$cred
    } catch {
        throw "SMB Auth Failed: Could not map administrative share. Check your credentials and ensure you are using the built-in 'Administrator' account or a user with remote SMB rights."
    }
    
    try {
        \$remotePath = "\${driveName}:\\\\ProgramData\\\\SentrixAgent"
        if (-not (Test-Path \$remotePath)) {
            Write-Host "[DEPLOY] Creating remote directory: \$remotePath"
            New-Item -ItemType Directory -Path \$remotePath -Force | Out-Null
        }
        
        Write-Host "[DEPLOY] Provisioning .env file..."
        \$envContent = "SENTRIX_SERVER_URL=\$url\`nSENTRIX_AGENT_ID=\$id"
        if (\$token) {
            \$envContent += "\`nSENTRIX_PROVISIONING_TOKEN=\$token"
        }
        \$envContent | Out-File -FilePath "\$remotePath\\.env" -Encoding utf8
        
        Write-Host "[DEPLOY] Copying agent executable..."
        \$targetExe = "\$remotePath\\\\sentrix-agent.exe"
        try {
            Copy-Item -Path "${agentExePath.replace(/\\/g, "\\\\")}" -Destination "\$targetExe" -Force
        } catch {
            Write-Host "[DEPLOY] Agent is currently running (locked). Copying as update package..."
            Copy-Item -Path "${agentExePath.replace(/\\/g, "\\\\")}" -Destination "\$remotePath\\\\sentrix-agent-update.exe" -Force
        }

        if (Test-Path "${helperExePath.replace(/\\/g, "\\\\")}") {
            Write-Host "[DEPLOY] Copying helper executable..."
            \$targetHelper = "\$remotePath\\\\sentrix-helper.exe"
            try {
                Copy-Item -Path "${helperExePath.replace(/\\/g, "\\\\")}" -Destination "\$targetHelper" -Force
            } catch {
                Write-Host "[DEPLOY] Helper is currently running (locked). Copying as update package..."
                Copy-Item -Path "${helperExePath.replace(/\\/g, "\\\\")}" -Destination "\$remotePath\\\\sentrix-helper-update.exe" -Force
            }
        }

        if (Test-Path "${assetsPath.replace(/\\/g, "\\\\")}") {
            Write-Host "[DEPLOY] Copying assets..."
            try {
                Copy-Item -Path "${assetsPath.replace(/\\/g, "\\\\")}" -Destination \$remotePath -Recurse -Force
            } catch {
                Write-Host "[DEPLOY] WARNING: Some assets could not be copied (likely locked). Continuing..."
            }
        }
        
        Write-Host "[DEPLOY] Triggering watchdog for immediate activation..."
        try {
            # Use WMI to trigger the watchdog task remotely (more reliable than schtasks /run)
            Invoke-WmiMethod -Class Win32_Process -Name Create -ArgumentList "schtasks.exe /run /tn \"Sentrix Watchdog\"" -ComputerName \$ip -Credential \$cred -ErrorAction SilentlyContinue | Out-Null
            Write-Host "[DEPLOY] Watchdog triggered successfully."
        } catch {
            Write-Host "[DEPLOY] WARNING: Could not trigger watchdog remotely. It will activate on next scheduled run (within 60 seconds)."
        }

        Write-Host "[DEPLOY] SUCCESS: Files delivered. Agent activation initiated."
    } finally {
        Remove-PSDrive -Name \$driveName -Force -ErrorAction SilentlyContinue
    }
  `;

  return new Promise((resolve, reject) => {
    const ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", pushScript], {
      timeout: 120000, // 2 minutes for full deployment
    });

    let stdout = "";
    let stderr = "";

    ps.stdout.on("data", (data) => {
      const line = data.toString();
      stdout += line;
      if (line.includes("[DEPLOY]")) {
        console.log(`[Push -> ${ip}] ${line.trim()}`);
      }
    });

    ps.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    ps.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const lines = stdout.trim().split("\n");
        const lastLine = lines[lines.length - 1] || "";
        const errorMsg = stderr.trim() || lastLine || `Process exited with code ${code}`;
        
        let friendlyMessage = errorMsg;
        if (errorMsg.includes("Access is denied")) {
          friendlyMessage = "Access Denied: Remote SMB access blocked. Ensure 'Sentrix Master Prep' was run and you are using 'Administrator'.";
        } else if (errorMsg.includes("network name cannot be found")) {
          friendlyMessage = "PC Offline: Network path not found. Check IP and power.";
        } else if (errorMsg.includes("logon failure")) {
          friendlyMessage = "Login Failed: Invalid username or password.";
        } else if (errorMsg.includes("SMB Connection Failed")) {
          friendlyMessage = errorMsg;
        }

        reject(new Error(friendlyMessage));
      }
    });

    ps.on("error", (err) => {
      reject(err);
    });
  });
}

function normalizeMac(mac = "") {
  return String(mac || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-F0-9]/g, "");
}

export async function deployAgentToHost(ip, lastScanResults, credentials = null, options = {}) {
  const scannedDevice = lastScanResults.get(ip);
  const action = ["activate", "update"].includes(options.action) ? options.action : "deploy";
  const serverUrl = process.env.SENTRIX_PUBLIC_SERVER_URL
    || process.env.CORE_PUBLIC_URL
    || process.env.BACKEND_URL
    || `https://${getPrimaryInterfaceAddress() || "localhost"}:${process.env.PORT || 4000}`;

  let existingAgentId = scannedDevice?.registered_client_id;

  if (!existingAgentId && scannedDevice?.mac && scannedDevice.mac !== "Unknown") {
    try {
      const allClients = await ClientRepository.findAllIncludingArchived();
      const normScanMac = normalizeMac(scannedDevice.mac);
      const matchedClient = allClients.find(c => normalizeMac(c.mac) === normScanMac);
      if (matchedClient) {
        existingAgentId = matchedClient.id || matchedClient.agent_id;
        console.log(`[DEPLOY] Found existing client record ${existingAgentId} by MAC ${scannedDevice.mac} during deployment preparation.`);
      }
    } catch (err) {
      console.warn(`[DEPLOY] Failed to lookup client by MAC for deployment:`, err.message);
    }
  }

  const agentId = existingAgentId || options.clientId || crypto.randomUUID();
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
