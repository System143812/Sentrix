import { X, ShieldAlert, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { FormInput } from "./FormInput.jsx";
import { BlurOverlay } from "./BlurOverlay.jsx";

export function DeployDialog({ ip, mode = "deploy", onCancel, onConfirm, loading, error }) {
  const [username, setUsername] = useState("Administrator");
  const [password, setPassword] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    onConfirm({ username, password });
  }

  return (
    <BlurOverlay onClose={onCancel}>
      <div className="w-full rounded-lg border border-line bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-50 text-slate-900">
              <ShieldAlert size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold">
                {mode === "activate" ? "Activate Agent" : mode === "update" ? "Update Agent" : "Remote Setup"}
              </h3>
              <p className="text-sm text-slate-500">Target IP: {ip}</p>
            </div>
          </div>
          <button
            className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-ink"
            onClick={onCancel}
            disabled={loading}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <p className="text-sm text-slate-600">
            Enter administrative credentials for the target PC. This allows Sentrix to{" "}
            {mode === "activate"
              ? "start the existing agent task or reinstall the agent if it is missing."
              : mode === "update"
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
                  <span>{mode === "activate" ? "Activating..." : mode === "update" ? "Updating..." : "Setting up..."}</span>
                </>
              ) : (
                mode === "activate" ? "Start Activation" : mode === "update" ? "Start Update" : "Start Setup"
              )}
            </button>
          </div>
        </form>
      </div>
    </BlurOverlay>
  );
}
