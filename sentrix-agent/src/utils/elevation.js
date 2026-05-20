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
    // 'net session' requires administrative privileges
    execSync("net session", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Relaunches the current process with administrative privileges on Windows.
 * This will trigger a UAC prompt if not already elevated.
 */
export function elevate() {
  if (process.platform !== "win32" || isAdmin()) {
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
