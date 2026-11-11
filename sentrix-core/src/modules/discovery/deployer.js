import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { getPrimaryInterfaceAddress } from "./scanner.js";
import { generateProvisioningToken } from "../security/security.service.js";
import { ClientRepository } from "../clients/clients.repository.js";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizeMac(mac = "") {
  return String(mac || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-F0-9]/g, "");
}

/**
 * Deploys agent files to a host via SMB Administrative Share (C$) using direct recursive directory copy
 * and local Watchdog activation.
 */
async function deployAgentViaSMB(ip, arg2, arg3, arg4, arg5, arg6) {
  let credentials = arg2;
  let serverUrl = arg3;
  let agentId = arg4;
  let token = arg5;
  let action = arg6 || "deploy";

  let scanRecord = null;
  if (arg2 instanceof Map) {
    scanRecord = arg2.get(ip);
    credentials = arg3;
    action = arg4?.action || "deploy";
  }

  // Pre-lookup existing client by IP or MAC to preserve identity across redeploys
  if (!agentId || typeof agentId !== "string" || agentId.includes("[object")) {
    try {
      const allClients = await ClientRepository.findAllIncludingArchived();
      const existingClient = allClients.find(c => {
        const ipMatch = c.ip === ip;
        const macMatch = scanRecord?.mac && c.mac && normalizeMac(c.mac) === normalizeMac(scanRecord.mac);
        return ipMatch || macMatch;
      });

      if (existingClient) {
        agentId = existingClient.id;
        console.log(`[Deployer] Identity Preservation: Reusing existing client ID ${agentId} for deployment to IP ${ip}.`);
      }
    } catch (err) {
      console.warn(`[Deployer] Failed to query existing client for identity preservation:`, err.message);
    }
  }

  if (scanRecord && !agentId) {
    agentId = scanRecord.registered_client_id || scanRecord.agentId;
  }

  if (arg2 instanceof Map) {
    serverUrl = process.env.SERVER_URL || `https://${getPrimaryInterfaceAddress() || "127.0.0.1"}:4000`;
  }

  if (!agentId || typeof agentId !== "string" || agentId.includes("[object")) {
    agentId = crypto.randomUUID();
  }
  if (!token) {
    token = await generateProvisioningToken(agentId);
  }
  if (!serverUrl) {
    serverUrl = process.env.SERVER_URL || `https://${getPrimaryInterfaceAddress() || "127.0.0.1"}:4000`;
  }

  const cleanAgentId = String(agentId || "").trim();
  if (!cleanAgentId || cleanAgentId.length > 128 || /[\r\n]/.test(String(agentId)) || !/^[a-zA-Z0-9\-_.~]+$/.test(cleanAgentId)) {
    throw new Error("Invalid agentId format. Agent ID must be alphanumeric/safe characters without newlines.");
  }

  const rawServerUrl = String(serverUrl ?? "");
  if (!rawServerUrl || /[\r\n]/.test(rawServerUrl)) {
    throw new Error("Invalid serverUrl: empty value or line breaks detected.");
  }
  const cleanServerUrl = rawServerUrl.trim();

  const rawToken = token ? String(token) : "";
  if (rawToken && /[\r\n]/.test(rawToken)) {
    throw new Error("Invalid provisioning token: line breaks detected.");
  }
  const cleanToken = rawToken.trim();

  const agentExePath = path.resolve(__dirname, "../../../../sentrix-agent/dist/sentrix-agent.exe");
  const helperExePath = path.resolve(__dirname, "../../../../sentrix-agent/dist/sentrix-helper.exe");
  const serviceHostExePath = path.resolve(__dirname, "../../../../sentrix-agent/dist/AgentServiceHost.exe");
  const assetsPath = path.resolve(__dirname, "../../../../sentrix-agent/dist/assets");
  const launcherCsPath = path.resolve(__dirname, "../../../../sentrix-agent/src/utils/SessionLauncher.cs");
  const launcherExePath = path.resolve(__dirname, "../../../../sentrix-agent/src/utils/SessionLauncher.exe");
  const getSessionsPath = path.resolve(__dirname, "../../../../sentrix-agent/src/utils/get-sessions.ps1");
  const findHelperPath = path.resolve(__dirname, "../../../../sentrix-agent/src/utils/find-helper.ps1");
  const setupServicePath = path.resolve(__dirname, "../../../../sentrix-agent/src/utils/setup-service.ps1");

  const requiredFiles = [
    { name: "Agent executable", path: agentExePath, relPath: "sentrix-agent.exe" },
    { name: "Helper executable", path: helperExePath, relPath: "sentrix-helper.exe" },
    { name: "Agent service host", path: serviceHostExePath, relPath: "AgentServiceHost.exe" },
    { name: "Service setup script", path: setupServicePath, relPath: "src/utils/setup-service.ps1" },
    { name: "Session launcher executable", path: launcherExePath, relPath: "src/utils/SessionLauncher.exe" },
    { name: "Get sessions script", path: getSessionsPath, relPath: "src/utils/get-sessions.ps1" },
    { name: "Find helper script", path: findHelperPath, relPath: "src/utils/find-helper.ps1" },
  ];

  let localEnvPath = null;
  let localManifestPath = null;
  let localBuildDir = null;
  let localPs1Path = null;

  try {
    const missingFiles = [];
    const manifestItems = [];
    const deploymentId = crypto.randomUUID();

    for (const file of requiredFiles) {
      if (!fs.existsSync(file.path)) {
        missingFiles.push({ ...file, reason: "File does not exist" });
      } else {
        const stats = fs.statSync(file.path);
        if (!stats.isFile() || stats.size === 0) {
          missingFiles.push({ ...file, reason: "File is empty or not a regular file" });
        } else {
          const fileBuffer = fs.readFileSync(file.path);
          const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
          manifestItems.push({
            relPath: file.relPath,
            size: stats.size,
            hash,
            type: "binary"
          });
        }
      }
    }

    if (missingFiles.length > 0) {
      throw new Error(
        `Deployment artifacts are invalid or missing:\n${missingFiles
          .map(file => `- ${file.name} (${file.path}): ${file.reason}`)
          .join("\n")}`
      );
    }

    if (!fs.existsSync(assetsPath) || !fs.statSync(assetsPath).isDirectory()) {
      throw new Error(`Required assets directory not found: ${assetsPath}`);
    }

    function getRecursiveFiles(dir, baseDir = dir) {
      let results = [];
      let list = fs.readdirSync(dir);

      for (const file of list) {
        const filePath = path.join(dir, file);
        const stat = fs.lstatSync(filePath);

        if (stat.isSymbolicLink()) {
          continue;
        }

        if (stat.isDirectory()) {
          results = results.concat(getRecursiveFiles(filePath, baseDir));
        } else if (stat.isFile()) {
          if (stat.size === 0) {
            throw new Error(`Asset file is empty: ${filePath}`);
          }
          const fileBuffer = fs.readFileSync(filePath);
          const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
          const relPath = "assets/" + path.relative(baseDir, filePath).replace(/\\/g, "/");
          results.push({ relPath, size: stat.size, hash, type: "asset" });
        }
      }
      return results;
    }

    const localAssets = getRecursiveFiles(assetsPath);
    if (localAssets.length === 0) {
      throw new Error(`Assets directory is empty: ${assetsPath}`);
    }

    const fullManifest = [
      { deploymentId, timestamp: new Date().toISOString() },
      ...manifestItems,
      ...localAssets
    ];

    const localCertPath = path.resolve(__dirname, "../../../.certs/server.crt");
    let localCertSrc = "";
    if (fs.existsSync(localCertPath)) {
      localCertSrc = localCertPath;
      const certBuffer = fs.readFileSync(localCertSrc);
      const certHash = crypto.createHash("sha256").update(certBuffer).digest("hex");
      fullManifest.push({
        relPath: "server.crt",
        size: certBuffer.length,
        hash: certHash,
        type: "config"
      });
    } else {
      throw new Error(`Required canonical TLS certificate not found at ${localCertPath}.`);
    }

    const envContentStr = `SENTRIX_SERVER_URL=${cleanServerUrl}\nSENTRIX_AGENT_ID=${cleanAgentId}${cleanToken ? `\nSENTRIX_PROVISIONING_TOKEN=${cleanToken}` : ""}`;
    const envBuffer = Buffer.from(envContentStr, "utf8");
    const envHash = crypto.createHash("sha256").update(envBuffer).digest("hex");
    fullManifest.push({
      relPath: ".env",
      size: envBuffer.length,
      hash: envHash,
      type: "config"
    });

    localEnvPath = path.join(os.tmpdir(), `sentrix-env-${crypto.randomUUID()}.env`);
    fs.writeFileSync(localEnvPath, envContentStr, { encoding: "utf8", mode: 0o600 });

    localManifestPath = path.join(os.tmpdir(), `sentrix-manifest-${crypto.randomUUID()}.json`);
    fs.writeFileSync(localManifestPath, JSON.stringify(fullManifest, null, 2), "utf8");

    // Build local temporary staging directory for direct recursive copy
    localBuildDir = path.join(os.tmpdir(), `sentrix-build-${crypto.randomUUID()}`);
    fs.mkdirSync(localBuildDir, { recursive: true });

    fs.copyFileSync(agentExePath, path.join(localBuildDir, "sentrix-agent.exe"));
    if (fs.existsSync(helperExePath)) {
      fs.copyFileSync(helperExePath, path.join(localBuildDir, "sentrix-helper.exe"));
    }
    fs.copyFileSync(serviceHostExePath, path.join(localBuildDir, "AgentServiceHost.exe"));
    fs.copyFileSync(localEnvPath, path.join(localBuildDir, ".env"));
    if (localCertSrc) fs.copyFileSync(localCertSrc, path.join(localBuildDir, "server.crt"));
    fs.copyFileSync(localManifestPath, path.join(localBuildDir, "asset-manifest.json"));

    const buildUtilsDir = path.join(localBuildDir, "src", "utils");
    fs.mkdirSync(buildUtilsDir, { recursive: true });
    if (fs.existsSync(launcherCsPath)) fs.copyFileSync(launcherCsPath, path.join(buildUtilsDir, "SessionLauncher.cs"));
    if (fs.existsSync(launcherExePath)) fs.copyFileSync(launcherExePath, path.join(buildUtilsDir, "SessionLauncher.exe"));
    if (fs.existsSync(getSessionsPath)) fs.copyFileSync(getSessionsPath, path.join(buildUtilsDir, "get-sessions.ps1"));
    if (fs.existsSync(findHelperPath)) fs.copyFileSync(findHelperPath, path.join(buildUtilsDir, "find-helper.ps1"));
    if (fs.existsSync(setupServicePath)) fs.copyFileSync(setupServicePath, path.join(buildUtilsDir, "setup-service.ps1"));

    const buildAssetsDir = path.join(localBuildDir, "assets");
    fs.cpSync(assetsPath, buildAssetsDir, { recursive: true });

    const username = credentials.user || credentials.username;
    const password = credentials.pass || credentials.password;

    if (!username || !password) {
      throw new Error("Invalid credentials provided. Both username and password are required.");
    }

    const b64 = (str) => Buffer.from(str || "").toString("base64");

    const pushScript = `
      param(
        [Parameter(Mandatory=\$true)] [string]\$EncodedIp,
        [Parameter(Mandatory=\$true)] [string]\$EncodedUser,
        [Parameter(Mandatory=\$true)] [string]\$EncodedPass,
        [Parameter(Mandatory=\$true)] [string]\$EncodedDeploymentId,
        [Parameter(Mandatory=\$true)] [string]\$EncodedAction,
        [Parameter(Mandatory=\$true)] [string]\$EncodedLocalBuildDir,
        [Parameter(Mandatory=\$true)] [string]\$EncodedAgentId
      )

      \$ip = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String(\$EncodedIp))
      \$user = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String(\$EncodedUser))
      \$passRaw = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String(\$EncodedPass))
      \$deploymentId = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String(\$EncodedDeploymentId))
      \$action = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String(\$EncodedAction))
      \$localBuildDirSrc = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String(\$EncodedLocalBuildDir))
      \$agentId = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String(\$EncodedAgentId))

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
          throw "SMB Connection Failed: Target PC is either offline or blocking Port 445."
      } finally {
          \$tcp.Close()
      }

      Write-Host "[DEPLOY] Mapping administrative share (C\$)..."
      if (Get-PSDrive \$driveName -ErrorAction SilentlyContinue) { Remove-PSDrive \$driveName -Force }
      try {
          New-PSDrive -Name \$driveName -PSProvider FileSystem -Root "\\\\\$ip\\C\$" -Credential \$cred
      } catch {
          throw "SMB Auth Failed: Could not map administrative share."
      }

      try {
          \$remotePath = "\${driveName}:\\\\ProgramData\\\\SentrixAgent"
          if (-not (Test-Path \$remotePath)) {
              Write-Host "[DEPLOY] Creating remote directory: \$remotePath"
              New-Item -ItemType Directory -Path \$remotePath -Force | Out-Null
          }

          Write-Host "[DEPLOY] Copying deployment files recursively to remote path..."
          Copy-Item -Path "\$localBuildDirSrc\\*" -Destination \$remotePath -Recurse -Force -ErrorAction Stop

          \$markerPayload = @{
              deploymentId = \$deploymentId
              timestamp    = (Get-Date).ToString("o")
              agentId      = \$agentId
          } | ConvertTo-Json -Compress

          \$deploymentMarker = "\$remotePath\\\\.deployment-ready"
          \$tempMarker = "\$remotePath\\\\.deployment-ready.tmp"
          \$markerPayload | Out-File -FilePath \$tempMarker -Encoding utf8 -Force
          if (Test-Path -LiteralPath \$deploymentMarker -ErrorAction Stop) { Remove-Item -LiteralPath \$deploymentMarker -Force -ErrorAction Stop }
          Move-Item -LiteralPath \$tempMarker -Destination \$deploymentMarker -Force

          Write-Host "[DEPLOY] Executing setup-service.ps1 on remote host..."
          \$setupScript = "\$remotePath\\\\src\\\\utils\\\\setup-service.ps1"
          if (Test-Path \$setupScript) {
              & powershell.exe -NoProfile -ExecutionPolicy Bypass -File \$setupScript
              Write-Host "[DEPLOY] setup-service.ps1 executed successfully."
          } else {
              Write-Host "[DEPLOY] WARNING: setup-service.ps1 not found at \$setupScript. Skipping remote service setup."
          }

          Write-Host "[DEPLOY] SUCCESS: Files pushed and service configured successfully."
      } finally {
          Remove-PSDrive -Name \$driveName -Force -ErrorAction SilentlyContinue
      }
    `;

    localPs1Path = path.join(os.tmpdir(), `sentrix-push-${crypto.randomUUID()}.ps1`);
    fs.writeFileSync(localPs1Path, pushScript, "utf8");

    const encodedIp = b64(ip);
    const encodedUser = b64(username);
    const encodedPass = b64(password);
    const encodedDeploymentId = b64(deploymentId);
    const encodedLocalBuildDir = b64(localBuildDir);
    const encodedAgentId = b64(cleanAgentId);

    await new Promise((resolve, reject) => {
      let settled = false;
      const timeoutMs = 90000; // 90 seconds max for bulk SMB copy

      const ps = spawn("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        localPs1Path,
        "-EncodedIp", encodedIp,
        "-EncodedUser", encodedUser,
        "-EncodedPass", encodedPass,
        "-EncodedDeploymentId", encodedDeploymentId,
        "-EncodedAction", b64(action),
        "-EncodedLocalBuildDir", encodedLocalBuildDir,
        "-EncodedAgentId", encodedAgentId
      ], {
        timeout: timeoutMs,
      });

      let stdout = "";
      let stderr = "";

      ps.stdout.on("data", (data) => {
        const text = data.toString();
        stdout += text;
        process.stdout.write(text);
      });

      ps.stderr.on("data", (data) => {
        const text = data.toString();
        stderr += text;
        process.stderr.write(text);
      });

      ps.on("error", (err) => {
        if (!settled) {
          settled = true;
          reject(new Error(`PowerShell deployment process error: ${err.message}`));
        }
      });

      ps.on("close", (code) => {
        if (!settled) {
          settled = true;
          if (code === 0) {
            resolve({ success: true, stdout });
          } else {
            reject(new Error(`Deployment push script exited with code ${code}. Stderr: ${stderr || stdout}`));
          }
        }
      });
    });

    return {
      success: true,
      message: "Deployment files pushed successfully via recursive SMB copy. Watchdog is activating locally.",
      agentId: cleanAgentId
    };

  } catch (error) {
    console.error(`[DEPLOY] SMB Deployment failed for ${ip}:`, error);
    return {
      success: false,
      error: error.message || "Unknown deployment error",
      message: error.message || "Unknown deployment error",
      ip,
      agentId: cleanAgentId
    };
  } finally {
    if (localEnvPath && fs.existsSync(localEnvPath)) {
      try { fs.unlinkSync(localEnvPath); } catch {}
    }
    if (localManifestPath && fs.existsSync(localManifestPath)) {
      try { fs.unlinkSync(localManifestPath); } catch {}
    }
    if (localBuildDir && fs.existsSync(localBuildDir)) {
      try { fs.rmSync(localBuildDir, { recursive: true, force: true }); } catch {}
    }
    if (localPs1Path && fs.existsSync(localPs1Path)) {
      try { fs.unlinkSync(localPs1Path); } catch {}
    }
  }
}

export async function deployAgentToHost(...args) {
  return deployAgentViaSMB(...args);
}

export const deployer = {
  deployAgentViaSMB,
  deployAgentToHost,
};
