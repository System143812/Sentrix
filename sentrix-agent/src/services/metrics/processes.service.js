import si from "systeminformation";
import { execFile } from "child_process";
import { promisify } from "util";
import { collectSafely, safeString, toNumber } from "./helpers.js";
import { sendMessage } from "../../utils/ipc.js";
import { getActiveSessionManager } from "../session-manager.js";

const execFileAsync = promisify(execFile);

/**
 * Collect active apps with window titles natively via Helper (Session 1+) or fallback to PowerShell on Windows.
 * Strictly returns ONLY processes with a non-empty MainWindowTitle (Taskbar Apps).
 */
export async function collectActiveApps() {
  if (process.platform !== "win32") return [];

  // 1. Try helper running in interactive user session via IPC
  const manager = getActiveSessionManager();
  if (manager && manager.sessions) {
    for (const [sid, rec] of manager.sessions.entries()) {
      if (rec.port) {
        try {
          const res = await sendMessage(rec.port, { type: "get_active_apps" });
          if (res && res.success && Array.isArray(res.activeApps)) {
            const mapped = res.activeApps.map(p => ({
              name: safeString(p.name),
              pid: Number(p.pid),
              windowTitle: safeString(p.windowTitle)
            }));
            console.log(`[Metrics] collectActiveApps (via Helper): Collected ${mapped.length} active app(s):`, mapped);
            return mapped;
          }
        } catch {}
      }
    }
  }

  // 2. Fallback to direct PowerShell execution (e.g. dev mode running in user session)
  try {
    const script = `
      $ignored = @('textinputhost', 'searchhost', 'startmenuexperiencehost', 'shellexperiencehost', 'lockapp', 'applicationframehost', 'systemsettings', 'cortana');
      Get-Process | Where-Object { $_.MainWindowTitle -ne '' -and $ignored -notcontains $_.ProcessName.ToLower() } | Select-Object ProcessName, Id, MainWindowTitle | ConvertTo-Json -Compress
    `;
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], { timeout: 5000, windowsHide: true });
    if (!stdout || stdout.trim() === "") {
      console.log("[Metrics] collectActiveApps: PowerShell returned empty stdout.");
      return [];
    }
    const parsed = JSON.parse(stdout);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const ignoredSet = new Set(['textinputhost', 'searchhost', 'startmenuexperiencehost', 'shellexperiencehost', 'lockapp', 'applicationframehost', 'systemsettings', 'cortana']);
    const mapped = list
      .filter(p => !ignoredSet.has((p.ProcessName || "").toLowerCase()))
      .map(p => ({
        name: safeString(p.ProcessName),
        pid: Number(p.Id),
        windowTitle: safeString(p.MainWindowTitle)
      }));
    console.log(`[Metrics] collectActiveApps (direct fallback): Collected ${mapped.length} active app(s):`, mapped);
    return mapped;
  } catch (err) {
    console.log("[Metrics] collectActiveApps failed:", err.message);
    return [];
  }
}

/**
 * Collect all running processes for Process Monitor, enriched with window titles for active taskbar apps.
 */
export async function collectProcessMetrics() {
  return collectSafely(async () => {
    const [processes, activeApps] = await Promise.all([
      si.processes().catch(() => ({ list: [] })),
      collectActiveApps().catch(() => [])
    ]);

    const rawList = processes.list || [];

    // Map window titles by PID and by process name lowercase
    const titleByPid = new Map();
    const titleByName = new Map();
    activeApps.forEach(app => {
      if (app.pid && app.windowTitle) {
        titleByPid.set(app.pid, app.windowTitle);
      }
      if (app.name && app.windowTitle) {
        titleByName.set(app.name.toLowerCase(), app.windowTitle);
      }
    });

    // Filter out system idle
    const filtered = rawList.filter(p => {
      const name = (p.name || "").toLowerCase();
      return name !== "idle";
    });

    return filtered
      .map(p => {
        const title = titleByPid.get(p.pid) || titleByName.get((p.name || "").toLowerCase()) || "";
        return {
          pid: p.pid,
          name: safeString(p.name),
          user: safeString(p.user),
          cpu: toNumber(p.cpu, 0, 1),
          memoryMb: toNumber(p.memRss / 1024, 0, 1),
          state: safeString(p.state),
          windowTitle: safeString(title)
        };
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
