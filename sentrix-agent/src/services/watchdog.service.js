import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const execAsync = promisify(exec);

const currentFile = import.meta.url ? fileURLToPath(import.meta.url) : "";
const currentDir = currentFile ? path.dirname(currentFile) : process.cwd();
const exeDir = process.pkg ? path.dirname(process.execPath) : path.resolve(currentDir, "../..");

/**
 * Watchdog service that ensures the sentrix-helper is always running
 * and checks for pending update binaries to perform surgical swaps.
 */
export function startHelperWatchdog() {
  if (process.platform !== "win32") return;

  console.log("[Watchdog] Starting Sentrix Watchdog & Update Swapper...");

  const checkAndRestart = async () => {
    try {
      // 1. Check for pending updates (sentrix-agent-update.exe / sentrix-helper-update.exe)
      const agentUpdatePath = path.join(exeDir, "sentrix-agent-update.exe");
      const helperUpdatePath = path.join(exeDir, "sentrix-helper-update.exe");

      if (fs.existsSync(agentUpdatePath) || fs.existsSync(helperUpdatePath)) {
        console.log("[Watchdog] Detected pending update binaries. Performing surgical swap...");

        // Stop scheduled tasks and processes to release file locks
        await execAsync('schtasks /end /tn "Sentrix Helper"').catch(() => {});
        await execAsync('schtasks /end /tn "Sentrix Agent"').catch(() => {});
        await execAsync('taskkill /F /IM sentrix-helper*').catch(() => {});
        await execAsync('taskkill /F /IM sentrix-agent*').catch(() => {});

        // Wait a moment for file locks to clear
        await new Promise((resolve) => setTimeout(resolve, 2000));

        if (fs.existsSync(helperUpdatePath)) {
          let swapped = false;
          for (let i = 1; i <= 5; i++) {
            try {
              await execAsync('taskkill /F /IM sentrix-helper*').catch(() => {});
              const targetPath = path.join(exeDir, "sentrix-helper.exe");
              if (fs.existsSync(targetPath)) {
                try { fs.unlinkSync(targetPath); } catch {}
              }
              fs.copyFileSync(helperUpdatePath, targetPath);
              fs.unlinkSync(helperUpdatePath);
              swapped = true;
              console.log(`[Watchdog] Successfully swapped sentrix-helper.exe on attempt ${i}`);
              break;
            } catch (err) {
              console.warn(`[Watchdog] Attempt ${i} to swap sentrix-helper.exe failed: ${err.message}. Retrying in 1s...`);
              await new Promise((r) => setTimeout(r, 1000));
            }
          }
          if (!swapped) {
            console.error("[Watchdog] Failed to swap sentrix-helper.exe after 5 attempts.");
          }
        }

        if (fs.existsSync(agentUpdatePath)) {
          let swapped = false;
          for (let i = 1; i <= 5; i++) {
            try {
              await execAsync('taskkill /F /IM sentrix-agent*').catch(() => {});
              const targetPath = path.join(exeDir, "sentrix-agent.exe");
              if (fs.existsSync(targetPath)) {
                try { fs.unlinkSync(targetPath); } catch {}
              }
              fs.copyFileSync(agentUpdatePath, targetPath);
              fs.unlinkSync(agentUpdatePath);
              swapped = true;
              console.log(`[Watchdog] Successfully swapped sentrix-agent.exe on attempt ${i}`);
              break;
            } catch (err) {
              console.warn(`[Watchdog] Attempt ${i} to swap sentrix-agent.exe failed: ${err.message}. Retrying in 1s...`);
              await new Promise((r) => setTimeout(r, 1000));
            }
          }
          if (!swapped) {
            console.error("[Watchdog] Failed to swap sentrix-agent.exe after 5 attempts.");
          }
        }

        // Relaunch helper and agent tasks
        exec('schtasks /run /tn "Sentrix Helper"', (err) => {
          if (err) console.error("[Watchdog] Failed to relaunch Sentrix Helper task:", err.message);
        });
        exec('schtasks /run /tn "Sentrix Agent"', (err) => {
          if (err) {
            console.error("[Watchdog] Failed to relaunch Sentrix Agent task:", err.message);
          } else {
            console.log("[Watchdog] Sentrix Agent relaunch signal sent.");
          }
        });
        return;
      }

      // 2. Check if sentrix-helper is running
      const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq sentrix-helper*" /NH');
      const isRunning = stdout.toLowerCase().includes("sentrix-helper");

      if (!isRunning) {
        console.warn("[Watchdog] Sentrix Helper is NOT running. Rebirthing via Scheduled Task...");

        const command = `schtasks /run /tn "Sentrix Helper"`;
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

