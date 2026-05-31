import React, { useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  ChevronDown,
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
import { BlurOverlay } from "../components/BlurOverlay.jsx";
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
        <BlurOverlay isOpen={true}>
          <div className="rounded-lg border border-line bg-white p-6 text-center shadow-xl">
            <SentrixLogoLoader label="Checking login status..." />
          </div>
        </BlurOverlay>
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

export function DashboardShell({
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
      <div className="sticky top-0 z-[1000] border-b border-line bg-white/95 shadow-sm backdrop-blur-md">
        <div className="mx-auto w-full max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
            {/* Left: Brand */}
            <div className="shrink-0">
              <SentrixLogo />
            </div>

            {/* Center: Navigation (Always Centered) */}
            <div className="order-last flex w-full flex-1 justify-center md:order-none md:w-auto">
              <TabNav
                tabs={tabs.filter((tab) => tab.id !== "audit" || user.role === "network_admin")}
                activeTab={activeTab}
                onSelect={setActiveTab}
              />
            </div>

            {/* Right: Actions Cluster */}
            <div className="flex items-center gap-2">
              <span
                title={connected ? "Live" : "Offline"}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest shadow-sm transition-all ${
                  connected
                    ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                    : "border-rose-100 bg-rose-50 text-rose-700"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                {connected ? "Live" : "Offline"}
              </span>

              <div className="group relative">
                <button className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-slate-500 shadow-sm transition-all hover:border-slate-900 hover:text-slate-900 active:scale-95">
                  <UserCircle size={18} strokeWidth={2.5} />
                  <span className="hidden text-[10px] font-bold uppercase tracking-widest sm:inline">
                    {user.role === "network_admin" ? "Network Admin" : "Admin"}
                  </span>
                  <ChevronDown size={14} className="transition-transform group-hover:rotate-180" strokeWidth={2.5} />
                </button>
                
                <div className="invisible absolute right-0 top-full z-[100] mt-2 w-52 origin-top-right scale-95 opacity-0 transition-all duration-200 group-hover:visible group-hover:scale-100 group-hover:opacity-100">
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl ring-1 ring-slate-900/5">
                    <div className="mb-2 px-3 py-2 border-b border-slate-50 bg-slate-50/30">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Authenticated as</p>
                      <p className="truncate text-xs font-bold text-slate-700 mt-0.5">
                        {user.email}
                      </p>
                    </div>

                    <button
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-bold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                      onClick={refresh}
                      disabled={loading}
                    >
                      <RefreshCcw size={14} className={loading ? "animate-spin" : ""} strokeWidth={2.5} />
                      <div className="flex-1">
                        <p className="leading-tight">Sync Fleet</p>
                        <p className="text-[9px] font-medium text-slate-400">Refresh device metrics</p>
                      </div>
                    </button>

                    <div className="my-1 border-t border-slate-50" />

                    <button
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-bold text-rose-600 transition hover:bg-rose-50"
                      onClick={onLogout}
                    >
                      <LogOut size={14} strokeWidth={2.5} />
                      <div className="flex-1">
                        <p className="leading-tight">Sign Out</p>
                        <p className="text-[9px] font-medium text-rose-400/70">Terminate session</p>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
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
