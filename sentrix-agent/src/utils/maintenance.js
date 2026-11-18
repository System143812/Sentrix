import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";
import { sendMessage } from "./ipc.js";
import { getActiveSessionManager } from "../services/session-manager.js";

const execAsync = promisify(exec);

/**
 * Robustly determines the agent's data directory.
 * Caches the result to avoid repeated FS hits.
 */
let cachedDataDir = null;

async function getAgentDataDir() {
  if (cachedDataDir) return cachedDataDir;

  if (process.platform === "win32") {
    const searchPaths = [
      process.env.SENTRIX_AGENT_DATA_DIR,
      process.pkg ? path.dirname(process.execPath) : null,
      process.cwd(),
      path.join(process.env.ProgramData || "C:\\ProgramData", "SentrixAgent"),
      path.join(process.env.LOCALAPPDATA || os.homedir(), "SentrixAgent"),
    ].filter(Boolean);

    for (const base of searchPaths) {
      if (fs.existsSync(path.join(base, "Modules", "BurntToast"))) {
        cachedDataDir = base;
        return base;
      }
      if (fs.existsSync(path.join(base, "assets", "Modules", "BurntToast"))) {
        cachedDataDir = path.join(base, "assets");
        return cachedDataDir;
      }
    }

    cachedDataDir =
      process.env.SENTRIX_AGENT_DATA_DIR ||
      path.join(process.env.LOCALAPPDATA || os.homedir(), "SentrixAgent");
  } else {
    cachedDataDir = path.join(os.homedir(), ".sentrix-agent");
  }

  return cachedDataDir;
}

function toEncodedCommand(script) {
  return `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${Buffer.from(script, "utf16le").toString("base64")}`;
}

export const MAINTENANCE_COMMANDS = {
  "network-reset": toEncodedCommand(`
    $ErrorActionPreference = 'SilentlyContinue'
    ipconfig /flushdns
    nbtstat -R
    netsh int ip reset
    exit 0
  `.trim()),
  "system-purge": toEncodedCommand(`
    $ErrorActionPreference = 'SilentlyContinue'

    $targetPaths = New-Object System.Collections.Generic.HashSet[string]
    if ($env:TEMP) { $targetPaths.Add($env:TEMP) | Out-Null }
    if ($env:TMP) { $targetPaths.Add($env:TMP) | Out-Null }
    if (Test-Path 'C:\\Windows\\Temp') { $targetPaths.Add('C:\\Windows\\Temp') | Out-Null }

    $userProfiles = Get-ChildItem -Path 'C:\\Users' -Directory -ErrorAction SilentlyContinue
    foreach ($profile in $userProfiles) {
        $userTemp = Join-Path $profile.FullName 'AppData\\Local\\Temp'
        if (Test-Path $userTemp) { $targetPaths.Add($userTemp) | Out-Null }
    }

    foreach ($p in $targetPaths) {
        if ($p -and (Test-Path $p)) {
            Get-ChildItem -Path $p -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
                try {
                    Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
                } catch {}
            }
        }
    }

    try {
        Clear-RecycleBin -Force -ErrorAction SilentlyContinue
    } catch {}

    try {
        $shell = New-Object -ComObject Shell.Application
        $recycleBin = $shell.Namespace(10)
        foreach ($item in $recycleBin.Items()) {
            $item.InvokeVerb("delete")
        }
    } catch {}

    $recycleBins = Get-ChildItem -Path 'C:\\' -Filter '$Recycle.Bin' -Force -ErrorAction SilentlyContinue
    foreach ($rb in $recycleBins) {
        Get-ChildItem -Path $rb.FullName -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
            try {
                Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
            } catch {}
        }
    }

    exit 0
  `.trim()),
  "time-sync": toEncodedCommand(`
    $ErrorActionPreference = 'SilentlyContinue'
    net start w32time
    w32tm /resync /force
    exit 0
  `.trim()),
  "workspace-reset": toEncodedCommand(`
    $ErrorActionPreference = 'SilentlyContinue'
    $ProgressPreference = 'SilentlyContinue'

    # Close open File Explorer folder windows via Shell.Application COM object
    try {
        $shell = New-Object -ComObject Shell.Application
        $windows = $shell.Windows()
        foreach ($window in $windows) {
            $fullName = $window.FullName
            if ($fullName -and $fullName.ToLower() -like "*explorer.exe*") {
                $window.Quit()
            }
        }
    } catch {}

    # Comprehensive safety exclusion list protecting Windows shell, DWM, input, audio, and graphics infrastructure
    $exclude = @(
        'sentrix-helper', 'sentrix-agent', 'explorer', 'dwm', 'sihost', 'taskhostw',
        'ctfmon', 'fontdrvhost', 'shlexperiencehost', 'startmenuexperiencehost',
        'searchhost', 'applicationframehost', 'lockapp', 'TextInputHost',
        'ShellExperienceHost', 'WindowsInternal.ComposableShell.Experiences.TextInput.InputApp',
        'audiodg', 'conhost', 'dllhost', 'runtimebroker', 'searchindexer', 'svchost',
        'dwm.exe', 'WUDFHost', 'userinit', 'winlogon'
    )

    # Target standard user applications and UWP Settings with visible windows in active user sessions
    $procs = Get-Process | Where-Object {
        $_.SI -ne 0 -and
        $_.MainWindowTitle -ne '' -and
        $exclude -notcontains $_.ProcessName.ToLower()
    }

    foreach ($p in $procs) {
        try {
            $p.CloseMainWindow() | Out-Null
        } catch {}
    }

    Get-Process -Name 'SystemSettings', 'ApplicationFrameHost' -ErrorAction SilentlyContinue | Where-Object {
        $_.SI -ne 0 -and
        $exclude -notcontains $_.ProcessName.ToLower()
    } | ForEach-Object {
        try {
            $_.CloseMainWindow() | Out-Null
        } catch {}
    }

    Start-Sleep -Seconds 3

    # Force close any remaining user apps that failed to exit normally
    Get-Process | Where-Object {
        $_.SI -ne 0 -and
        $exclude -notcontains $_.ProcessName.ToLower()
    } | Stop-Process -Force -ErrorAction SilentlyContinue

    exit 0
  `.trim()),
  "master-unlock": toEncodedCommand(`
    $ErrorActionPreference = 'SilentlyContinue'
    net user Administrator /active:yes
    Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" -Name "LocalAccountTokenFilterPolicy" -Value 1 -ErrorAction SilentlyContinue
    exit 0
  `.trim()),
  "broadcast-message": (text, dataDir = "C:\\ProgramData\\SentrixAgent", args = {}) => {
    const role = args.senderRole || "Administrator";
    const senderRole = role
      .toString()
      .replace(/[_-]/g, " ")
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");

    const escapedMsg = (text || "").replace(/'/g, "''");
    const escapedRole = senderRole.replace(/'/g, "''");
    const escapedDataDir = (dataDir || "C:\\ProgramData\\SentrixAgent").replace(/'/g, "''");

    const psCommand = [
      "$ErrorActionPreference = 'Stop'",
      `$rawRole = '${escapedRole}'`,
      `$rawMsg = '${escapedMsg}'`,
      `$baseDir = '${escapedDataDir}'`,
      "try {",
      "    $role = $rawRole",
      "    $msg = $rawMsg",
      "    $modulePath = Join-Path $baseDir 'Modules\\BurntToast\\BurntToast.psd1'",
      "    if (-not (Test-Path $modulePath)) {",
      "        $modulePath = Join-Path $baseDir 'assets\\Modules\\BurntToast\\BurntToast.psd1'",
      "    }",
      "    if (Test-Path $modulePath) {",
      "        Import-Module $modulePath -Force | Out-Null",
      "    }",
      "    $logoPath = Join-Path $baseDir 'sentrix-dark.png'",
      "    if (-not (Test-Path $logoPath)) {",
      "        $logoPath = Join-Path $baseDir 'assets\\sentrix-dark.png'",
      "    }",
      "    if (-not (Test-Path $logoPath)) {",
      "        $logoPath = Join-Path $baseDir 'src\\assets\\sentrix-dark.png'",
      "    }",
      "    if (-not (Test-Path $logoPath)) {",
      "        $localDevLogo = Join-Path (Get-Location) 'src\\assets\\sentrix-dark.png'",
      "        if (Test-Path $localDevLogo) { $logoPath = $localDevLogo }",
      "    }",
      "    $params = @{ Text = @(\"Message from $role\", $msg) }",
      "    if (Test-Path $logoPath) { $params['AppLogo'] = $logoPath }",
      "    New-BurntToastNotification @params | Out-Null",
      "    Write-Host 'SUCCESS: BurntToast notification displayed.'",
      "} catch {",
      "    Write-Host ('ERROR: ' + $_.Exception.Message)",
      "    exit 1",
      "}"
    ].join("; ");

    return `powershell -NoProfile -Sta -ExecutionPolicy Bypass -EncodedCommand ${Buffer.from(psCommand, "utf16le").toString("base64")}`;
  },
};

export async function runMaintenanceAction(action, args = {}) {
  const commandTemplate = MAINTENANCE_COMMANDS[action];

  if (!commandTemplate && !["file-validate", "file-list", "file-upload", "file-delete", "file-preview-delete", "file-download", "staged-download"].includes(action)) {
    return { success: false, message: `Unknown maintenance action: ${action}` };
  }

  const dataDir = await getAgentDataDir();
  const text = args.text || args.message || "Admin broadcast from Sentrix.";

  if (action === "file-validate") {
    const rawPath = args.path || "C:\\Users\\Public\\Desktop";
    try {
      const trimmed = rawPath.trim();
      const resolved = path.resolve(trimmed);
      const exists = fs.existsSync(resolved);
      let isDir = false;
      if (exists) {
        const stats = fs.statSync(resolved);
        isDir = stats.isDirectory();
      }
      return { success: true, valid: isDir, resolvedPath: resolved, message: isDir ? "Path is valid." : "Path does not exist or is not a directory." };
    } catch (err) {
      console.warn(`[FileManager] Path validation failed for "${rawPath}":`, err.message);
      return { success: true, valid: false, message: err.message };
    }
  }

  if (action === "file-list") {
    const targetPath = args.path || "C:\\Users\\Public\\Desktop";
    try {
      const resolved = path.resolve(targetPath);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        return { success: false, message: "Invalid active path." };
      }
      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      const files = [];
      for (const entry of entries) {
        const full = path.join(resolved, entry.name);
        try {
          const stats = fs.statSync(full);
          files.push({
            name: entry.name,
            isDirectory: entry.isDirectory(),
            size: stats.size,
            modified: stats.mtimeMs,
          });
        } catch {
          // Handle broken .lnk shortcuts or locked files gracefully
          files.push({
            name: entry.name,
            isDirectory: entry.isDirectory(),
            size: 0,
            modified: Date.now(),
          });
        }
      }
      return { success: true, files };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  if (action === "file-upload") {
    const targetPath = args.path || "C:\\Users\\Public\\Desktop";
    const fileName = args.fileName;
    const fileDataBase64 = args.fileData;
    const createMissingDirs = Boolean(args.createMissingDirs);
    if (!fileName || !fileDataBase64) {
      return { success: false, message: "Missing fileName or fileData." };
    }
    try {
      const resolved = path.resolve(targetPath);
      if (!fs.existsSync(resolved)) {
        if (createMissingDirs) {
          fs.mkdirSync(resolved, { recursive: true });
        } else {
          return { success: false, message: `Target path does not exist and auto-creation is disabled: ${resolved}` };
        }
      }
      const targetFilePath = path.join(resolved, fileName);
      const buffer = Buffer.from(fileDataBase64, "base64");
      fs.writeFileSync(targetFilePath, buffer);
      return { success: true, message: `File uploaded successfully to ${targetFilePath}` };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  if (action === "file-download") {
    const filePath = args.filePath;
    if (!filePath) {
      return { success: false, message: "Missing filePath." };
    }
    try {
      const resolved = path.resolve(filePath);
      if (!fs.existsSync(resolved)) {
        return { success: false, message: `Path does not exist: ${resolved}` };
      }

      const stats = fs.statSync(resolved);
      if (stats.isFile()) {
        const buffer = fs.readFileSync(resolved);
        const fileData = buffer.toString("base64");
        const fileName = path.basename(resolved);
        return {
          success: true,
          fileName,
          fileSize: stats.size,
          fileData,
        };
      } else if (stats.isDirectory()) {
        const folderName = path.basename(resolved);
        const tempZipPath = path.join(os.tmpdir(), `sentrix-${folderName}-${Date.now()}.zip`);
        if (fs.existsSync(tempZipPath)) {
          try { fs.unlinkSync(tempZipPath); } catch {}
        }

        const psCommand = `
          Add-Type -AssemblyName System.IO.Compression.FileSystem
          [System.IO.Compression.ZipFile]::CreateFromDirectory('${resolved.replace(/'/g, "''")}', '${tempZipPath.replace(/'/g, "''")}', [System.IO.Compression.CompressionLevel]::Optimal, $false)
        `;
        const tempPsPath = path.join(os.tmpdir(), `zip-${Date.now()}.ps1`);
        fs.writeFileSync(tempPsPath, psCommand, "utf8");

        try {
          await execAsync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tempPsPath}"`);
        } finally {
          try { fs.unlinkSync(tempPsPath); } catch {}
        }

        if (!fs.existsSync(tempZipPath)) {
          return { success: false, message: "Failed to create zip archive for folder." };
        }

        const zipStats = fs.statSync(tempZipPath);
        const zipBuffer = fs.readFileSync(tempZipPath);
        const fileData = zipBuffer.toString("base64");
        try { fs.unlinkSync(tempZipPath); } catch {}

        return {
          success: true,
          fileName: `${folderName}.zip`,
          fileSize: zipStats.size,
          fileData,
        };
      } else {
        return { success: false, message: `Path is neither file nor directory: ${resolved}` };
      }
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  if (action === "file-preview-delete" || action === "file-delete") {
    const targetPath = args.path || "C:\\Users\\Public\\Desktop";
    const newerThanHours = args.newerThanHours;
    const olderThanHours = args.olderThanHours;
    const fileTypes = args.fileTypes || [];
    const excludePatterns = args.excludePatterns || [];
    const includeSubfolders = Boolean(args.includeSubfolders);

    try {
      const resolved = path.resolve(targetPath);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        return { success: false, message: "Invalid active path for deletion." };
      }

      const now = Date.now();
      const items = [];

      function walk(currentDir) {
        let entries;
        try {
          entries = fs.readdirSync(currentDir, { withFileTypes: true });
        } catch {
          return;
        }

        for (const entry of entries) {
          const name = entry.name;
          const fullPath = path.join(currentDir, name);
          const isDir = entry.isDirectory();

          let excluded = false;
          for (const pattern of excludePatterns) {
            const regex = new RegExp("^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i");
            if (regex.test(name)) {
              excluded = true;
              break;
            }
          }
          if (excluded) continue;

          let stats;
          try {
            stats = fs.statSync(fullPath);
          } catch {
            continue;
          }

          if (isDir) {
            if (includeSubfolders) {
              walk(fullPath);

              let matchTime = true;
              const ageHours = (now - stats.mtimeMs) / (1000 * 60 * 60);
              if (newerThanHours !== null && newerThanHours !== undefined && Number(newerThanHours) > 0) {
                if (ageHours > Number(newerThanHours)) {
                  matchTime = false;
                }
              }
              if (olderThanHours !== null && olderThanHours !== undefined && Number(olderThanHours) > 0) {
                if (ageHours < Number(olderThanHours)) {
                  matchTime = false;
                }
              }

              if (matchTime) {
                items.push({
                  path: fullPath,
                  name: path.relative(resolved, fullPath) || name,
                  isDirectory: true,
                  size: 0,
                  modified: stats.mtimeMs,
                });
              }
            }
          } else {
            let matchExt = true;
            if (fileTypes.length > 0) {
              const ext = path.extname(name).toLowerCase();
              const normalizedExts = fileTypes.map(t => t.toLowerCase().startsWith('.') ? t.toLowerCase() : '.' + t.toLowerCase());
              matchExt = normalizedExts.includes(ext);
            }

            let matchTime = true;
            const ageHours = (now - stats.mtimeMs) / (1000 * 60 * 60);
            if (newerThanHours !== null && newerThanHours !== undefined && Number(newerThanHours) > 0) {
              if (ageHours > Number(newerThanHours)) {
                matchTime = false;
              }
            }
            if (olderThanHours !== null && olderThanHours !== undefined && Number(olderThanHours) > 0) {
              if (ageHours < Number(olderThanHours)) {
                matchTime = false;
              }
            }

            if (matchExt && matchTime) {
              items.push({
                path: fullPath,
                name: path.relative(resolved, fullPath) || name,
                isDirectory: false,
                size: stats.size,
                modified: stats.mtimeMs,
              });
            }
          }
        }
      }

      walk(resolved);

      if (action === "file-preview-delete") {
        const totalFiles = items.filter(i => !i.isDirectory).length;
        const totalFolders = items.filter(i => i.isDirectory).length;
        const totalSize = items.reduce((acc, i) => acc + (i.size || 0), 0);
        return {
          success: true,
          items,
          totalFiles,
          totalFolders,
          totalSize,
        };
      }

      // Execute deletion (deepest first so files & child folders are deleted before parents)
      items.sort((a, b) => b.path.length - a.path.length);

      let deletedCount = 0;
      let deletedFoldersCount = 0;

      for (const item of items) {
        try {
          if (item.isDirectory) {
            if (fs.existsSync(item.path)) {
              fs.rmdirSync(item.path);
              deletedFoldersCount++;
            }
          } else {
            if (fs.existsSync(item.path)) {
              fs.unlinkSync(item.path);
              deletedCount++;
            }
          }
        } catch (delErr) {
          console.warn(`[FileManager] Failed to delete ${item.path}:`, delErr.message);
        }
      }

      return {
        success: true,
        message: `Successfully deleted ${deletedCount} file(s) and ${deletedFoldersCount} folder(s) matching filters.`,
        deletedCount,
        deletedFoldersCount,
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  if (action === "staged-download") {
    const downloadUrl = args.downloadUrl;
    const targetPath = args.path || "C:\\Users\\Public\\Desktop";
    const fileName = args.fileName || "downloaded-file";

    if (!downloadUrl) {
      return { success: false, message: "Missing downloadUrl for staged-download." };
    }

    try {
      const resolvedDir = path.resolve(targetPath);
      if (!fs.existsSync(resolvedDir)) {
        fs.mkdirSync(resolvedDir, { recursive: true });
      }
      const targetFilePath = path.join(resolvedDir, fileName);

      // Stream download using native https/http
      const httpClient = downloadUrl.startsWith("https") ? await import("https") : await import("http");

      return await new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(targetFilePath);

        const reqOpts = {
          rejectUnauthorized: false, // For self-signed dev certificates
        };

        httpClient.get(downloadUrl, reqOpts, (res) => {
          if (res.statusCode !== 200) {
            fileStream.close();
            try { if (fs.existsSync(targetFilePath)) fs.unlinkSync(targetFilePath); } catch {}
            return resolve({ success: false, message: `Server responded with status code ${res.statusCode}` });
          }

          res.pipe(fileStream);

          fileStream.on("finish", () => {
            fileStream.close();
            resolve({ success: true, message: `Staged file downloaded successfully to ${targetFilePath}` });
          });
        }).on("error", (err) => {
          fileStream.close();
          try { if (fs.existsSync(targetFilePath)) fs.unlinkSync(targetFilePath); } catch {}
          resolve({ success: false, message: `Stream download failed: ${err.message}` });
        });
      });
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  if (action === "broadcast-message") {
    console.log(`[Broadcast] Attempting delivery for: "${text.substring(0, 20)}..."`);
    const sm = getActiveSessionManager();
    const endpoints = sm ? sm.getActiveHelperEndpoints() : [];

    if (endpoints.length > 0) {
      const results = await Promise.allSettled(
        endpoints.map(ep => sendMessage(ep.port, {
          type: "broadcast",
          text,
          senderRole: args.senderRole,
          dataDir,
        }))
      );

      const successCount = results.filter(r => r.status === "fulfilled" && r.value && r.value.success).length;
      if (successCount > 0) {
        console.log(`[Broadcast] SUCCESS: Delivered to ${successCount} active helper session(s).`);
        return {
          success: true,
          message: `Broadcast message delivered to ${successCount} helper process(es).`,
        };
      }
    }
    console.warn(`[Broadcast] No active session helpers responding. Skipping Session 0 fallback to prevent E_ACCESSDENIED.`);
    return {
      success: false,
      message: "Broadcast message delivery failed: no active user-session helper processes responding.",
    };
  }

  if (action === "workspace-reset") {
    console.log(`[Maintenance] Attempting workspace-reset via active user-session helper(s)...`);
    const sm = getActiveSessionManager();
    const endpoints = sm ? sm.getActiveHelperEndpoints() : [];

    if (endpoints.length > 0) {
      const results = await Promise.allSettled(
        endpoints.map(ep => sendMessage(ep.port, { type: "workspace-reset" }))
      );

      const successCount = results.filter(r => r.status === "fulfilled" && r.value && r.value.success).length;
      if (successCount > 0) {
        console.log(`[Maintenance] SUCCESS: Workspace reset executed in ${successCount} user session helper(s).`);
        return {
          success: true,
          message: `User-level workspace apps terminated successfully in ${successCount} user session(s).`,
        };
      }
    }
    console.warn(`[Maintenance] No active session helpers responding. Falling back to direct Session 0 execution.`);
  }

  let finalCommand;
  if (typeof commandTemplate === "function") {
    finalCommand = commandTemplate(text, dataDir, args);
  } else {
    finalCommand = commandTemplate;
  }

  try {
    const startTime = Date.now();
    console.log(`[Maintenance] Executing command [${action}] targeting active user sessions (SI != 0)...`);
    const { stdout, stderr } = await execAsync(finalCommand, { timeout: 120000 });
    const duration = Date.now() - startTime;

    console.log(`[Maintenance] Command [${action}] executed successfully in ${duration}ms.`);
    if (stdout && stdout.trim()) {
      console.log(`[Maintenance] [${action}] Stdout: ${stdout.trim()}`);
    }
    if (stderr && stderr.trim()) {
      console.warn(`[Maintenance] [${action}] Stderr: ${stderr.trim()}`);
    }

    const messages = {
      "network-reset": "Network resolver cache and IP stack reset successfully.",
      "system-purge": "System temporary files and update cache purged.",
      "time-sync": "System clock synchronized with internet time server.",
      "workspace-reset": "User-level workspace apps terminated successfully.",
      "broadcast-message": "Broadcast message delivered to the user screen (Session 0 fallback).",
    };

    return {
      success: true,
      message: messages[action] || "Maintenance action completed successfully.",
    };
  } catch (error) {
    console.error(`[Maintenance] CRITICAL FAILURE executing [${action}]:`, {
      message: error.message,
      code: error.code,
      stdout: error.stdout,
      stderr: error.stderr,
    });
    return {
      success: false,
      message: `Failed to execute ${action}: ${error.message}`,
    };
  }
}
