import { useEffect, useState } from "react";
import { LoaderCircle, ShieldCheck, Trash2, Users, Layers, Pencil } from "lucide-react";
import { Card } from "../components/Card.jsx";
import { FormInput } from "../components/FormInput.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { usePendingAction } from "../hooks/usePendingAction.js";
import * as userApi from "../services/userApi.js";
import * as groupApi from "../services/groupApi.js";

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
        action={
          <span className="inline-flex items-center gap-2 rounded-md border border-teal-100 bg-teal-50 px-3 py-2 text-sm font-semibold text-ocean">
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

      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <Card padding="5" className="min-w-0">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Admin Accounts</h3>
              <p className="mt-1 text-sm text-slate-500">
                Normal admins can monitor labs but cannot manage access.
              </p>
            </div>
            <Users className="text-slate-400" size={20} />
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
                  className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-line px-3 py-2"
                  key={admin.id}
                >
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold">{admin.email}</p>
                    <p className="text-xs text-slate-500">{admin.role}</p>
                  </div>
                  {isNetworkAdmin ? (
                    <button
                      className="grid h-9 w-9 place-items-center rounded-md border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100 disabled:cursor-wait disabled:opacity-70"
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

        <Card padding="5" className="min-w-0">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Groups</h3>
              <p className="mt-1 text-sm text-slate-500">
                Use names like CL1, Room303, Lab A, or Faculty Room.
              </p>
            </div>
            <Layers className="text-slate-400" size={20} />
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
                className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-line px-3 py-2"
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
                      className="rounded-md border border-line bg-white p-2 text-slate-600 transition hover:border-signal hover:text-signal"
                      onClick={() => startEditingGroup(group)}
                      type="button"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="grid h-9 w-9 place-items-center rounded-md border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100 disabled:cursor-wait disabled:opacity-70"
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
    </div>
  );
}
