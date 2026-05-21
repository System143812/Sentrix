import { useEffect, useState } from "react";
import {
  LoaderCircle,
  ShieldCheck,
  Trash2,
  Users,
  Layers,
  Pencil,
  Globe,
  Server,
  Info,
  Shield,
  Lock,
  EyeOff,
  Clock,
  ChevronRight,
  Fingerprint,
} from "lucide-react";
import { Card } from "../components/Card.jsx";
import { FormInput } from "../components/FormInput.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { usePendingAction } from "../hooks/usePendingAction.js";
import * as userApi from "../services/userApi.js";
import * as groupApi from "../services/groupApi.js";

import { ICON_TONES } from "../styles/tones.js";

function SettingsSection({ icon: Icon, title, subtitle, children, tone = "slate" }) {
  return (
    <Card padding="0" className="min-w-0 flex flex-col h-full shadow-sm hover:shadow-md transition-all duration-300 border-none ring-1 ring-slate-200/60 overflow-hidden">
      <div className="p-5 sm:p-6 flex-1 flex flex-col">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">{title}</h3>
            <p className="mt-1 text-sm text-slate-500 leading-relaxed font-medium">
              {subtitle}
            </p>
          </div>
          <div className="group relative shrink-0">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-sm transition-transform hover:scale-110 ${ICON_TONES[tone]}`}>
              <Icon size={20} strokeWidth={2.5} />
            </span>
            <div className="pointer-events-none absolute right-0 top-full mt-2 hidden w-40 rounded-lg bg-slate-900 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-white shadow-xl group-hover:block z-30">
              Module: {title}
              <div className="absolute bottom-full right-4 border-4 border-transparent border-b-slate-900" />
            </div>
          </div>
        </div>
        <div className="flex-1 flex flex-col">{children}</div>
      </div>
    </Card>
  );
}

function ActionButton({ label, icon: Icon, description, onClick, tone = "blue", disabled = false }) {
  const tones = {
    blue: "border-blue-100 bg-white text-blue-700 hover:bg-blue-50/50 hover:border-blue-200",
    slate: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50/50 hover:border-slate-300",
    rose: "border-red-100 bg-white text-red-700 hover:bg-red-50/50 hover:border-red-200",
    emerald: "border-emerald-100 bg-white text-emerald-700 hover:bg-emerald-50/50 hover:border-emerald-200",
  };

  return (
    <div className="group relative">
      <button
        className={`flex w-full items-center justify-between rounded-xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-sm disabled:opacity-50 disabled:translate-y-0 ${tones[tone]}`}
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg shadow-sm border shrink-0 ${ICON_TONES[tone === "emerald" ? "emerald" : tone === "rose" ? "rose" : tone === "blue" ? "blue" : "slate"]}`}>
            <Icon size={18} strokeWidth={2.5} />
          </div>
          <span className="text-sm font-bold tracking-tight">{label}</span>
        </div>
        <ChevronRight size={16} className="opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
      </button>
      <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden w-56 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-center text-[11px] font-medium text-white shadow-xl group-hover:block z-20">
        {description}
        <div className="absolute top-full left-1/2 -ml-1 border-4 border-transparent border-t-slate-900" />
      </div>
    </div>
  );
}

function SystemConfigurationCard({ isNetworkAdmin }) {
  const [mode, setMode] = useState("local");
  const [interval, setInterval] = useState("5s");
  const [loading, setLoading] = useState(false);

  const handleModeChange = (newMode) => {
    setLoading(true);
    setTimeout(() => {
      setMode(newMode);
      setLoading(false);
    }, 1000);
  };

  return (
    <SettingsSection 
      icon={Globe} 
      title="Fleet Configuration" 
      subtitle="Define communication protocols and telemetry refresh rates for the network."
      tone="blue"
    >
      <div className="space-y-6 flex-1 flex flex-col justify-between">
        <div className="space-y-6">
          <div>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Operation Mode</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="group relative">
                <button
                  className={`flex h-20 w-full flex-col items-center justify-center gap-2 rounded-xl border transition-all ${
                    mode === "local"
                      ? "border-teal-500 bg-teal-50 text-teal-700 shadow-sm"
                      : "border-line bg-white text-slate-500 hover:border-teal-200 hover:bg-teal-50/30"
                  } ${!isNetworkAdmin || loading ? "opacity-50 cursor-not-allowed" : ""}`}
                  disabled={!isNetworkAdmin || loading}
                  onClick={() => handleModeChange("local")}
                  type="button"
                >
                  <Server size={20} />
                  <span className="text-xs font-bold uppercase tracking-tight">Local Mode</span>
                </button>
                <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden w-48 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-center text-[11px] font-medium text-white shadow-xl group-hover:block z-20">
                  LAN-only communication (Intranet)
                  <div className="absolute top-full left-1/2 -ml-1 border-4 border-transparent border-t-slate-900" />
                </div>
              </div>

              <div className="group relative">
                <button
                  className={`flex h-20 w-full flex-col items-center justify-center gap-2 rounded-xl border transition-all ${
                    mode === "online"
                      ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                      : "border-line bg-white text-slate-500 hover:border-blue-200 hover:bg-blue-50/30"
                  } ${!isNetworkAdmin || loading ? "opacity-50 cursor-not-allowed" : ""}`}
                  disabled={!isNetworkAdmin || loading}
                  onClick={() => handleModeChange("online")}
                  type="button"
                >
                  <Globe size={20} />
                  <span className="text-xs font-bold uppercase tracking-tight">Online Mode</span>
                </button>
                <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden w-48 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-center text-[11px] font-medium text-white shadow-xl group-hover:block z-20">
                  Cloud gateway for remote management
                  <div className="absolute top-full left-1/2 -ml-1 border-4 border-transparent border-t-slate-900" />
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Metric Update Interval</p>
            <div className="flex flex-wrap gap-2">
              {["1s", "5s", "10s", "30s", "1m"].map((t) => (
                <button
                  key={t}
                  onClick={() => setInterval(t)}
                  className={`px-4 py-2 rounded-lg border text-xs font-bold transition-all ${
                    interval === t 
                      ? "bg-slate-900 border-slate-900 text-white shadow-md shadow-slate-200" 
                      : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                  title={`Set telemetry refresh to ${t}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
          <div className="flex gap-3">
            <Info className="shrink-0 text-blue-500 mt-0.5" size={16} />
            <div className="text-[11px] leading-relaxed text-slate-600 font-semibold italic">
              Changes will broadcast to all active agents immediately.
            </div>
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}

export function SettingsPage({ user, groups = [], onGroupsChanged }) {
  const isNetworkAdmin = user?.role === "network_admin";
  const [admins, setAdmins] = useState([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [message, setMessage] = useState("");
  const { pending: pendingAction, setPending } = usePendingAction();

  useEffect(() => {
    if (isNetworkAdmin) {
      loadAdmins();
    }
  }, [isNetworkAdmin]);

  async function loadAdmins() {
    const users = await userApi.getUsers();
    setAdmins(users || []);
  }

  async function handleCreateAdmin(event) {
    event.preventDefault();
    setMessage("");

    await setPending("create-admin", async () => {
      await userApi.createAdmin(email, password);
      setEmail("");
      setPassword("");
      setMessage("Admin account created.");
      await loadAdmins();
    });
  }

  async function handleDeleteAdmin(id) {
    setMessage("");

    await setPending(`delete-admin-${id}`, async () => {
      await userApi.deleteAdmin(id);
      setMessage("Admin account removed.");
      await loadAdmins();
    });
  }

  async function handleSaveGroup(event) {
    event.preventDefault();
    setMessage("");

    await setPending("save-group", async () => {
      if (editingGroupId) {
        await groupApi.updateGroup(editingGroupId, groupName, groupDescription);
        setMessage("Group renamed.");
      } else {
        await groupApi.createGroup(groupName, groupDescription);
        setMessage("Group created.");
      }

      setEditingGroupId(null);
      setGroupName("");
      setGroupDescription("");
      await onGroupsChanged?.();
    });
  }

  async function handleDeleteGroup(id) {
    setMessage("");

    await setPending(`delete-group-${id}`, async () => {
      await groupApi.deleteGroup(id);
      setMessage("Group deleted. Devices in that group were moved to Unassigned.");
      await onGroupsChanged?.();
    });
  }

  function startEditingGroup(group) {
    setEditingGroupId(group.id);
    setGroupName(group.name);
    setGroupDescription(group.description || "");
  }

  return (
    <div className="space-y-6 flex flex-col min-h-screen">
      <PageHeader
        icon={ShieldCheck}
        title="Settings"
        subtitle="Role-based controls for account access and lab grouping."
        action={
          <span className="inline-flex items-center gap-2 rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-sm font-bold text-teal-700 shadow-sm">
            <ShieldCheck size={16} />
            {isNetworkAdmin ? "Network admin" : "Admin"}
          </span>
        }
      />

      {!isNetworkAdmin ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 text-sm text-amber-900 font-medium backdrop-blur-sm">
          <div className="flex gap-3">
            <Info className="shrink-0 text-amber-500" size={18} />
            <p>This account can monitor devices and assign existing groups, but it cannot manage administrative access.</p>
          </div>
        </div>
      ) : null}

      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800 animate-in fade-in slide-in-from-top-2">
          {message}
        </div>
      ) : null}

      <div className="grid min-w-0 gap-6 lg:grid-cols-12 flex-1">
        <div className="lg:col-span-12 flex flex-col">
          <SystemConfigurationCard isNetworkAdmin={isNetworkAdmin} />
        </div>
        
        <div className="lg:col-span-6 flex flex-col">
          <SettingsSection 
            icon={Users} 
            title="Admin Accounts" 
            subtitle="Grant lab monitoring access to other staff members."
            tone="blue"
          >
            <div className="flex flex-col flex-1">
              {isNetworkAdmin ? (
                <form className="grid gap-3" onSubmit={handleCreateAdmin}>
                  <FormInput
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="admin@email.com"
                    type="email"
                    value={email}
                    required
                  />
                  <FormInput
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Password"
                    type="password"
                    value={password}
                    required
                  />
                  <button
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70 shadow-md shadow-blue-100"
                    disabled={pendingAction === "create-admin"}
                  >
                    {pendingAction === "create-admin" ? (
                      <LoaderCircle className="animate-spin" size={17} />
                    ) : (
                      "Create admin"
                    )}
                  </button>
                </form>
              ) : null}

              <div className="mt-6 space-y-2 flex-1 overflow-auto max-h-[320px] pr-1 custom-scrollbar">
                {admins
                  .filter((admin) => admin.role === "admin")
                  .map((admin) => (
                    <div
                      className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3.5 py-3 transition hover:bg-white hover:border-blue-100 hover:shadow-sm"
                      key={admin.id}
                    >
                      <div className="min-w-0">
                        <p className="break-words text-sm font-bold text-slate-800">{admin.email}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{admin.role}</p>
                      </div>
                      {isNetworkAdmin ? (
                        <button
                          className="grid h-8 w-8 place-items-center rounded-lg border border-red-200 bg-white text-red-600 transition hover:bg-red-50 disabled:cursor-wait disabled:opacity-70 shadow-sm"
                          disabled={pendingAction === `delete-admin-${admin.id}`}
                          onClick={() => handleDeleteAdmin(admin.id)}
                          type="button"
                        >
                          {pendingAction === `delete-admin-${admin.id}` ? (
                            <LoaderCircle className="animate-spin" size={14} />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      ) : null}
                    </div>
                  ))}
                {!admins.some(a => a.role === "admin") && (
                  <p className="py-10 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">No subordinate admins</p>
                )}
              </div>
            </div>
          </SettingsSection>
        </div>

        <div className="lg:col-span-6 flex flex-col">
          <SettingsSection 
            icon={Layers} 
            title="Lab Groups" 
            subtitle="Organize your devices by physical location or department."
            tone="teal"
          >
            <div className="flex flex-col flex-1">
              {isNetworkAdmin ? (
                <form className="grid gap-3" onSubmit={handleSaveGroup}>
                  <FormInput
                    onChange={(event) => setGroupName(event.target.value)}
                    placeholder="Group Name (e.g. Lab A)"
                    value={groupName}
                    required
                  />
                  <FormInput
                    onChange={(event) => setGroupDescription(event.target.value)}
                    placeholder="Short description"
                    value={groupDescription}
                  />
                  <button
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-70 shadow-md shadow-slate-200"
                    disabled={pendingAction === "save-group"}
                  >
                    {pendingAction === "save-group" ? (
                      <LoaderCircle className="animate-spin" size={17} />
                    ) : editingGroupId ? (
                      "Save changes"
                    ) : (
                      "Create group"
                    )}
                  </button>
                </form>
              ) : null}

              <div className="mt-6 space-y-2 flex-1 overflow-auto max-h-[320px] pr-1 custom-scrollbar">
                {groups.map((group) => (
                  <div
                    className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3.5 py-3 transition hover:bg-white hover:border-teal-100 hover:shadow-sm"
                    key={group.id}
                  >
                    <div className="min-w-0">
                      <p className="break-words text-sm font-bold text-slate-800">{group.name}</p>
                      <p className="break-words text-[11px] font-medium text-slate-500 line-clamp-1">
                        {group.description || "No description provided"}
                      </p>
                    </div>
                    {isNetworkAdmin ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-teal-400 hover:text-teal-600 shadow-sm"
                          onClick={() => startEditingGroup(group)}
                          type="button"
                          title="Edit group"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="grid h-8 w-8 place-items-center rounded-lg border border-red-100 bg-white text-red-600 transition hover:bg-red-50 disabled:cursor-wait disabled:opacity-70 shadow-sm"
                          disabled={pendingAction === `delete-group-${group.id}`}
                          onClick={() => handleDeleteGroup(group.id)}
                          type="button"
                          title="Delete group"
                        >
                          {pendingAction === `delete-group-${group.id}` ? (
                            <LoaderCircle className="animate-spin" size={14} />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </SettingsSection>
        </div>
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-3 flex-1">
        <SettingsSection 
          icon={Lock} 
          title="Account Security" 
          subtitle="Manage your authentication methods and session tokens."
          tone="amber"
        >
          <div className="space-y-3 flex-1 flex flex-col justify-end pb-2">
            <ActionButton 
              label="Change Password" 
              icon={Lock} 
              description="Update your dashboard access credentials" 
              onClick={() => {}} 
              tone="amber"
            />
            <ActionButton 
              label="Two-Factor Auth" 
              icon={Fingerprint} 
              description="Add an extra layer of security to your account" 
              onClick={() => {}} 
              tone="slate"
            />
          </div>
        </SettingsSection>

        <SettingsSection 
          icon={Shield} 
          title="Privacy & Data" 
          subtitle="Configure how telemetry data is stored and logged."
          tone="emerald"
        >
          <div className="space-y-3 flex-1 flex flex-col justify-end pb-2">
            <ActionButton 
              label="Privacy Settings" 
              icon={EyeOff} 
              description="Control visibility of sensitive agent information" 
              onClick={() => {}} 
              tone="emerald"
            />
            <ActionButton 
              label="Data Retention" 
              icon={Clock} 
              description="Configure how long analytics are kept in history" 
              onClick={() => {}} 
              tone="slate"
            />
          </div>
        </SettingsSection>

        <SettingsSection 
          icon={ShieldCheck} 
          title="Legal & Access" 
          subtitle="Review terms of service and admin permissions."
          tone="slate"
        >
          <div className="space-y-3 flex-1 flex flex-col justify-end pb-2">
            <ActionButton 
              label="Terms of Service" 
              icon={Info} 
              description="Read the Sentrix platform usage agreement" 
              onClick={() => {}} 
              tone="slate"
            />
            <ActionButton 
              label="System Audit" 
              icon={Layers} 
              description="View logs of all administrative actions performed" 
              onClick={() => {}} 
              tone="slate"
            />
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}
