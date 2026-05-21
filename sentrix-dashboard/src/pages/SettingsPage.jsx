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
    <Card padding="0" className="min-w-0 flex flex-col h-full shadow-sm hover:shadow-md transition-all duration-300 border-slate-200/60 overflow-hidden bg-white">
      <div className="p-6 sm:p-8 flex-1 flex flex-col">
        <div className="mb-8 flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1 font-ui">
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">{title}</h3>
            <p className="mt-1 text-sm text-slate-500 leading-relaxed font-medium">
              {subtitle}
            </p>
          </div>
          <div className="group relative shrink-0">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border shadow-sm transition-transform hover:scale-105 ${ICON_TONES[tone]}`}>
              <Icon size={20} strokeWidth={2} />
            </span>
            <div className="pointer-events-none absolute right-0 top-full mt-2 hidden w-40 rounded-lg bg-slate-900 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-white shadow-xl group-hover:block z-30 font-ui">
              Settings: {title}
              <div className="absolute bottom-full right-4 border-4 border-transparent border-b-slate-900" />
            </div>
          </div>
        </div>
        <div className="flex-1 flex flex-col">{children}</div>
      </div>
    </Card>
  );
}

function ActionButton({ label, icon: Icon, description, onClick, tone = "slate", disabled = false }) {
  return (
    <div className="group relative">
      <button
        className={`btn-minimal w-full justify-between p-4 h-14 active:scale-[0.98] ${disabled ? 'opacity-50 grayscale' : ''}`}
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        <div className="flex items-center gap-4">
          <div className={`p-2 rounded-lg border shadow-sm transition-all group-hover:scale-110 ${ICON_TONES[tone]}`}>
            <Icon size={18} strokeWidth={2.5} />
          </div>
          <span className="text-sm font-bold tracking-tight text-slate-700 font-ui">{label}</span>
        </div>
        <ChevronRight size={16} className="opacity-20 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-slate-400" />
      </button>
      <div className="pointer-events-none absolute bottom-full left-1/2 mb-3 hidden w-60 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2.5 text-center text-[11px] font-medium text-white shadow-2xl group-hover:block z-20 leading-relaxed font-ui">
        {description}
        <div className="absolute top-full left-1/2 -ml-1.5 border-[6px] border-transparent border-t-slate-900" />
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
    }, 800);
  };

  return (
    <SettingsSection 
      icon={Globe} 
      title="System Architecture" 
      subtitle="Operational protocols and global telemetry frequency"
      tone="blue"
    >
      <div className="space-y-8 flex-1 flex flex-col justify-between">
        <div className="space-y-8">
          <div>
            <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 font-ui">Communication Vector</p>
            <div className="grid grid-cols-2 gap-4">
              {[
                { id: "local", label: "Intranet Mode", icon: Server, desc: "Restricted to local facility broadcast" },
                { id: "online", label: "Gateway Mode", icon: Globe, desc: "Authorized remote cloud synchronization" }
              ].map((m) => {
                const active = mode === m.id;
                return (
                  <div className="group relative" key={m.id}>
                    <button
                      className={`flex h-20 w-full flex-col items-center justify-center gap-2 rounded-xl border transition-all ${
                        active
                          ? "bg-slate-900 border-slate-900 text-white shadow-lg shadow-slate-900/20"
                          : "bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                      } ${!isNetworkAdmin || loading ? "opacity-30 cursor-not-allowed" : ""}`}
                      disabled={!isNetworkAdmin || loading}
                      onClick={() => handleModeChange(m.id)}
                      type="button"
                    >
                      <m.icon size={22} strokeWidth={2} className={active ? "text-white" : ""} />
                      <span className={`text-[10px] font-bold uppercase tracking-widest font-ui ${active ? "text-white" : ""}`}>{m.label}</span>
                    </button>
                    <div className="pointer-events-none absolute bottom-full left-1/2 mb-3 hidden w-48 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-white shadow-xl group-hover:block z-20 font-ui">
                      {m.desc}
                      <div className="absolute top-full left-1/2 -ml-1 border-4 border-transparent border-t-slate-900" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 font-ui">Telemetry Sync Interval</p>
            <div className="flex flex-wrap gap-2.5">
              {["1s", "5s", "10s", "30s", "1m"].map((t) => (
                <button
                  key={t}
                  onClick={() => setInterval(t)}
                  className={`px-5 py-2.5 rounded-lg border text-xs font-bold transition-all font-data ${
                    interval === t 
                      ? "bg-slate-900 border-slate-900 text-white shadow-lg shadow-slate-900/10" 
                      : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                  title={`Set to ${t}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/50 p-5 shadow-inner">
          <div className="flex gap-4">
            <div className={`p-1.5 rounded-lg bg-blue-50 border border-blue-100 text-blue-500 shrink-0`}>
                <Info size={14} />
            </div>
            <div className="text-[11px] leading-relaxed text-slate-500 font-bold uppercase tracking-widest italic font-ui">
              Changes will propagate to the active fleet registry immediately.
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
      setMessage("Account Provisioned Successfully");
      await loadAdmins();
    });
  }

  async function handleDeleteAdmin(id) {
    setMessage("");

    await setPending(`delete-admin-${id}`, async () => {
      await userApi.deleteAdmin(id);
      setMessage("Credential Revoked");
      await loadAdmins();
    });
  }

  async function handleSaveGroup(event) {
    event.preventDefault();
    setMessage("");

    await setPending("save-group", async () => {
      if (editingGroupId) {
        await groupApi.updateGroup(editingGroupId, groupName, groupDescription);
        setMessage("Cluster Metadata Updated");
      } else {
        await groupApi.createGroup(groupName, groupDescription);
        setMessage("Cluster Registry Initialized");
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
      setMessage("Cluster Purged from Registry");
      await onGroupsChanged?.();
    });
  }

  function startEditingGroup(group) {
    setEditingGroupId(group.id);
    setGroupName(group.name);
    setGroupDescription(group.description || "");
  }

  return (
    <div className="space-y-6 flex flex-col min-h-screen pb-12 font-data">
      <PageHeader
        icon={ShieldCheck}
        title="Administrative Controls"
        subtitle="Access management and logical terminal grouping protocols."
        backgroundImage="/settings_header.jpg"
        action={
          <span className="badge-minimal px-4 py-2 border-white/10 bg-white/5 text-white backdrop-blur-md shadow-xl shadow-black/10 font-ui">
            <ShieldCheck size={14} className="text-blue-400" />
            System {isNetworkAdmin ? "Root" : "Operator"}
          </span>
        }
      />

      {!isNetworkAdmin ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 shadow-sm backdrop-blur-sm flex items-center gap-4 font-ui">
            <Info className="shrink-0 text-slate-300" size={20} />
            <p>Access Level Restricted: Subordinate accounts are limited to observation and cluster assignment only.</p>
        </div>
      ) : null}

      {message ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-800 shadow-lg animate-in fade-in slide-in-from-top-2 flex items-center gap-3 font-ui">
          <div className="h-1.5 w-1.5 rounded-full bg-slate-900 animate-pulse" />
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
            title="Account Registry" 
            subtitle="Delegate terminal monitoring privileges to verified personnel."
            tone="blue"
          >
            <div className="flex flex-col flex-1 font-ui">
              {isNetworkAdmin ? (
                <form className="grid gap-3" onSubmit={handleCreateAdmin}>
                  <FormInput
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="Operator Email"
                    type="email"
                    value={email}
                    required
                  />
                  <FormInput
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Access Credential"
                    type="password"
                    value={password}
                    required
                  />
                  <button
                    className="btn-minimal-primary h-11 rounded-xl shadow-lg active:scale-[0.97]"
                    disabled={pendingAction === "create-admin"}
                  >
                    {pendingAction === "create-admin" ? (
                      <LoaderCircle className="animate-spin" size={17} />
                    ) : (
                      "Provision Operator"
                    )}
                  </button>
                </form>
              ) : null}

              <div className="mt-8 space-y-3 flex-1 overflow-auto max-h-[400px] pr-1 custom-scrollbar">
                {admins
                  .filter((admin) => admin.role === "admin")
                  .map((admin) => (
                    <div
                      className="flex min-w-0 items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/50 px-5 py-4 transition-all hover:bg-white hover:border-blue-300 hover:shadow-sm"
                      key={admin.id}
                    >
                      <div className="min-w-0 font-ui">
                        <p className="font-bold text-slate-800 tracking-tight truncate">{admin.email}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pt-0.5">{admin.role}</p>
                      </div>
                      {isNetworkAdmin ? (
                        <button
                          className="btn-minimal h-9 w-9 p-0 rounded-lg shadow-sm border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50"
                          disabled={pendingAction === `delete-admin-${admin.id}`}
                          onClick={() => handleDeleteAdmin(admin.id)}
                          type="button"
                          title="Revoke Access"
                        >
                          {pendingAction === `delete-admin-${admin.id}` ? (
                            <LoaderCircle className="animate-spin" size={14} />
                          ) : (
                            <Trash2 size={15} strokeWidth={2} />
                          )}
                        </button>
                      ) : null}
                    </div>
                  ))}
                {!admins.some(a => a.role === "admin") && (
                  <div className="py-20 text-center rounded-xl border border-dashed border-slate-100 bg-slate-50/30 font-ui">
                     <p className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.25em]">No Operators Provisioned</p>
                  </div>
                )}
              </div>
            </div>
          </SettingsSection>
        </div>

        <div className="lg:col-span-6 flex flex-col">
          <SettingsSection 
            icon={Layers} 
            title="Cluster Registry" 
            subtitle="Define logical partitions for terminal deployment and grouping."
            tone="teal"
          >
            <div className="flex flex-col flex-1 font-ui">
              {isNetworkAdmin ? (
                <form className="grid gap-3" onSubmit={handleSaveGroup}>
                  <FormInput
                    onChange={(event) => setGroupName(event.target.value)}
                    placeholder="Cluster Identity"
                    value={groupName}
                    required
                  />
                  <FormInput
                    onChange={(event) => setGroupDescription(event.target.value)}
                    placeholder="Metadata Description"
                    value={groupDescription}
                  />
                  <button
                    className="btn-minimal-primary h-11 rounded-xl shadow-lg active:scale-[0.97]"
                    disabled={pendingAction === "save-group"}
                  >
                    {pendingAction === "save-group" ? (
                      <LoaderCircle className="animate-spin" size={17} />
                    ) : editingGroupId ? (
                      "Apply Changes"
                    ) : (
                      "Initialize Cluster"
                    )}
                  </button>
                </form>
              ) : null}

              <div className="mt-8 space-y-3 flex-1 overflow-auto max-h-[400px] pr-1 custom-scrollbar">
                {groups.map((group) => (
                  <div
                    className="flex min-w-0 items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/50 px-5 py-4 transition-all hover:bg-white hover:border-teal-300 hover:shadow-sm"
                    key={group.id}
                  >
                    <div className="min-w-0 flex-1 font-ui">
                      <p className="font-bold text-slate-800 tracking-tight truncate">{group.name}</p>
                      <p className="text-[11px] font-medium text-slate-400 line-clamp-1 italic pt-0.5">
                        {group.description || "No metadata available"}
                      </p>
                    </div>
                    {isNetworkAdmin ? (
                      <div className="flex items-center gap-2">
                        <button
                          className="btn-minimal h-9 w-9 p-0 rounded-lg shadow-sm"
                          onClick={() => startEditingGroup(group)}
                          type="button"
                          title="Edit Group"
                        >
                          <Pencil size={15} strokeWidth={2} />
                        </button>
                        <button
                          className="btn-minimal h-9 w-9 p-0 rounded-lg shadow-sm border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50"
                          disabled={pendingAction === `delete-group-${group.id}`}
                          onClick={() => handleDeleteGroup(group.id)}
                          type="button"
                          title="Delete Group"
                        >
                          {pendingAction === `delete-group-${group.id}` ? (
                            <LoaderCircle className="animate-spin" size={14} />
                          ) : (
                            <Trash2 size={15} strokeWidth={2} />
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
          title="Terminal Security" 
          subtitle="Encryption protocols and session validation settings."
          tone="amber"
        >
          <div className="space-y-4 flex-1 flex flex-col justify-end font-ui">
            <ActionButton 
              label="Update Credential" 
              icon={Lock} 
              description="Securely reset administrative dashboard access keys" 
              onClick={() => {}} 
              tone="amber"
            />
            <ActionButton 
              label="Active MFA" 
              icon={Fingerprint} 
              description="Deploy multi-factor challenge protocols" 
              onClick={() => {}} 
              tone="blue"
            />
          </div>
        </SettingsSection>

        <SettingsSection 
          icon={Shield} 
          title="Telemetry Privacy" 
          subtitle="Data retention policies and signal masking controls."
          tone="emerald"
        >
          <div className="space-y-4 flex-1 flex flex-col justify-end font-ui">
            <ActionButton 
              label="Privacy Shield" 
              icon={EyeOff} 
              description="Restrict visibility of sensitive kernel-level telemetry" 
              onClick={() => {}} 
              tone="emerald"
            />
            <ActionButton 
              label="History Purge" 
              icon={Clock} 
              description="Configure automated database retention logic" 
              onClick={() => {}} 
              tone="rose"
            />
          </div>
        </SettingsSection>

        <SettingsSection 
          icon={ShieldCheck} 
          title="Protocol & Audit" 
          subtitle="Platform usage terms and transaction logging."
          tone="indigo"
        >
          <div className="space-y-4 flex-1 flex flex-col justify-end font-ui">
            <ActionButton 
              label="ToS Agreement" 
              icon={Info} 
              description="Verify adherence to the platform service contract" 
              onClick={() => {}} 
              tone="indigo"
            />
            <ActionButton 
              label="Cluster Audit" 
              icon={Layers} 
              description="Trace administrative transaction history" 
              onClick={() => {}} 
              tone="teal"
            />
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}
