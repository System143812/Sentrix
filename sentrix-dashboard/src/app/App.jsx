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
  ClipboardList,
  UserCircle,
  Wifi,
  WifiOff,
} from "lucide-react";
import { TabNav } from "../components/TabNav.jsx";
import { SentrixLogo, SentrixLogoLoader } from "../components/SentrixLogo.jsx";
import { ToastProvider, useToast } from "../components/ToastProvider.jsx";
import { useDevices } from "../hooks/useDevices.js";
import { useDiscovery } from "../hooks/useDiscovery.js";
import { LoginPage } from "../pages/LoginPage.jsx";
import { HomePage } from "../pages/HomePage.jsx";
import { DevicesPage } from "../pages/DevicesPage.jsx";
import { NetworkPage } from "../pages/NetworkPage.jsx";
import { AnalyticsPage } from "../pages/AnalyticsPage.jsx";
import { SettingsPage } from "../pages/SettingsPage.jsx";
import { AuditPage } from "../pages/AuditPage.jsx";
import * as authApi from "../services/authApi.js";
import * as groupApi from "../services/groupApi.js";

const tabs = [
  { id: "home", label: "Home", icon: Home },
  { id: "network", label: "Network", icon: Network },
  { id: "devices", label: "Devices", icon: MonitorCog },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "audit", label: "Logs", icon: ClipboardList },
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
    <ToastProvider>
      <DashboardShell
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        groups={groups}
        onGroupsChanged={loadGroups}
        onLogout={handleLogout}
      />
    </ToastProvider>
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
  const { notify } = useToast();

  async function handleUpdateGroup(id, group) {
    const device = dashboardData.clients?.find((client) => client.id === id);

    try {
      await updateGroup(id, group);
      notify(`${device?.hostname || "Device"} moved to ${group}.`, "success");
    } catch (error) {
      notify(error.message || "Unable to update device group.", "failed");
      throw error;
    }
  }

  async function handleArchiveDevice(deviceOrId) {
    const id = typeof deviceOrId === "object" ? deviceOrId.id : deviceOrId;
    const hostname =
      typeof deviceOrId === "object"
        ? deviceOrId.hostname
        : dashboardData.clients?.find((client) => client.id === id)?.hostname;

    try {
      await archiveDevice(id);
      notify(`${hostname || "Device"} archived.`, "success");
    } catch (error) {
      notify(error.message || "Unable to archive device.", "failed");
      throw error;
    }
  }

  return (
    <main className="min-h-screen bg-mist text-ink">
      <div className="border-b border-line bg-white/90 shadow-sm backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
              <SentrixLogo />
              <TabNav
                tabs={tabs.filter((tab) => tab.id !== "audit" || user.role === "network_admin")}
                activeTab={activeTab}
                onSelect={setActiveTab}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 font-ui">
            <span
              title={connected ? "Live" : "Offline"}
              aria-label={connected ? "Live connection" : "Offline connection"}
              className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide shadow-sm ${
                connected
                  ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                  : "border-rose-100 bg-rose-50 text-rose-700"
              }`}
            >
              {connected ? <Wifi size={14} strokeWidth={2.5} /> : <WifiOff size={14} strokeWidth={2.5} />}
              <span className="hidden sm:inline">{connected ? "Live" : "Offline"}</span>
            </span>

            <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200/60 bg-slate-50 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 shadow-sm">
              <UserCircle size={14} strokeWidth={2.5} />
              {user.role === "network_admin" ? "Network Admin" : "Admin"}
            </span>

            <button
              className="btn-minimal h-10 px-4 disabled:cursor-wait disabled:opacity-70"
              onClick={refresh}
              disabled={loading}
              type="button"
            >
              {loading ? (
                <LoaderCircle className="animate-spin" size={15} />
              ) : (
                <RefreshCcw size={15} strokeWidth={2.5} />
              )}
              <span className="hidden text-[10px] font-bold uppercase tracking-wide sm:inline">
                {loading ? "Syncing" : "Sync"}
              </span>
            </button>

            <button
              type="button"
              onClick={onLogout}
              title="Logout"
              aria-label="Logout"
              className="btn-minimal h-10 px-3 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 sm:px-4"
            >
              <LogOut size={15} strokeWidth={2.5} />
              <span className="hidden text-[10px] font-bold uppercase tracking-wide sm:inline">Logout</span>
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
            onUpdateGroup={handleUpdateGroup}
            groups={groups}
            onArchive={handleArchiveDevice}
            canControl={["network_admin", "admin"].includes(user.role)}
            canManagePeripherals={user.role === "network_admin"}
          />
        ) : activeTab === "network" ? (
          <NetworkPage
            user={user}
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
            onUpdateGroup={handleUpdateGroup}
            groups={groups}
            onArchive={handleArchiveDevice}
            canControl={["network_admin", "admin"].includes(user.role)}
            canManagePeripherals={user.role === "network_admin"}
          />
        ) : activeTab === "analytics" ? (
          <AnalyticsPage dashboardData={dashboardData} loading={loading} />
        ) : activeTab === "audit" ? (
          <AuditPage />
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
