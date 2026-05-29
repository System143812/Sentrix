import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

/**
 * Watchdog service that ensures the sentrix-helper is always running.
 * Uses the permanent "Sentrix Helper" scheduled task created during installation.
 */
export function startHelperWatchdog() {
  if (process.platform !== "win32") return;

  console.log("[Watchdog] Starting Sentrix Helper phoenix service (Permanent Task Mode)...");

  const checkAndRestart = async () => {
    try {
      // Check if sentrix-helper is running
      const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq sentrix-helper*" /NH');
      const isRunning = stdout.toLowerCase().includes("sentrix-helper");

      if (!isRunning) {
        console.warn("[Watchdog] Sentrix Helper is NOT running. Rebirthing via Scheduled Task...");

        // Simple, clean command: Start the existing permanent task
        // Windows handles the user session and hidden window because the task is already configured.
        const command = `powershell -NoProfile -Command "Start-ScheduledTask -TaskName 'Sentrix Helper' -ErrorAction SilentlyContinue"`;

        exec(command, (err) => {
            if (err) {
                console.error("[Watchdog] Relaunch failed (Task might be missing):", err.message);
            } else {
                console.log("[Watchdog] Relaunch signal sent to 'Sentrix Helper' task.");
            }
        });
      }
    } catch (err) {
      console.error("[Watchdog] Error in watchdog loop:", err.message);
    }
  };

  // Check every 30 seconds
  setInterval(checkAndRestart, 30000);
  
  // Also run immediately on start
  checkAndRestart();
}
