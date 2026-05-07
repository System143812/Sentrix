import { useCallback, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { fetchJson } from "../services/api.js";
import { updateClientGroup, archiveClient } from "../services/clientApi.js";

const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";

const emptyDashboardData = {
  total: 0,
  online: 0,
  offline: 0,
  clients: [],
};

async function fetchDashboardData() {
  try {
    const result = await fetchJson("/api/clients");
    if (result && result.data && result.data.clients) {
      return result.data;
    }
    return emptyDashboardData;
  } catch (error) {
    console.error("Failed to fetch dashboard data:", error);
    return emptyDashboardData;
  }
}

export function useDevices() {
  const [dashboardData, setDashboardData] = useState(emptyDashboardData);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const nextDashboardData = await fetchDashboardData();
    setDashboardData(nextDashboardData);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();

    const socket = io(apiUrl, {
      withCredentials: true,
      query: {
        role: "dashboard",
      },
    });

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("devices:update", (nextDashboardData) => {
      // Only update if we received valid data
      if (nextDashboardData && nextDashboardData.clients) {
        setDashboardData(nextDashboardData);
      }
      setLoading(false);
    });

    return () => {
      socket.disconnect();
    };
  }, [refresh]);

  async function updateGroup(id, group) {
    const nextClient = await updateClientGroup(id, group);

    setDashboardData((current) => ({
      ...current,
      clients: current.clients.map((client) =>
        client.id === id ? nextClient : client,
      ),
    }));
  }

  async function archiveDevice(id) {
    await archiveClient(id);
    await refresh();
  }

  return {
    dashboardData,
    connected,
    loading,
    refresh,
    updateGroup,
    archiveDevice,
  };
}
