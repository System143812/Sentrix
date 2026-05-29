import { useState, useEffect, useRef } from "react";
import { 
  X, 
  Clock, 
  Shield, 
  Trash2, 
  Database, 
  CheckCircle2, 
  AlertCircle, 
  ChevronLeft,
  ChevronDown,
  Calendar,
  Activity,
  Monitor,
  Zap,
  Loader2,
  RefreshCw
} from "lucide-react";
import * as settingsApi from "../services/settingsApi.js";
import { useToast } from "./ToastProvider.jsx";
import { BlurOverlay } from "./BlurOverlay.jsx";

function ConfirmActionDialog({ isOpen, onClose, onConfirm, title, description, icon: Icon, tone = "rose", loading = false }) {
  if (!isOpen) return null;

  const tones = {
    rose: "bg-rose-50 text-rose-600 border-rose-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100"
  };

  const buttonTones = {
    rose: "bg-rose-600 hover:bg-rose-700 shadow-rose-200",
    emerald: "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200",
    amber: "bg-amber-600 hover:bg-amber-700 shadow-amber-200"
  };

  return (
    <BlurOverlay onClose={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-line bg-white shadow-2xl">
        <div className="p-8 text-center">
          <div className={`mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl border ${tones[tone]}`}>
            <Icon size={32} />
          </div>
          <h3 className="text-xl font-bold text-ink">{title}</h3>
          <p className="mt-4 text-sm leading-relaxed text-slate-500">{description}</p>
        </div>
        
        <div className="flex border-t border-line bg-slate-50/50 p-4">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-xl px-4 py-3 text-sm font-bold text-slate-400 transition hover:text-slate-600 disabled:opacity-50"
          >
            Cancel
          </button>
          <div className="w-px bg-line mx-2" />
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-[1.5] flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-50 ${buttonTones[tone]}`}
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={16} />
                Processing...
              </>
            ) : (
              "Confirm Action"
            )}
          </button>
        </div>
      </div>
    </BlurOverlay>
  );
}

export function StorageLifecycleOverlay({ isOpen, onClose, isNetworkAdmin }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [nextRunSecs, setNextRunSecs] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  
  // Confirmation state
  const [confirmConfig, setConfirmConfig] = useState({
    isOpen: false,
    title: "",
    description: "",
    icon: Zap,
    tone: "rose",
    onConfirm: () => {}
  });

  const { notify } = useToast();
  const timerRef = useRef(null);

  // Handle entry and exit animations
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      // Small delay to ensure the component is mounted before starting the slide-up
      const timer = setTimeout(() => setIsAnimating(true), 10);
      loadSettings();
      return () => clearTimeout(timer);
    } else {
      setIsAnimating(false);
      // Wait for the slide-down animation to finish (500ms) before hiding
      const timer = setTimeout(() => setIsVisible(false), 500);
      return () => {
        clearTimeout(timer);
        clearInterval(timerRef.current);
      };
    }
  }, [isOpen]);

  async function loadSettings() {
    setLoading(true);
    try {
      const data = await settingsApi.getPruningSettings();
      setSettings(data);
      
      // Calculate countdown
      const intervalMs = data.intervalMinutes * 60 * 1000;
      const lastRun = data.updatedAt || Date.now();
      const nextRun = lastRun + intervalMs;
      const diff = Math.max(0, Math.floor((nextRun - Date.now()) / 1000));
      setNextRunSecs(diff);
      
      startCountdown(diff);
    } catch (error) {
      notify("Failed to load retention settings.", "failed");
    } finally {
      setLoading(false);
    }
  }

  function startCountdown(initial) {
    if (timerRef.current) clearInterval(timerRef.current);
    let current = initial;
    timerRef.current = setInterval(() => {
      current--;
      if (current <= 0) {
        current = (settings?.intervalMinutes || 5) * 60;
      }
      setNextRunSecs(current);
    }, 1000);
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  async function handleToggleCategory(category) {
    if (!isNetworkAdmin) return;
    const nextSettings = {
      ...settings,
      retentionDays: {
        ...settings.retentionDays,
        [category]: settings.retentionDays[category] > 0 ? 0 : 7 // Toggle between disabled and default
      }
    };
    updateSettings(nextSettings);
  }

  async function handleRetentionChange(category, days) {
    if (!isNetworkAdmin) return;
    const nextSettings = {
      ...settings,
      retentionDays: {
        ...settings.retentionDays,
        [category]: Math.max(0, parseInt(days) || 0)
      }
    };
    updateSettings(nextSettings);
  }

  async function updateSettings(next) {
    setSettings(next);
    try {
      await settingsApi.updatePruningSettings(next);
    } catch (error) {
      notify("Failed to update settings.", "failed");
    }
  }

  const triggerManualSweep = async () => {
    setActionLoading(true);
    try {
      const result = await settingsApi.triggerPruning();
      notify(`Cleanup complete. Removed ${result.deletedCount} rows.`, "success");
      loadSettings();
      setConfirmConfig(prev => ({ ...prev, isOpen: false }));
    } catch (error) {
      notify("Cleanup failed: " + error.message, "failed");
    } finally {
      setActionLoading(false);
    }
  };

  const triggerWipeTelemetry = async () => {
    setActionLoading(true);
    try {
      const originalTelemetry = settings.retentionDays.telemetry;
      const tempSettings = {
        ...settings,
        retentionDays: { ...settings.retentionDays, telemetry: 1 }
      };
      await settingsApi.updatePruningSettings(tempSettings);
      const result = await settingsApi.triggerPruning();
      await settingsApi.updatePruningSettings({
        ...settings,
        retentionDays: { ...settings.retentionDays, telemetry: originalTelemetry }
      });
      notify(`Telemetry wiped. Removed ${result.deletedCount} records.`, "success");
      loadSettings();
      setConfirmConfig(prev => ({ ...prev, isOpen: false }));
    } catch (error) {
      notify("Wipe failed: " + error.message, "failed");
    } finally {
      setActionLoading(false);
    }
  };

  function handleManualTrigger() {
    if (!isNetworkAdmin) return;
    setConfirmConfig({
      isOpen: true,
      title: "Trigger Manual Sweep?",
      description: "This will immediately scan the database and remove all records older than your configured retention periods. This action cannot be reversed.",
      icon: Zap,
      tone: "emerald",
      onConfirm: triggerManualSweep
    });
  }

  function handleWipeTelemetry() {
    if (!isNetworkAdmin) return;
    setConfirmConfig({
      isOpen: true,
      title: "Wipe Session History?",
      description: "EXTREME CAUTION: This will immediately purge all telemetry (processes, connections, DNS logs) older than 24 hours regardless of your current policy.",
      icon: Trash2,
      tone: "rose",
      onConfirm: triggerWipeTelemetry
    });
  }

  if (!isVisible) return null;

  const handleClose = () => {
    setIsAnimating(false);
    setTimeout(onClose, 500);
  };

  const categories = [
    { 
      id: "telemetry", 
      label: "Telemetry Stream", 
      icon: Activity, 
      description: "Network connections, DNS logs, and process lists.",
      tone: "blue"
    },
    { 
      id: "metrics", 
      label: "Performance Metrics", 
      icon: Zap, 
      description: "Historical CPU, RAM, and Disk usage snapshots.",
      tone: "amber"
    },
    { 
      id: "hardware", 
      label: "Stale Hardware", 
      icon: Monitor, 
      description: "Old disk, adapter, and display snapshots for offline devices.",
      tone: "teal"
    },
    { 
      id: "audit", 
      label: "Audit Logs", 
      icon: Shield, 
      description: "Secure record of admin actions and system changes.",
      tone: "slate"
    }
  ];

  const iconColors = {
    blue: "text-blue-500",
    amber: "text-amber-500",
    teal: "text-teal-500",
    slate: "text-slate-500"
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
            <h2 className="text-lg font-bold text-ink tracking-tight sm:text-xl">Data Pruning & Retention</h2>
            <div className="mt-0.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <Database size={10} className="shrink-0" />
              <span>Database Lifecycle & History Management</span>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto custom-scrollbar p-6 sm:p-12">
        <div className="mx-auto max-w-4xl">
          {loading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-4">
              <Loader2 className="animate-spin text-signal" size={32} />
              <p className="text-sm font-bold uppercase tracking-widest text-slate-400">Syncing retention policy...</p>
            </div>
          ) : (
            <div className="grid gap-12">
              {/* Status Bar / Countdown */}
              <div className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 sm:p-6 shadow-sm">
                <div className="flex items-center gap-4">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-600 shadow-sm">
                    <Clock size={20} />
                  </span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600/60">System Schedule</p>
                    <h4 className="text-sm font-bold text-emerald-900">Next Automated Sweep</h4>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600/60">Time Remaining</p>
                  <p className="text-xl font-bold text-emerald-600 font-data tabular-nums">{formatTime(nextRunSecs)}</p>
                </div>
              </div>

              {/* Intro Info */}
              <section className="grid gap-6 sm:grid-cols-2">
                <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-ink uppercase tracking-wider">
                    <CheckCircle2 size={16} className="text-emerald-500" />
                    How pruning works
                  </h3>
                  <p className="mt-4 text-sm leading-relaxed text-slate-500">
                    Sentrix automatically scans and removes data points older than your specified retention period. This prevents the database from ballooning in size and ensures that real-time queries remain fast and responsive.
                  </p>
                </div>
                <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-ink uppercase tracking-wider">
                    <AlertCircle size={16} className="text-amber-500" />
                    Destructive Action
                  </h3>
                  <p className="mt-4 text-sm leading-relaxed text-slate-500">
                    Setting a retention period to <strong className="text-ink">0 days</strong> will disable automated pruning for that category. Once data is pruned, it cannot be recovered. Security audit logs should ideally be kept for at least 90 days.
                  </p>
                </div>
              </section>

              {/* Checklist */}
              <section>
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-ink tracking-tight">Retention Policy</h3>
                  {!isNetworkAdmin && (
                    <span className="rounded-full bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-600 border border-amber-500/20">
                      Read Only
                    </span>
                  )}
                </div>
                <div className="grid gap-4">
                  {categories.map((cat) => {
                    const days = settings?.retentionDays?.[cat.id] || 0;
                    const enabled = days > 0;
                    const CatIcon = cat.icon;

                    return (
                      <div 
                        key={cat.id}
                        className={`group relative flex flex-col gap-6 rounded-2xl border p-6 transition-all sm:flex-row sm:items-center ${
                          enabled 
                            ? 'border-line bg-white shadow-sm hover:border-slate-300' 
                            : 'border-slate-100 bg-slate-50/50 opacity-60 hover:opacity-80'
                        }`}
                      >
                        <div className="flex flex-1 items-start gap-4">
                          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-slate-100 bg-slate-50 shadow-sm transition-colors ${enabled ? iconColors[cat.tone] : 'text-slate-400'}`}>
                            <CatIcon size={24} strokeWidth={2} />
                          </span>
                          <div className="min-w-0">
                            <h4 className="font-bold text-ink">{cat.label}</h4>
                            <p className="mt-1 text-xs text-slate-500 leading-relaxed">{cat.description}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2 rounded-xl bg-slate-100 p-1.5 ring-1 ring-slate-200">
                            <input 
                              type="number"
                              min="0"
                              max="365"
                              value={days}
                              onChange={(e) => handleRetentionChange(cat.id, e.target.value)}
                              disabled={!isNetworkAdmin}
                              className="w-16 bg-transparent px-2 text-center text-sm font-bold text-ink outline-none disabled:cursor-not-allowed"
                            />
                            <span className="pr-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Days</span>
                          </div>
                          
                          <button
                            onClick={() => handleToggleCategory(cat.id)}
                            disabled={!isNetworkAdmin}
                            className={`flex h-10 w-24 items-center justify-center rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${
                              enabled 
                                ? 'border-emerald-500/20 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white' 
                                : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-100 hover:text-ink'
                            } disabled:cursor-not-allowed disabled:opacity-50`}
                          >
                            {enabled ? 'Active' : 'Disabled'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Quick Actions */}
              <section className="rounded-3xl border border-line bg-slate-50/50 p-8 shadow-inner">
                <div className="mb-8">
                  <h3 className="text-lg font-bold text-ink tracking-tight">System Vacuum</h3>
                  <p className="mt-2 text-sm text-slate-500">Immediate database cleanup actions. Use these to free up space or clear sensitive history instantly.</p>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <button
                    onClick={handleManualTrigger}
                    disabled={!isNetworkAdmin || actionLoading}
                    className="group relative flex h-24 items-center justify-between rounded-2xl border border-line bg-white p-6 shadow-sm transition-all hover:shadow-md active:scale-[0.98] disabled:cursor-wait disabled:opacity-50"
                  >
                    <div className="text-left">
                      <p className="font-bold text-ink tracking-tight">Trigger Full Sweep</p>
                      <p className="mt-1 text-[11px] font-medium text-slate-400">Run pruning on all active targets now.</p>
                    </div>
                    <span className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                      {actionLoading ? <RefreshCw size={24} className="animate-spin" /> : <Zap size={24} />}
                    </span>
                  </button>

                  <button
                    onClick={handleWipeTelemetry}
                    disabled={!isNetworkAdmin || actionLoading}
                    className="group relative flex h-24 items-center justify-between rounded-2xl border border-rose-100 bg-rose-50/30 p-6 shadow-sm transition-all hover:shadow-md hover:bg-rose-50 active:scale-[0.98] disabled:cursor-wait disabled:opacity-50"
                  >
                    <div className="text-left">
                      <p className="font-bold text-rose-600 tracking-tight">Wipe Session History</p>
                      <p className="mt-1 text-[11px] font-medium text-rose-400">Clear all telemetry older than 24h.</p>
                    </div>
                    <span className="grid h-12 w-12 place-items-center rounded-xl bg-rose-100 text-rose-600 ring-1 ring-rose-200 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                      <Trash2 size={24} />
                    </span>
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-line bg-white/50 p-6 sm:px-12">
        <div className="mx-auto flex max-w-4xl items-center justify-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
          <span>Sentrix Core Pruner v2.0</span>
        </div>
      </footer>

      {/* Custom Confirmation Dialog */}
      <ConfirmActionDialog 
        {...confirmConfig}
        loading={actionLoading}
        onClose={() => !actionLoading && setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
