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
  const [interfaces, setInterfaces] = useState([]);
  const [message, setMessage] = useState("");
  const [deployingIp, setDeployingIp] = useState(null);
  const [socket, setSocket] = useState(null);

  const refreshSnapshot = useCallback(async () => {
    const nextSnapshot = await discoveryApi.getDiscoverySnapshot();
    setSnapshot(nextSnapshot || emptySnapshot);
  }, []);

  const refreshInterfaces = useCallback(async () => {
    try {
      const data = await discoveryApi.getInterfaces();
      setInterfaces(data || []);
    } catch (error) {
      console.error("Failed to load interfaces:", error);
    }
  }, []);

  useEffect(() => {
    refreshSnapshot();
    refreshInterfaces();

    const s = io(apiUrl, {
      withCredentials: true,
      query: {
        role: "dashboard",
      },
    });

    setSocket(s);

    s.on("connect", () => {
      const preferred = localStorage.getItem("sentrix_preferred_subnet");
      if (preferred) {
        s.emit("discovery:set_preferred_subnet", preferred);
      }
    });

    s.on("discovery:update", (nextSnapshot) => {
      if (nextSnapshot) {
        setSnapshot(nextSnapshot);
      }
    });

    return () => {
      s.disconnect();
    };
  }, [refreshSnapshot, refreshInterfaces]);

  async function rescan(subnet = null) {
    setMessage("");
    try {
      const nextSnapshot = await discoveryApi.scanNetwork(subnet);
      setSnapshot(nextSnapshot || emptySnapshot);
    } catch (error) {
      setMessage(error.message || "Unable to rescan network.");
    }
  }

  function setSubnet(subnet) {
    if (socket?.connected && subnet) {
      socket.emit("discovery:set_preferred_subnet", subnet);
    }
  }

  async function deploy(ip, deviceType, credentials = null, action = "deploy") {
    setDeployingIp(ip);
    setMessage("");
    try {
      const result = await discoveryApi.deployAgent(ip, deviceType, credentials, action);
      setMessage(result.message || `${action === "activate" ? "Activation" : action === "update" ? "Update" : "Setup"} successful for ${ip}.`);
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
    interfaces,
    message,
    deployingIp,
    rescan,
    setSubnet,
    deploy,
  };
}
