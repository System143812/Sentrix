import { execFile } from "child_process";
import { promisify } from "util";
import { sendMessage } from "./ipc.js";
import { getActiveSessionManager } from "../services/session-manager.js";

const execFileAsync = promisify(execFile);

/**
 * Executes a Windows-specific power command (shutdown, restart, etc.).
 * Only works on Windows agents.
 */
export async function runRemotePowerCommand(command) {
  if (process.platform !== "win32") {
    return { success: false, message: `${command} is only supported on Windows agents.` };
  }

  // Handle lock via IPC helper in interactive session if available
  if (command === "lock") {
    const sm = getActiveSessionManager();
    const endpoints = sm ? sm.getActiveHelperEndpoints() : [];

    if (endpoints.length > 0) {
      console.log(`[Power] Attempting delivery of lock command to ${endpoints.length} active helper session(s)...`);
      const results = await Promise.allSettled(
        endpoints.map(ep => sendMessage(ep.port, { type: "lock" }))
      );
      const successCount = results.filter(r => r.status === "fulfilled" && r.value && r.value.success).length;
      if (successCount > 0) {
        console.log(`[Power] SUCCESS: Lock command delivered to ${successCount} helper process(es).`);
        return { success: true, message: "Workstation lock command delivered via helper process(es)." };
      }
    }
    console.warn(`[Power] No active session helpers responding. Falling back to direct execution (Session 0).`);
  }

  const commands = {
    shutdown: ["shutdown.exe", ["/s", "/t", "0"]],
    restart: ["shutdown.exe", ["/r", "/t", "0"]],
    sleep: ["rundll32.exe", ["powrprof.dll,SetSuspendState", "0,1,0"]],
    lock: ["rundll32.exe", ["user32.dll,LockWorkStation"]],
  };

  const [binary, args] = commands[command] || [];

  if (!binary) {
    return { success: false, message: `Unknown command: ${command}` };
  }

  try {
    await execFileAsync(binary, args, {
      timeout: 10000,
      windowsHide: true,
    });

    if (command === "lock") {
      return { success: true, message: "Workstation lock executed via direct fallback (Session 0)." };
    }

    return { success: true, message: `${command} command accepted.` };
  } catch (error) {
    return {
      success: false,
      message: error.message || `Failed to run ${command}.`,
    };
  }
}
