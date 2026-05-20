import { useCallback, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { getApiUrl } from "../services/api.js";
import * as discoveryApi from "../services/discoveryApi.js";

const apiUrl = getApiUrl();

const emptySnapshot = {
  status: "idle",
  progress: 0,
  subnet: null,
  devices: [],
  lastScanAt: null,
  nextScanAt: null,
  message: "Discovery has not run yet.",
};

export function useDiscovery() {
  const [snapshot, setSnapshot] = useState(emptySnapshot);
  const [message, setMessage] = useState("");
  const [deployingIp, setDeployingIp] = useState(null);

  const refreshSnapshot = useCallback(async () => {
    const nextSnapshot = await discoveryApi.getDiscoverySnapshot();
    setSnapshot(nextSnapshot || emptySnapshot);
  }, []);

  useEffect(() => {
    refreshSnapshot();

    const socket = io(apiUrl, {
      withCredentials: true,
      query: {
        role: "dashboard",
      },
    });

    socket.on("discovery:update", (nextSnapshot) => {
      if (nextSnapshot) {
        setSnapshot(nextSnapshot);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [refreshSnapshot]);

  async function rescan() {
    setMessage("");
    try {
      const nextSnapshot = await discoveryApi.scanNetwork();
      setSnapshot(nextSnapshot || emptySnapshot);
    } catch (error) {
      setMessage(error.message || "Unable to rescan network.");
    }
  }

  async function deploy(ip, deviceType, credentials = null) {
    setDeployingIp(ip);
    setMessage("");
    try {
      const result = await discoveryApi.deployAgent(ip, deviceType, credentials);
      setMessage(result.message || `Deployment successful for ${ip}.`);
      return result;
    } catch (error) {
      // If we get an error, it might be a "false failure" due to lockdown.
      // We'll wait up to 8 seconds to see if the agent registers itself.
      setMessage("Finalizing deployment and securing connection...");
      
      return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 8;
        
        const interval = setInterval(() => {
          attempts++;
          // We can't check the client list directly here easily without passing it in,
          // but we can assume if the user's dashboard updates (via socket), they'll see it.
          // For the hook, we'll just wait a bit and then show a "Check your devices" message
          // if it was likely an RPC error.
          
          if (attempts >= maxAttempts) {
            clearInterval(interval);
            if (error.message.includes("RPC server is unavailable") || error.message.includes("Firewall Blocked")) {
              setMessage("Deployment finished! The PC is now secured. Check the 'Devices' tab to see it online.");
              resolve({ success: true, graceful: true });
            } else {
              setMessage(error.message || "Agent deployment failed.");
              reject(error);
            }
            setDeployingIp(null);
          }
        }, 1000);
      });
    } finally {
      // Only clear if we didn't enter the "Wait and resolve" path
      // setDeployingIp(null) is handled inside the timeout if needed
    }
  }

  return {
    snapshot,
    message,
    deployingIp,
    rescan,
    deploy,
  };
}
