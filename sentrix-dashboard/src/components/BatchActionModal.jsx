import { X, Package, ArrowUp, Check, LoaderCircle, ShieldAlert, Monitor } from "lucide-react";
import { useState, useMemo } from "react";
import { BlurOverlay } from "./BlurOverlay.jsx";

export function BatchActionModal({
  mode = "deploy",
  devices = [],
  onClose,
  onConfirm,
  loading = false,
}) {
  const [activeTab, setActiveTab] = useState("available"); // "available" | "active"

  // Filter devices based on mode and tab
  const { availableDevices, activeDevices } = useMemo(() => {
    if (mode === "update") {
      const avail = devices.filter(d => d.agent_status === "running" || d.agent_status === "online");
      const act = devices.filter(d => d.agent_status === "updating" || d.deployment_action === "updating");
      return { availableDevices: avail, activeDevices: act };
    } else {
      const avail = devices.filter(d => {
        if (!d.deploy_eligible || d.gateway) return false;
        const st = (d.agent_status || "no agent").toLowerCase();
        if (st === "running" || st === "online" || st === "deploying" || st === "updating") return false;
        return true;
      });
      const act = devices.filter(d => d.agent_status === "deploying" || d.deployment_action === "deploying");
      return { availableDevices: avail, activeDevices: act };
    }
  }, [devices, mode]);

  const [selectedIps, setSelectedIps] = useState(() => new Set(availableDevices.map(d => d.ip)));

  // Toggle selection for a device IP
  function toggleSelect(ip) {
    const next = new Set(selectedIps);
    if (next.has(ip)) {
      next.delete(ip);
    } else {
      next.add(ip);
    }
    setSelectedIps(next);
  }

  function handleSelectAll() {
    if (selectedIps.size === availableDevices.length) {
      setSelectedIps(new Set());
    } else {
      setSelectedIps(new Set(availableDevices.map(d => d.ip)));
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (selectedIps.size === 0) return;
    const isUpdate = mode === "update";
    // Immediately switch to the "active" tab so the user sees the devices move to Deploying/Updating instantly
    setActiveTab("active");
    onConfirm(Array.from(selectedIps));
  }

  const ModeIcon = mode === "update" ? ArrowUp : Package;
  const modeTitle = mode === "update" ? "Update Sentrix Agents" : "Deploy Sentrix Agents";

  return (
    <BlurOverlay onClose={onClose} containerClassName="w-full max-w-2xl">
      <div className="flex max-h-[85vh] flex-col rounded-lg border border-slate-200 bg-white shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg border border-blue-100 bg-blue-50 text-blue-600 shadow-sm">
              <ModeIcon size={20} strokeWidth={2.5} />
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-900">{modeTitle}</h3>
              <p className="text-xs text-slate-500">
                {mode === "update" ? "Push automated zero-touch updates to online agents" : "Deploy Sentrix agent service to eligible network hosts"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
            type="button"
            aria-label="Close modal"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 bg-slate-50/30 px-6 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab("available")}
            className={`border-b-2 px-4 py-2.5 text-xs font-bold transition-all ${
              activeTab === "available"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {mode === "update" ? "Online Agents" : "Available"} ({availableDevices.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("active")}
            className={`border-b-2 px-4 py-2.5 text-xs font-bold transition-all ${
              activeTab === "active"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {mode === "update" ? "Updating" : "Deploying"} ({activeDevices.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "available" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  Select target hosts for {mode === "update" ? "update" : "deployment"}:
                </span>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-xs font-bold text-blue-600 hover:underline"
                >
                  {selectedIps.size === availableDevices.length ? "Deselect All" : "Select All"}
                </button>
              </div>

              {availableDevices.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                  No {mode === "update" ? "online agents" : "eligible hosts"} found for selection.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                  {availableDevices.map((host) => {
                    const isSelected = selectedIps.has(host.ip);
                    return (
                      <div
                        key={host.ip}
                        onClick={() => toggleSelect(host.ip)}
                        className={`flex cursor-pointer items-center justify-between p-3.5 transition-colors hover:bg-slate-50 ${
                          isSelected ? "bg-blue-50/30" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Custom selection indicator */}
                          <div
                            className={`flex h-5 w-5 items-center justify-center rounded-md border transition-all ${
                              isSelected
                                ? "border-blue-600 bg-blue-600 text-white"
                                : "border-slate-300 bg-white"
                            }`}
                          >
                            {isSelected && <Check size={12} strokeWidth={3} />}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-900">
                              {host.hostname || `Host ${host.ip?.split(".").at(-1)}`}
                            </p>
                            <p className="font-data text-[11px] text-slate-500">
                              IP: {host.ip} &bull; MAC: {host.mac || "Unknown"}
                            </p>
                          </div>
                        </div>
                        <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                          {host.vendor || host.device_type || "PC"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs font-semibold text-slate-500">
                Hosts currently undergoing {mode === "update" ? "update" : "deployment"}:
              </p>
              {activeDevices.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                  No devices currently in progress.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                  {activeDevices.map((host) => (
                    <div key={host.ip} className="flex items-center justify-between p-3.5">
                      <div>
                        <p className="text-xs font-bold text-slate-900">
                          {host.hostname || `Host ${host.ip?.split(".").at(-1)}`}
                        </p>
                        <p className="font-data text-[11px] text-slate-500">{host.ip}</p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-blue-700">
                        <LoaderCircle className="animate-spin" size={12} />
                        {mode === "update" ? "Updating..." : "Deploying..."}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-6 py-4">
          <span className="text-xs font-medium text-slate-500">
            {selectedIps.size} of {availableDevices.length} selected
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              disabled={loading}
            >
              Cancel
            </button>
            {activeTab === "available" && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || selectedIps.size === 0}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <LoaderCircle className="animate-spin" size={14} />
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>{mode === "update" ? `Start Update (${selectedIps.size})` : `Start Deploy (${selectedIps.size})`}</span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </BlurOverlay>
  );
}
