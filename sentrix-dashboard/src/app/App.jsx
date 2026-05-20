import React, { useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  Home,
  LoaderCircle,
  LogOut,
  MonitorCog,
  Network,
  RefreshCcw,
  Settings,
  UserCircle,
  Wifi,
  WifiOff,
} from "lucide-react";
import { TabNav } from "../components/TabNav.jsx";
import { SentrixLogo, SentrixLogoLoader } from "../components/SentrixLogo.jsx";
import { useDevices } from "../hooks/useDevices.js";
import { useDiscovery } from "../hooks/useDiscovery.js";
import { LoginPage } from "../pages/LoginPage.jsx";
import { HomePage } from "../pages/HomePage.jsx";
import { DevicesPage } from "../pages/DevicesPage.jsx";
import { NetworkPage } from "../pages/NetworkPage.jsx";
import { AnalyticsPage } from "../pages/AnalyticsPage.jsx";
import { SettingsPage } from "../pages/SettingsPage.jsx";
import * as authApi from "../services/authApi.js";
import * as groupApi from "../services/groupApi.js";

const tabs = [
  { id: "home", label: "Home", icon: Home },
  { id: "network", label: "Network", icon: Network },
  { id: "devices", label: "Devices", icon: MonitorCog },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [groups, setGroups] = useState([]);

  useEffect(() => {
    async function initialize() {
      try {
        const currentUser = await authApi.getCurrentUser();
        setUser(currentUser);
      } catch (error) {
        authApi.clearSavedLogin();
      } finally {
        setAuthReady(true);
      }
    }

    initialize();
  }, []);

  async function loadGroups() {
    try {
      const nextGroups = await groupApi.getGroups();
      setGroups(nextGroups || []);
    } catch (error) {
      console.warn("Failed to load groups:", error.message);
    }
  }

  useEffect(() => {
    if (user) {
      loadGroups();
    }
  }, [user]);

  async function handleLogin(email, password) {
    setAuthError(null);

    try {
      const currentUser = await authApi.login(email, password);
      setUser(currentUser);
      await loadGroups();
      setActiveTab("home");
    } catch (error) {
      setAuthError(error.message || "Failed to sign in.");
    }
  }

  async function handleLogout() {
    try {
      await authApi.logout();
    } catch (error) {
      console.warn("Logout request failed:", error.message);
    }

    setUser(null);
    setActiveTab("home");
  }

  if (!authReady) {
    return (
      <main className="min-h-screen bg-mist text-ink">
        <div className="mx-auto flex h-screen max-w-4xl items-center justify-center px-4">
          <div className="rounded-lg border border-line bg-white p-6 text-center shadow-xl">
            <SentrixLogoLoader label="Checking login status..." />
          </div>
        </div>
      </main>
    );
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} error={authError} />;
  }

  return (
    <DashboardShell
      user={user}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      groups={groups}
      onGroupsChanged={loadGroups}
      onLogout={handleLogout}
    />
  );
}

function DashboardShell({
  user,
  activeTab,
  setActiveTab,
  groups,
  onGroupsChanged,
  onLogout,
}) {
  const {
    dashboardData,
    connected,
    loading,
    updateGroup,
    refresh,
    archiveDevice,
  } = useDevices();
  const discovery = useDiscovery();

  return (
    <main className="min-h-screen bg-mist text-ink">
      <div className="border-b border-line bg-white/90 shadow-sm backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
              <SentrixLogo />
              <TabNav
                tabs={tabs}
                activeTab={activeTab}
                onSelect={setActiveTab}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${
                connected
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {connected ? <Wifi size={16} /> : <WifiOff size={16} />}
              {connected ? "Realtime connected" : "Realtime offline"}
            </span>

            <span className="inline-flex items-center gap-2 rounded-md border border-line bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
              <UserCircle size={16} />
              {user.role === "network_admin" ? "Network Admin" : "Admin"}
            </span>

            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink shadow-sm transition hover:border-signal hover:text-signal disabled:cursor-wait disabled:opacity-70"
              onClick={refresh}
              disabled={loading}
              type="button"
            >
              {loading ? (
                <LoaderCircle className="animate-spin" size={16} />
              ) : (
                <RefreshCcw size={16} />
              )}
              <span className="hidden sm:inline">{loading ? "Refreshing" : "Refresh"}</span>
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-red-400 hover:text-red-600"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
          </header>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        {activeTab === "home" ? (
          <HomePage
            user={user}
            dashboardData={dashboardData}
            loading={loading}
            onUpdateGroup={updateGroup}
            groups={groups}
            onArchive={archiveDevice}
          />
        ) : activeTab === "network" ? (
          <NetworkPage
            snapshot={discovery.snapshot}
            onScan={discovery.rescan}
            onDeploy={discovery.deploy}
            deployMessage={discovery.message}
            deployingIp={discovery.deployingIp}
          />
        ) : activeTab === "devices" ? (
          <DevicesPage
            dashboardData={dashboardData}
            loading={loading}
            onUpdateGroup={updateGroup}
            groups={groups}
            onArchive={archiveDevice}
          />
        ) : activeTab === "analytics" ? (
          <AnalyticsPage dashboardData={dashboardData} loading={loading} />
        ) : (
          <SettingsPage
            user={user}
            groups={groups}
            onGroupsChanged={onGroupsChanged}
          />
        )}

        <footer className="flex items-center gap-2 text-xs text-slate-500">
          <Activity size={14} />
          Device lifecycle: discover, register, monitor, organize, control.
        </footer>
      </div>
    </main>
  );
}
