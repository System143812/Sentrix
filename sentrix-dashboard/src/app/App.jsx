import { useEffect, useState } from "react";
import { Activity, LogOut, RefreshCcw, UserCircle, Wifi, WifiOff } from "lucide-react";
import { TabNav } from "../components/TabNav.jsx";
import { SentrixLogo } from "../components/SentrixLogo.jsx";
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

const tabs = ["home", "network", "devices", "analytics", "settings"];

function getTabLabel(tab) {
  switch (tab) {
    case "home":
      return "Home";
    case "network":
      return "Network";
    case "devices":
      return "Devices";
    case "analytics":
      return "Analytics";
    case "settings":
      return "Settings";
    default:
      return tab;
  }
}

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
        try {
          await authApi.logout();
        } catch {
          // The API may be offline while the dashboard dev server is running.
        }
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
          <div className="rounded-3xl border border-line bg-white p-8 text-center shadow-xl">
            <p className="text-lg font-semibold">Checking login status...</p>
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
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
              <SentrixLogo />
              <TabNav
                tabs={tabs.map(getTabLabel)}
                activeTab={getTabLabel(activeTab)}
                onSelect={(label) =>
                  setActiveTab(
                    tabs[tabs.findIndex((tab) => getTabLabel(tab) === label)],
                  )
                }
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
              className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink shadow-sm transition hover:border-signal hover:text-signal"
              onClick={refresh}
              type="button"
            >
              <RefreshCcw size={16} />
              Refresh
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
        <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-ocean">Computer Lab Monitoring</p>
          <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-normal">
                Device lifecycle management for school labs
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Signed in as {user.email}. Monitor, discover, organize, and
                prepare agent deployment from one console.
              </p>
            </div>
          </div>
        </section>

        {activeTab === "home" ? (
          <HomePage
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
          <AnalyticsPage />
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
