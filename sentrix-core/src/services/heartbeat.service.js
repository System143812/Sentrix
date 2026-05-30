import { getAllClients, markClientOffline, getClientSummary } from "./client.services.js";

const HEARTBEAT_TIMEOUT_MS = Number(process.env.HEARTBEAT_TIMEOUT_MS || 90000);
const REGISTRATION_GRACE_MS = 60000;

const missedChecks = new Map();
const registrationGracePeriods = new Map();

/**
 * Grants a temporary immunity from the offline watcher to a newly registered agent.
 */
export function grantRegistrationGrace(clientId) {
  if (!clientId) return;
  registrationGracePeriods.set(clientId, Date.now() + REGISTRATION_GRACE_MS);
  missedChecks.delete(clientId);
}

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
        // Check for registration grace period
        const graceUntil = registrationGracePeriods.get(client.id);
        if (graceUntil) {
          if (now < graceUntil) {
            missedChecks.delete(client.id);
            continue;
          } else {
            registrationGracePeriods.delete(client.id);
          }
        }

        const timedOut = now - client.last_seen_at > HEARTBEAT_TIMEOUT_MS;

        if (timedOut) {
          if (client.status === "offline") {
            missedChecks.delete(client.id);
            continue;
          }

          // Status Dampening: Require 2 consecutive missed checks (approx 10s of confirmed silence)
          const currentMisses = (missedChecks.get(client.id) || 0) + 1;
          missedChecks.set(client.id, currentMisses);

          if (currentMisses >= 2) {
            await markClientOffline(client.id);
            missedChecks.delete(client.id);
            changed = true;
          }
        } else {
          // Reset counter if client is seen
          missedChecks.delete(client.id);
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
