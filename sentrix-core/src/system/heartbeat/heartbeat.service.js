import {
  getAllClients,
  markClientOffline,
  markClientOnline,
  getClientSummary,
} from "../../modules/clients/clients.service.js";
import { isDeviceAliveInDiscovery } from "../../modules/discovery/discovery.service.js";

const WATCHER_INTERVAL_MS = 30000;
const REGISTRATION_GRACE_MS = 60000;

const registrationGracePeriods = new Map();

/**
 * Grants a temporary immunity from the offline watcher to a newly registered agent.
 */
export function grantRegistrationGrace(clientId) {
  if (!clientId) return;
  registrationGracePeriods.set(clientId, Date.now() + REGISTRATION_GRACE_MS);
}

/**
 * Unified watcher for device online/offline status (runs every 30 seconds):
 * 1. Checks registration grace period (keeps/marks online).
 * 2. Checks if device is in the last scanned devices (last network scan). If there, mark online, else mark offline.
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
            if (client.status !== "online") {
              await markClientOnline(client.id);
              changed = true;
            }
            continue;
          } else {
            registrationGracePeriods.delete(client.id);
          }
        }

        // Check if device is alive in last network scan results
        const aliveViaDiscovery = await isDeviceAliveInDiscovery(client.ip, client.mac);

        if (aliveViaDiscovery) {
          if (client.status !== "online") {
            await markClientOnline(client.id);
            changed = true;
          }
        } else {
          if (client.status !== "offline") {
            await markClientOffline(client.id);
            changed = true;
          }
        }
      }

      if (changed && io) {
        io.to("dashboards").emit("devices:update", await getClientSummary());
      }
    } catch (error) {
      console.error("[WATCHER] Error in device status watcher:", error);
    }
  }, WATCHER_INTERVAL_MS);
}
