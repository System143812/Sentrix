import React, { useEffect, useState, useRef } from "react";
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
import * as settingsApi from "../services/settingsApi.js";

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
  const [telemetryInterval, setTelemetryInterval] = useState(5000);

  useEffect(() => {
    async function initialize() {
      try {
        const [currentUser, telemetry] = await Promise.all([
          authApi.getCurrentUser(),
          settingsApi.getTelemetrySettings().catch(() => ({ intervalMs: 5000 })),
        ]);
        setUser(currentUser);
        setTelemetryInterval(telemetry?.intervalMs || 5000);
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
      setAuthError(error);
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
        <BlurOverlay 
          isOpen={true} 
          className="bg-white"
          containerClassName="w-fit"
        >
          <SentrixLogoLoader label={null} className="text-slate-900" />
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
        telemetryInterval={telemetryInterval}
        onTelemetryIntervalChanged={setTelemetryInterval}
      />
    </ToastProvider>
  );
}

function StatusBadge({ connected }) {
  return (
    <span
      title={connected ? "Connected" : "Offline"}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest shadow-sm transition-all ${
        connected
          ? "border-emerald-100 bg-emerald-50 text-emerald-700"
          : "border-rose-100 bg-rose-50 text-rose-700"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
      {connected ? "Connected" : "Offline"}
    </span>
  );
}

function UserDropdown({ user, dropdownOpen, setDropdownOpen, dropdownRef, loading, refresh, onLogout }) {
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className={`flex h-9 items-center gap-2 rounded-lg border px-3 shadow-sm transition-all active:scale-95 ${
          dropdownOpen
            ? "border-slate-900 bg-slate-50 text-slate-900"
            : "border-slate-200 bg-white text-slate-500 hover:border-slate-900 hover:text-slate-900"
        }`}
      >
        <UserCircle size={18} strokeWidth={2.5} />
        <span className="hidden text-[10px] font-bold uppercase tracking-widest sm:inline">
          {user.role === "network_admin" ? "Network Admin" : "Admin"}
        </span>
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`}
          strokeWidth={2.5}
        />
      </button>

      <div
        className={`absolute right-0 top-full z-[100] mt-2 w-52 origin-top-right transition-all duration-200 ${
          dropdownOpen
            ? "visible scale-100 opacity-100"
            : "invisible scale-95 opacity-0"
        }`}
      >
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white p-2 shadow-sm ring-1 ring-slate-900/5">
          <div className="mb-2 border-b border-slate-50 bg-slate-50/30 px-3 py-2">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
              Authenticated as
            </p>
            <p className="mt-0.5 truncate text-[10px] font-bold text-slate-700">
              {user.email}
            </p>
          </div>

          <button
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[10px] font-bold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            onClick={() => {
              refresh();
              setDropdownOpen(false);
            }}
            disabled={loading}
          >
            <RefreshCcw
              size={14}
              className={loading ? "animate-spin" : ""}
              strokeWidth={2.5}
            />
            <div className="flex-1">
              <p className="leading-tight">Sync Fleet</p>
              <p className="text-[9px] font-medium text-slate-400">
                Refresh device metrics
              </p>
            </div>
          </button>

          <div className="my-1 border-t border-slate-50" />

          <button
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[10px] font-bold text-rose-600 transition hover:bg-rose-50"
            onClick={() => {
              onLogout();
              setDropdownOpen(false);
            }}
          >
            <LogOut size={14} strokeWidth={2.5} />
            <div className="flex-1">
              <p className="leading-tight">Sign Out</p>
              <p className="text-[9px] font-medium text-rose-400/70">
                Terminate session
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

export function DashboardShell({
  user,
  activeTab,
  setActiveTab,
  groups,
  onGroupsChanged,
  onLogout,
  telemetryInterval,
  onTelemetryIntervalChanged,
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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
          {/* Desktop Layout: Single Row */}
          <header className="hidden items-center justify-between gap-6 md:flex">
            {/* Left: Brand */}
            <div className="shrink-0">
              <SentrixLogo size="sm" />
            </div>

            {/* Center: Navigation */}
            <div className="flex flex-1 justify-center">
              <TabNav
                tabs={tabs}
                activeTab={activeTab}
                onSelect={setActiveTab}
              />
            </div>

            {/* Right: Actions */}
            <div className="flex shrink-0 items-center gap-2">
              <StatusBadge connected={connected} />
              <UserDropdown 
                user={user} 
                dropdownOpen={dropdownOpen} 
                setDropdownOpen={setDropdownOpen} 
                dropdownRef={dropdownRef}
                loading={loading}
                refresh={refresh}
                onLogout={onLogout}
              />
            </div>
          </header>

          {/* Mobile Layout: Two Rows */}
          <header className="flex flex-col gap-4 md:hidden">
            <div className="flex items-center justify-between">
              <SentrixLogo size="sm" />
              <div className="flex items-center gap-2">
                <StatusBadge connected={connected} />
                <UserDropdown 
                  user={user} 
                  dropdownOpen={dropdownOpen} 
                  setDropdownOpen={setDropdownOpen} 
                  dropdownRef={dropdownRef}
                  loading={loading}
                  refresh={refresh}
                  onLogout={onLogout}
                />
              </div>
            </div>
            <div className="flex justify-center border-t border-slate-50 pt-2">
              <TabNav
                tabs={tabs}
                activeTab={activeTab}
                onSelect={setActiveTab}
              />
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
            interfaces={discovery.interfaces}
            onScan={discovery.rescan}
            onSetSubnet={discovery.setSubnet}
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
          <AuditPage user={user} />
        ) : (
          <SettingsPage
            user={user}
            groups={groups}
            onGroupsChanged={onGroupsChanged}
            telemetryInterval={telemetryInterval}
            onTelemetryIntervalChanged={onTelemetryIntervalChanged}
          />
        )}

        <footer className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <Activity size={14} />
          Device lifecycle: discover, register, monitor, organize, control.
        </footer>
      </div>
    </main>
  );
}
