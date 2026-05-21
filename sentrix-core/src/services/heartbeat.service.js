import { getAllClients, markClientOffline, getClientSummary } from "./client.services.js";

const HEARTBEAT_TIMEOUT_MS = Number(process.env.HEARTBEAT_TIMEOUT_MS || 60000);

/**
 * Periodically checks for clients that haven't reported in a while and marks them as offline.
 */
export function startOfflineWatcher(io) {
  setInterval(async () => {
    let changed = false;
    const now = Date.now();

    try {
      const clients = await getAllClients();

      for (const client of clients) {
        const timedOut = now - client.last_seen_at > HEARTBEAT_TIMEOUT_MS;

        if (timedOut && client.status !== "offline") {
          await markClientOffline(client.id);
          changed = true;
        }
      }

      if (changed && io) {
        io.to("dashboards").emit("devices:update", await getClientSummary());
      }
    } catch (error) {
      console.error("[HEARTBEAT] Error in offline watcher:", error);
    }
  }, 5000);
}
