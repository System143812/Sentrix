import si from "systeminformation";
import { execFile } from "child_process";
import { promisify } from "util";
import { collectSafely, safeString, toNumber } from "./helpers.js";

const execFileAsync = promisify(execFile);

/**
 * Clean, high-performance process collection.
 */
export async function collectProcessMetrics() {
  return collectSafely(async () => {
    const processes = await si.processes();
    const rawList = processes.list || [];
    
    const simplifiedList = rawList.map(p => ({
      pid: p.pid,
      name: safeString(p.name),
      user: safeString(p.user),
      cpu: toNumber(p.cpu, 0, 1),
      memoryMb: toNumber(p.memRss / 1024, 0, 1),
      state: safeString(p.state)
    }));

    // Filter out Idle/System and Sort by CPU
    return simplifiedList
      .filter(p => {
        const name = p.name.toLowerCase();
        return name !== "idle" && name !== "system";
      })
      .sort((a, b) => (b.cpu || 0) - (a.cpu || 0))
      .slice(0, 200);
  }, []);
}

export async function killProcess(pid) {
  try {
    if (!pid) throw new Error("No PID provided.");
    
    if (process.platform === "win32") {
      await execFileAsync("C:\\Windows\\System32\\taskkill.exe", ["/F", "/PID", pid.toString()]);
    } else {
      process.kill(pid, "SIGKILL");
    }
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  }
}
