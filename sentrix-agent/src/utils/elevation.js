import { execSync } from "child_process";

/**
 * Checks if the current process has administrative privileges on Windows.
 * @returns {boolean}
 */
export function isAdmin() {
  if (process.platform !== "win32") {
    return true; // Assume non-Windows platforms don't need this check or handle it differently
  }

  try {
    // Check effective administrator membership via .NET WindowsPrincipal
    const psCommand = "[Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent().IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)";
    const base64Command = Buffer.from(psCommand, "utf16le").toString("base64");
    const { stdout } = execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${base64Command}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true
    });
    return stdout.trim().toLowerCase() === "true";
  } catch {
    // Fallback to net session if .NET execution fails
    try {
      execSync("net session", { stdio: "ignore", windowsHide: true });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Checks if the current process is running as the SYSTEM account.
 * @returns {boolean}
 */
export function isSystem() {
  if (process.platform !== "win32") return false;

  try {
    // Check current user SID via .NET WindowsIdentity
    const psCommand = "[Security.Principal.WindowsIdentity]::GetCurrent().User.Value -eq 'S-1-5-18'";
    const base64Command = Buffer.from(psCommand, "utf16le").toString("base64");
    const { stdout } = execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${base64Command}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true
    });
    return stdout.trim().toLowerCase() === "true";
  } catch {
    // Fallback to whoami /user checking for S-1-5-18
    try {
      const { stdout } = execSync("whoami /user /fo csv /nh", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true
      });
      return stdout.includes("S-1-5-18");
    } catch {
      return false;
    }
  }
}

/**
 * Robust Windows command-line argument quoting according to standard Windows rules.
 * @param {string} arg
 * @returns {string}
 */
export function quoteArg(arg) {
  if (arg === undefined || arg === null || arg === "") return '""';
  if (!/[ \t\n\v"]/.test(arg)) {
    return arg;
  }
  let result = '"';
  for (let i = 0; i < arg.length; i++) {
    let backslashes = 0;
    while (i < arg.length && arg[i] === '\\') {
      backslashes++;
      i++;
    }
    if (i === arg.length) {
      result += '\\'.repeat(backslashes * 2);
      break;
    }
    if (arg[i] === '"') {
      result += '\\'.repeat(backslashes * 2 + 1) + '"';
    } else {
      result += '\\'.repeat(backslashes) + arg[i];
    }
  }
  result += '"';
  return result;
}

/**
 * Relaunches the current process with administrative privileges on Windows.
 * This will trigger a UAC prompt if not already elevated.
 */
export function elevate() {
  if (process.platform !== "win32" || isAdmin() || isSystem()) {
    return false;
  }

  const executable = process.execPath;
  // Filter out virtual pkg snapshot paths (e.g. C:\snapshot\...) from args
  const args = process.argv.slice(1).filter(arg => !arg || !arg.toLowerCase().includes("snapshot"));
  const argumentString = args.map(quoteArg).join(" ");

  // Use .NET ProcessStartInfo with UseShellExecute = true and Verb = 'runas' for robust elevation and argument preservation
  const psScript = `
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = '${executable.replace(/'/g, "''")}'
    $psi.Arguments = '${argumentString.replace(/'/g, "''")}'
    $psi.UseShellExecute = $true
    $psi.Verb = 'runas'
    $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    [System.Diagnostics.Process]::Start($psi)
  `;
  const base64Command = Buffer.from(psScript, "utf16le").toString("base64");

  try {
    execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${base64Command}`, { stdio: "ignore" });
    process.exit(0);
  } catch (error) {
    console.error("[Elevation] Failed to relaunch as administrator:", error.message);
    return false;
  }
}
