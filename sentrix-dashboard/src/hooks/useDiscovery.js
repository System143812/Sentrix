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
      setMessage(result.message || `Deployment queued for ${ip}.`);
      return result;
    } catch (error) {
      setMessage(error.message || "Agent deployment failed.");
      throw error;
    } finally {
      setDeployingIp(null);
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
