import si from "systeminformation";
import { collectSafely, safeString, toNumber } from "./helpers.js";

export async function collectProcessMetrics() {
  return collectSafely(async () => {
    const processes = await si.processes();
    
    // We only take the top 20 processes by CPU to keep the payload size reasonable
    const sortedList = (processes.list || [])
      .sort((a, b) => (b.cpu || 0) - (a.cpu || 0))
      .slice(0, 30);

    return sortedList.map(p => ({
      pid: p.pid,
      parentPid: p.parentPid,
      name: safeString(p.name),
      user: safeString(p.user),
      cpu: toNumber(p.cpu, 0, 1),
      memoryMb: toNumber(p.memRss / 1024, 0, 1),
      state: safeString(p.state),
      command: safeString(p.command),
    }));
  }, []);
}
