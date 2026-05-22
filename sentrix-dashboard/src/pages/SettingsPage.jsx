import { useEffect, useState } from "react";
import {
  ChevronRight,
  Clock,
  EyeOff,
  Fingerprint,
  Globe,
  Info,
  Layers,
  LoaderCircle,
  Lock,
  Pencil,
  Server,
  Shield,
  ShieldCheck,
  Trash2,
  Users,
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
    <Card padding="0" className="flex h-full min-w-0 flex-col overflow-hidden border-slate-200/70 bg-white shadow-sm transition hover:shadow-md">
      <div className="flex flex-1 flex-col p-6">
        <div className="mb-6 flex items-start gap-4">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border shadow-sm ${ICON_TONES[tone]}`}>
            <Icon size={20} strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">{title}</h3>
            {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
        </div>
        <div className="flex flex-1 flex-col">{children}</div>
      </div>
    </Card>
  );
}

function ActionButton({ label, icon: Icon, description, tone = "slate" }) {
  return (
    <div className="group relative">
      <button className="btn-minimal h-14 w-full justify-between p-4" type="button">
        <span className="flex items-center gap-3">
          <span className={`rounded-lg border p-2 shadow-sm transition group-hover:scale-105 ${ICON_TONES[tone]}`}>
            <Icon size={18} strokeWidth={2.5} />
          </span>
          <span className="text-sm font-bold text-slate-700">{label}</span>
        </span>
        <ChevronRight size={16} className="text-slate-300 transition group-hover:translate-x-1 group-hover:text-slate-500" />
      </button>
      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-3 hidden w-60 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2.5 text-center text-[11px] font-medium leading-relaxed text-white shadow-2xl group-hover:block">
        {description}
        <div className="absolute left-1/2 top-full -ml-1.5 border-[6px] border-transparent border-t-slate-900" />
      </div>
    </div>
  );
}

function SystemConfigurationCard({ isNetworkAdmin }) {
  const [mode, setMode] = useState("local");
  const [interval, setInterval] = useState("5s");

  return (
    <SettingsSection
      icon={Globe}
      title="System Configuration"
      subtitle="Local dashboard preferences for operation mode and telemetry cadence."
      tone="blue"
    >
      <div className="grid gap-8">
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Operation Mode
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { id: "local", label: "Local", icon: Server },
              { id: "online", label: "Online", icon: Globe },
            ].map((item) => {
              const Icon = item.icon;
              const active = mode === item.id;

              return (
                <button
                  className={`flex h-20 flex-col items-center justify-center gap-2 rounded-xl border text-xs font-bold uppercase tracking-wide transition ${
                    active
                      ? "border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/15"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                  } ${!isNetworkAdmin ? "cursor-not-allowed opacity-50" : ""}`}
                  disabled={!isNetworkAdmin}
                  key={item.id}
                  onClick={() => setMode(item.id)}
                  type="button"
                >
                  <Icon size={22} strokeWidth={2.25} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Telemetry Interval
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {["1s", "5s", "10s", "30s", "1m"].map((value) => (
              <button
                className={`h-11 rounded-lg border px-4 py-2 text-xs font-bold transition ${
                  interval === value
                    ? "border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/10"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
                key={value}
                onClick={() => setInterval(value)}
                type="button"
              >
                {value}
              </button>
            ))}
          </div>
          <div className="mt-4 flex gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-4 text-xs font-medium leading-5 text-slate-500">
            <Info size={16} className="shrink-0 text-blue-500" />
            These controls are local UI preferences until backend configuration endpoints are added.
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
    <div className="space-y-6">
      <PageHeader
        icon={ShieldCheck}
        title="Settings"
        subtitle="Role-based controls for account access and lab grouping."
        backgroundImage="/settings_header.jpg"
        action={
          <span className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm font-bold text-white shadow-xl backdrop-blur">
            <ShieldCheck size={16} />
            {isNetworkAdmin ? "Network admin" : "Admin"}
          </span>
        }
      />

      {!isNetworkAdmin ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          This account can monitor devices and assign existing groups, but it
          cannot create admin accounts or create, rename, or delete groups.
        </div>
      ) : null}

      {message ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
          {message}
        </div>
      ) : null}

      <SystemConfigurationCard isNetworkAdmin={isNetworkAdmin} />

      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <Card padding="5" className="min-w-0 border-slate-200/70 shadow-sm transition hover:shadow-md">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Admin Accounts</h3>
              <p className="mt-1 text-sm text-slate-500">
                Normal admins can monitor labs but cannot manage access.
              </p>
            </div>
            <span className={`grid h-11 w-11 place-items-center rounded-xl border shadow-sm ${ICON_TONES.blue}`}>
              <Users size={20} />
            </span>
          </div>

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
                placeholder="Temporary password"
                type="password"
                value={password}
                required
              />
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-signal px-4 text-sm font-semibold text-white transition hover:bg-signal-dark disabled:cursor-wait disabled:opacity-70"
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

          <div className="mt-5 grid gap-2">
            {admins
              .filter((admin) => admin.role === "admin")
              .map((admin) => (
                <div
                  className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 transition hover:border-blue-200 hover:bg-white"
                  key={admin.id}
                >
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold">{admin.email}</p>
                    <p className="text-xs text-slate-500">{admin.role}</p>
                  </div>
                  {isNetworkAdmin ? (
                    <button
                      className="grid h-9 w-9 place-items-center rounded-lg border border-rose-100 bg-rose-50 text-rose-600 transition hover:bg-rose-100 disabled:cursor-wait disabled:opacity-70"
                      disabled={pendingAction === `delete-admin-${admin.id}`}
                      onClick={() => handleDeleteAdmin(admin.id)}
                      type="button"
                    >
                      {pendingAction === `delete-admin-${admin.id}` ? (
                        <LoaderCircle className="animate-spin" size={15} />
                      ) : (
                        <Trash2 size={15} />
                      )}
                    </button>
                  ) : null}
                </div>
              ))}
          </div>
        </Card>

        <Card padding="5" className="min-w-0 border-slate-200/70 shadow-sm transition hover:shadow-md">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Groups</h3>
              <p className="mt-1 text-sm text-slate-500">
                Use names like CL1, Room303, Lab A, or Faculty Room.
              </p>
            </div>
            <span className={`grid h-11 w-11 place-items-center rounded-xl border shadow-sm ${ICON_TONES.teal}`}>
              <Layers size={20} />
            </span>
          </div>

          {isNetworkAdmin ? (
            <form className="grid gap-3" onSubmit={handleSaveGroup}>
              <FormInput
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="CL1 or Room303"
                value={groupName}
                required
              />
              <FormInput
                onChange={(event) => setGroupDescription(event.target.value)}
                placeholder="Optional description"
                value={groupDescription}
              />
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-70"
                disabled={pendingAction === "save-group"}
              >
                {pendingAction === "save-group" ? (
                  <LoaderCircle className="animate-spin" size={17} />
                ) : editingGroupId ? (
                  "Save group"
                ) : (
                  "Create group"
                )}
              </button>
            </form>
          ) : null}

          <div className="mt-5 grid gap-2">
            {groups.map((group) => (
              <div
                className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 transition hover:border-teal-200 hover:bg-white"
                key={group.id}
              >
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold">{group.name}</p>
                  <p className="break-words text-xs text-slate-500">
                    {group.description || "No description"}
                  </p>
                </div>
                {isNetworkAdmin ? (
                  <div className="flex items-center gap-2">
                    <button
                      className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition hover:border-signal hover:text-signal"
                      onClick={() => startEditingGroup(group)}
                      type="button"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="grid h-9 w-9 place-items-center rounded-lg border border-rose-100 bg-rose-50 text-rose-600 transition hover:bg-rose-100 disabled:cursor-wait disabled:opacity-70"
                      disabled={pendingAction === `delete-group-${group.id}`}
                      onClick={() => handleDeleteGroup(group.id)}
                      type="button"
                    >
                      {pendingAction === `delete-group-${group.id}` ? (
                        <LoaderCircle className="animate-spin" size={15} />
                      ) : (
                        <Trash2 size={15} />
                      )}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-3">
        <SettingsSection
          icon={Lock}
          title="Terminal Security"
          subtitle="Security shortcuts for future account hardening."
          tone="amber"
        >
          <div className="grid gap-3">
            <ActionButton label="Update Credential" icon={Lock} description="Securely reset administrative dashboard access keys." tone="amber" />
            <ActionButton label="Active MFA" icon={Fingerprint} description="Prepare multi-factor authentication controls." tone="blue" />
          </div>
        </SettingsSection>

        <SettingsSection
          icon={Shield}
          title="Telemetry Privacy"
          subtitle="Privacy and retention actions for telemetry data."
          tone="emerald"
        >
          <div className="grid gap-3">
            <ActionButton label="Privacy Shield" icon={EyeOff} description="Restrict visibility of sensitive telemetry surfaces." tone="emerald" />
            <ActionButton label="History Purge" icon={Clock} description="Review automated database retention behavior." tone="rose" />
          </div>
        </SettingsSection>

        <SettingsSection
          icon={ShieldCheck}
          title="Protocol & Audit"
          subtitle="Audit shortcuts for administrative activity."
          tone="indigo"
        >
          <div className="grid gap-3">
            <ActionButton label="ToS Agreement" icon={Info} description="Review platform service agreement status." tone="indigo" />
            <ActionButton label="Cluster Audit" icon={Layers} description="Trace group and device administration history." tone="teal" />
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}
