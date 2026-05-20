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
    // Check for High Mandatory Level (S-1-16-12288) or System Mandatory Level (S-1-16-16384)
    // Also check for the Administrators group (S-1-5-32-544)
    const { stdout } = execSync("whoami /groups /fo csv /nh", { 
      encoding: "utf8", 
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true
    });
    
    const hasHighIntegrity = stdout.includes("S-1-16-12288") || stdout.includes("S-1-16-16384");
    const isLocalAdmin = stdout.includes("S-1-5-32-544");
    
    if (hasHighIntegrity || isLocalAdmin) return true;

    // Fallback if whoami groups is ambiguous
    try {
      execSync("net session", { stdio: "ignore", windowsHide: true });
      return true;
    } catch {
      return false;
    }
  } catch {
    // Ultimate fallback
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
    // Check for System Mandatory Level (S-1-16-16384) in groups
    const { stdout: groups } = execSync("whoami /groups /fo csv /nh", { 
      encoding: "utf8", 
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true
    });
    if (groups.includes("S-1-16-16384")) return true;

    // Check if the user SID is SYSTEM (S-1-5-18)
    const { stdout: user } = execSync("whoami /user /fo csv /nh", { 
      encoding: "utf8", 
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true
    });
    if (user.includes("S-1-5-18")) return true;

    // Fallback to name check (less reliable but okay as last resort)
    const { stdout: name } = execSync("whoami", { 
      encoding: "utf8", 
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true
    });
    return name.trim().toLowerCase().includes("system") || name.toLowerCase().includes("système");
  } catch {
    return false;
  }
}

/**
 * Relaunches the current process with administrative privileges on Windows.
 * This will trigger a UAC prompt if not already elevated.
 */
export function elevate() {
  if (process.platform !== "win32" || isAdmin() || isSystem()) {
    return false;
  }

  // Use PowerShell to relaunch the process with 'RunAs' verb
  const executable = process.argv[0];
  const args = process.argv.slice(1).map(arg => `"${arg}"`).join(" ");
  
  const command = `Start-Process "${executable}" -ArgumentList ${args} -Verb RunAs -WindowStyle Hidden`;
  
  try {
    execSync(`powershell -Command "${command}"`, { stdio: "ignore" });
    process.exit(0);
    return true;
  } catch (error) {
    console.error("[Elevation] Failed to relaunch as administrator:", error.message);
    return false;
  }
}
