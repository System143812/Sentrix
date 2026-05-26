import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Executes a Windows-specific power command (shutdown, restart, etc.).
 * Only works on Windows agents.
 */
export async function runRemotePowerCommand(command) {
  if (process.platform !== "win32") {
    return { success: false, message: `${command} is only supported on Windows agents.` };
  }

  const commands = {
    shutdown: ["shutdown.exe", ["/s", "/t", "0"]],
    restart: ["shutdown.exe", ["/r", "/t", "0"]],
    sleep: ["rundll32.exe", ["powrprof.dll,SetSuspendState", "0,1,0"]],
    lock: ["user32.dll,LockWorkStation"], // Note: Lock usually uses rundll32 too
    update: ["UsoClient.exe", ["StartScan"]],
  };

  // Special case for lock which often needs rundll32
  if (command === 'lock') {
      commands.lock = ["rundll32.exe", ["user32.dll,LockWorkStation"]];
  }

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
