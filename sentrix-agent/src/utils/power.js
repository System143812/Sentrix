import { execFile } from "child_process";
import { promisify } from "util";
import { sendMessage } from "./ipc.js";

const execFileAsync = promisify(execFile);

/**
 * Executes a Windows-specific power command (shutdown, restart, etc.).
 * Only works on Windows agents.
 */
export async function runRemotePowerCommand(command) {
  if (process.platform !== "win32") {
    return { success: false, message: `${command} is only supported on Windows agents.` };
  }

  // Handle lock via IPC helper in Session 1 for interactive session access
  if (command === "lock") {
    const ipcPort = Number(process.env.SENTRIX_IPC_PORT || 4101);
    console.log(`[Power] Attempting delivery of lock command via IPC helper on port ${ipcPort}...`);
    const success = await sendMessage(ipcPort, { type: "lock" });

    if (success) {
      console.log(`[Power] SUCCESS: Lock command delivered via helper process.`);
      return { success: true, message: "Workstation lock command delivered via helper process." };
    }
    console.warn(`[Power] Helper not responding on port ${ipcPort}. Falling back to direct execution.`);
  }

  const commands = {
    shutdown: ["shutdown.exe", ["/s", "/t", "0"]],
    restart: ["shutdown.exe", ["/r", "/t", "0"]],
    sleep: ["rundll32.exe", ["powrprof.dll,SetSuspendState", "0,1,0"]],
    lock: ["rundll32.exe", ["user32.dll,LockWorkStation"]],
    update: ["UsoClient.exe", ["StartScan"]],
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

    return { success: true, message: `${command} command accepted.` };
  } catch (error) {
    return {
      success: false,
      message: error.message || `Failed to run ${command}.`,
    };
  }
}
