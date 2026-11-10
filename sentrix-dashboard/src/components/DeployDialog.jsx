import { X, ShieldAlert, LoaderCircle, Monitor, Users, Globe2 } from "lucide-react";
import { useState } from "react";
import { FormInput } from "./FormInput.jsx";
import { BlurOverlay } from "./BlurOverlay.jsx";

export function DeployDialog({ ip, mode = "deploy", devices = [], onCancel, onConfirm, loading, error }) {
  const [username, setUsername] = useState("Administrator");
  const [password, setPassword] = useState("");
  const [target, setTarget] = useState("single");

  const eligibleHosts = devices.filter(d => d.deploy_eligible);
  const updateHosts = devices.filter(d => d.agent_status === "running" || d.deployment_action === "update");
  const targetCount = target === "single" ? 1 : mode === "update" ? updateHosts.length : eligibleHosts.length;

  const targets = [
    { id: "single", label: "This Device", icon: Monitor, description: ip },
    { id: "all", label: mode === "update" ? "All Online Agents" : "All Eligible Hosts", icon: Globe2, description: mode === "update" ? `Update ${updateHosts.length} online agents` : `Deploy to ${eligibleHosts.length} eligible hosts` },
  ];

  function handleSubmit(event) {
    event.preventDefault();
    onConfirm({ username, password, target });
  }

  return (
    <BlurOverlay onClose={onCancel}>
      <div className="w-full max-h-[90vh] flex flex-col rounded-lg border border-line bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 p-5 border-b border-slate-50 bg-slate-50/30">
          <span className="grid h-11 w-11 place-items-center rounded-lg border border-blue-100 bg-blue-50 text-blue-600 shadow-sm">
            <ShieldAlert size={22} strokeWidth={2.5} />
          </span>
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              {mode === "update" ? "Update Agent" : "Remote Setup"}
            </h3>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Target IP: {ip}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Targeting Scope</p>
          <div className="grid gap-2 mb-6">
            {targets.map((t) => {
              const TargetIcon = t.icon;
              const active = target === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTarget(t.id)}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-all ${
                    active
                    ? 'border-blue-600 bg-white shadow-sm ring-4 ring-blue-50'
                    : 'border-slate-100 bg-slate-50/30 text-slate-600 hover:border-slate-300 hover:bg-white'
                  }`}
                  type="button"
                >
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-colors ${active ? 'border-blue-100 bg-blue-50 text-blue-600' : 'border-slate-200 bg-white text-slate-400'}`}>
                    <TargetIcon size={16} strokeWidth={2.5} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold leading-tight text-slate-900">{t.label}</p>
                    <p className="truncate text-[10px] font-medium text-slate-500 mt-0.5">{t.description}</p>
                  </div>
                  <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 ${active ? 'border-blue-600 bg-blue-600' : 'border-slate-200 bg-white'}`}>
                    {active && <div className="h-1 w-1 rounded-full bg-white" />}
                  </div>
                </button>
              );
            })}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-slate-600">
              Enter administrative credentials for {target === "all" ? `all ${targetCount} target PCs` : "the target PC"}. This allows Sentrix to{" "}
              {mode === "update"
                ? "replace the current agent with the latest build and restart it."
                : "set up the agent as a SYSTEM service."}
            </p>

            <div className="rounded-md bg-blue-50/50 p-3 text-xs leading-relaxed text-blue-800 ring-1 ring-blue-100">
              <strong>Automated setup:</strong> For lab devices, use the built-in{" "}
              <code>Administrator</code> account. Ensure you have run{" "}
              <code>scripts/Sentrix-PC-Provisioner.ps1</code> on your master image first.
            </div>

            {error ? (
              <div className="rounded-md bg-red-50 p-3 text-xs font-semibold text-red-700 ring-1 ring-red-200">
                {error}
              </div>
            ) : null}

            <FormInput
              label="Admin Username"
              placeholder="Administrator"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={loading}
              required
            />
            <p className="text-[10px] text-slate-400 -mt-2">
              Use DOMAIN\User for domain-joined machines.
            </p>

            <FormInput
              label="Password"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={loading}
              required
            />

            <div className="mt-8 flex justify-end gap-2">
              <button
                className="h-11 rounded-md border border-line bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                onClick={onCancel}
                disabled={loading}
                type="button"
              >
                Cancel
              </button>
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-400"
                type="submit"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <LoaderCircle className="animate-spin" size={16} />
                    <span>{mode === "update" ? "Updating..." : "Setting up..."}</span>
                  </>
                ) : (
                  mode === "update" ? `Start Update (${targetCount})` : `Start Setup (${targetCount})`
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </BlurOverlay>
  );
}
