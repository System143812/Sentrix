import { useState, useEffect } from "react";
import { 
  Zap, 
  Trash2, 
  Clock, 
  Eraser, 
  MessageSquare, 
  ChevronDown,
  Monitor,
  Loader2,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import * as settingsApi from "../services/settingsApi.js";
import { useToast } from "./ToastProvider.jsx";

export function AdminUtilityConfigOverlay({ isOpen, onClose, isNetworkAdmin }) {
  const [enabledIds, setEnabledIds] = useState([]);
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
      const data = await settingsApi.getUtilityConfig();
      setEnabledIds(data.enabledIds || []);
    } catch (error) {
      notify("Failed to load utility configuration.", "failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(id) {
    if (!isNetworkAdmin) return;

    const nextIds = enabledIds.includes(id)
      ? enabledIds.filter(i => i !== id)
      : [...enabledIds, id];

    // Optimistic update
    setEnabledIds(nextIds);

    try {
      await settingsApi.updateUtilityConfig(nextIds);
    } catch (error) {
      notify("Failed to update utility configuration.", "failed");
      // Rollback on failure
      loadConfig();
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
      tone: "blue"
    },
    { 
      id: "system-purge", 
      label: "System Purge", 
      icon: Trash2, 
      description: "Clear temporary folders and caches.",
      tone: "rose"
    },
    { 
      id: "time-sync", 
      label: "Clock Sync", 
      icon: Clock, 
      description: "Force time synchronization with NTP.",
      tone: "emerald"
    },
    { 
      id: "workspace-reset", 
      label: "Clear Workspace", 
      icon: Eraser, 
      description: "Close all user-level applications.",
      tone: "amber"
    },
    { 
      id: "broadcast-message", 
      label: "Fleet Broadcast", 
      icon: MessageSquare, 
      description: "Send full-screen notifications.",
      tone: "indigo"
    }
  ];

  const iconColors = {
    blue: "text-blue-500",
    rose: "text-rose-500",
    emerald: "text-emerald-500",
    amber: "text-amber-500",
    indigo: "text-indigo-500"
  };

  return (
    <div 
      className={`fixed inset-0 z-[9999] flex flex-col bg-mist/95 backdrop-blur-xl transition-transform duration-500 ease-in-out ${
        isAnimating 
          ? "translate-y-0" 
          : "translate-y-full"
      }`}
    >
      {/* Header */}
      <header className="flex min-h-20 items-center border-b border-line px-6 py-4 sm:px-12 bg-white/50">
        <div className="flex items-center gap-6">
          <button 
            onClick={handleClose}
            className="group flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400 transition hover:bg-slate-200 hover:text-ink"
            title="Close Drawer"
          >
            <ChevronDown size={20} className="transition group-hover:translate-y-0.5" />
          </button>
          
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-ink tracking-tight sm:text-xl">Admin Utility Shortcuts</h2>
            <div className="mt-0.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <Zap size={10} className="text-emerald-500" />
              <span>Configure Remote Control Quick Tools</span>
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
              <p className="text-sm font-bold uppercase tracking-widest text-slate-400">Syncing shortcuts...</p>
            </div>
          ) : (
            <div className="grid gap-8">
              {/* Intro Card */}
              <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
                <h3 className="flex items-center gap-2 text-sm font-bold text-ink uppercase tracking-wider">
                  <Monitor size={16} className="text-blue-500" />
                  Dashboard Customization
                </h3>
                <p className="mt-4 text-sm leading-relaxed text-slate-500">
                  Select which maintenance tools appear in the <strong className="text-ink">Remote Controls</strong> section of the device list. Only checked items will be visible for quick access.
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
                      className={`group flex cursor-pointer items-center justify-between rounded-2xl border p-4 transition-all ${
                        isEnabled 
                          ? 'border-line bg-white shadow-sm hover:border-slate-300' 
                          : 'border-slate-100 bg-slate-50/50 opacity-60 hover:opacity-100 hover:bg-white hover:border-line'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span className={`grid h-12 w-12 place-items-center rounded-xl border border-slate-100 bg-slate-50 shadow-sm transition-colors ${isEnabled ? iconColors[util.tone] : 'text-slate-400'}`}>
                          <Icon size={24} strokeWidth={2} />
                        </span>
                        <div>
                          <h4 className="font-bold text-ink">{util.label}</h4>
                          <p className="text-xs text-slate-400">{util.description}</p>
                        </div>
                      </div>

                      <div className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all ${
                        isEnabled 
                          ? 'border-emerald-500 bg-emerald-500 text-white' 
                          : 'border-slate-200 bg-white'
                      }`}>
                        {isEnabled && <CheckCircle2 size={14} strokeWidth={3} />}
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
