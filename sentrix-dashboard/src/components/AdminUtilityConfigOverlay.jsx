import { useState, useEffect } from "react";
import {
  Zap,
  Trash2,
  Clock,
  Eraser,
  MessageSquare,
  ChevronDown,
  Settings,
  Loader2,
  CheckCircle2,
  FolderOpen,
} from "lucide-react";
import * as settingsApi from "../services/settingsApi.js";
import { useToast } from "./ToastProvider.jsx";

export function AdminUtilityConfigOverlay({ isOpen, onClose, isNetworkAdmin }) {
  const [enabledIds, setEnabledIds] = useState([]);
  const [maxStagedFileSizeMb, setMaxStagedFileSizeMb] = useState(200);
  const [loading, setLoading] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const { notify } = useToast();

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setTimeout(() => setIsAnimating(true), 10);
      loadConfig();
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => setIsVisible(false), 500);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  async function loadConfig() {
    setLoading(true);
    try {
      const [utilData, stagingData] = await Promise.all([
        settingsApi.getUtilityConfig(),
        settingsApi.getStagingSettings()
      ]);
      setEnabledIds(utilData.enabledIds || []);
      setMaxStagedFileSizeMb(stagingData.maxStagedFileSizeMb || 200);
    } catch (error) {
      notify("Failed to load utility configuration.", "failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(id) {
    if (!isNetworkAdmin) return;

    const nextIds = enabledIds.includes(id)
      ? enabledIds.filter((i) => i !== id)
      : [...enabledIds, id];

    setEnabledIds(nextIds);

    try {
      await settingsApi.updateUtilityConfig(nextIds);
    } catch (error) {
      notify("Failed to update utility configuration.", "failed");
      loadConfig();
    }
  }

  async function handleStagingSizeChange(val) {
    const num = Math.min(Math.max(parseInt(val) || 200, 10), 2000);
    setMaxStagedFileSizeMb(num);
    if (!isNetworkAdmin) return;

    try {
      await settingsApi.updateStagingSettings(num);
      notify("Max staged file size updated.", "success");
    } catch (error) {
      notify("Failed to update max staged file size.", "failed");
    }
  }

  const handleClose = () => {
    setIsAnimating(false);
    setTimeout(onClose, 500);
  };

  if (!isVisible) return null;

  const utilities = [
    {
      id: "network-reset",
      label: "Network Refresh",
      icon: Zap,
      description: "Flush DNS cache and reset IP stack.",
      tone: "blue",
    },
    {
      id: "system-purge",
      label: "System Purge",
      icon: Trash2,
      description: "Clear temporary folders, caches & recycle bin.",
      tone: "rose",
    },
    {
      id: "time-sync",
      label: "Clock Sync",
      icon: Clock,
      description: "Force time synchronization with NTP.",
      tone: "emerald",
    },
    {
      id: "workspace-reset",
      label: "Clear Workspace",
      icon: Eraser,
      description: "Close all user-level applications.",
      tone: "amber",
    },
    {
      id: "broadcast-message",
      label: "Fleet Broadcast",
      icon: MessageSquare,
      description: "Send full-screen notifications.",
      tone: "indigo",
    },
  ];

  const iconColors = {
    blue: "text-blue-500",
    rose: "text-rose-500",
    emerald: "text-emerald-500",
    amber: "text-amber-500",
    indigo: "text-indigo-500",
  };

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col bg-mist/95 backdrop-blur-xl transition-transform duration-500 ease-in-out ${
        isAnimating ? "translate-y-0" : "translate-y-full"
      }`}
    >
      {/* Header */}
      <header className="flex min-h-20 items-center border-b border-line px-6 py-4 sm:px-12 bg-white/50">
        <div className="flex items-center gap-6">
          <button
            onClick={handleClose}
            className="group flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400 transition hover:bg-slate-200 hover:text-ink"
            title="Close Drawer"
          >
            <ChevronDown
              size={20}
              className="transition group-hover:translate-y-0.5"
            />
          </button>

          <div className="min-w-0">
            <h2 className="text-lg font-bold text-ink tracking-tight sm:text-xl">
              Admin Utility & Staging Shortcuts
            </h2>
            <div className="mt-0.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <Zap size={10} className="text-emerald-500" />
              <span>Configure Remote Control Quick Tools & Large File Streaming</span>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto custom-scrollbar p-6 sm:p-12">
        <div className="mx-auto max-w-3xl">
          {loading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-4">
              <Loader2 className="animate-spin text-signal" size={32} />
              <p className="text-sm font-bold uppercase tracking-widest text-slate-400">
                Syncing configuration...
              </p>
            </div>
          ) : (
            <div className="grid gap-8">
              {/* Staging Limit Config Card */}
              <div className="rounded-lg border border-line bg-white p-6 shadow-sm">
                <div className="flex items-start gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-blue-100 bg-blue-50 text-blue-600 shadow-sm">
                    <FolderOpen size={24} />
                  </span>
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-ink tracking-tight">
                      Large File HTTP Staging Limit
                    </h3>
                    <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                      Configure the maximum file size (in MB) allowed for HTTP staged transfers (e.g. massive PPTs and lab video bundles). Files larger than this will be rejected by the server staging endpoint.
                    </p>
                    <div className="mt-4 flex items-center gap-3">
                      <div className="flex items-center gap-2 rounded-lg bg-slate-100 p-1.5 ring-1 ring-slate-200">
                        <input
                          type="number"
                          min="10"
                          max="2000"
                          value={maxStagedFileSizeMb}
                          onChange={(e) => handleStagingSizeChange(e.target.value)}
                          disabled={!isNetworkAdmin}
                          className="w-20 bg-transparent px-2 text-center text-sm font-bold text-ink outline-none disabled:cursor-not-allowed"
                        />
                        <span className="pr-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">MB</span>
                      </div>
                      {!isNetworkAdmin && (
                        <span className="text-xs font-medium text-amber-600">Requires Network Admin role to modify.</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Intro Card */}
              <div className="rounded-lg border border-line bg-white p-6 shadow-sm">
                <h3 className="flex items-center gap-2 text-sm font-bold text-ink uppercase tracking-wider">
                  <Settings size={16} className="text-blue-500" />
                  Dashboard Customization
                </h3>
                <p className="mt-4 text-sm leading-relaxed text-slate-500">
                  Select which maintenance tools appear in the{" "}
                  <strong className="text-ink">Remote Controls</strong> section
                  of the device list. Only checked items will be visible for
                  quick access.
                </p>
              </div>

              {/* Checklist */}
              <div className="grid gap-3">
                {utilities.map((util) => {
                  const isEnabled = enabledIds.includes(util.id);
                  const Icon = util.icon;

                  return (
                    <div
                      key={util.id}
                      onClick={() => handleToggle(util.id)}
                      className={`group flex cursor-pointer items-center justify-between rounded-lg border p-4 transition-all ${
                        isEnabled
                          ? "border-line bg-white shadow-sm hover:border-slate-300"
                          : "border-slate-100 bg-slate-50/50 opacity-60 hover:opacity-100 hover:bg-white hover:border-line"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span
                          className={`grid h-12 w-12 place-items-center rounded-lg border border-slate-100 bg-slate-50 shadow-sm transition-colors ${isEnabled ? iconColors[util.tone] : "text-slate-400"}`}
                        >
                          <Icon size={24} strokeWidth={2} />
                        </span>
                        <div>
                          <h4 className="font-bold text-ink">{util.label}</h4>
                          <p className="text-xs text-slate-400">
                            {util.description}
                          </p>
                        </div>
                      </div>

                      <div
                        className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all ${
                          isEnabled
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        {isEnabled && (
                          <CheckCircle2 size={14} strokeWidth={3} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-line bg-white/50 p-6 sm:px-12">
        <div className="mx-auto flex max-w-3xl items-center justify-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
          <span>Sentrix Utility Relay v1.4</span>
        </div>
      </footer>
    </div>
  );
}
