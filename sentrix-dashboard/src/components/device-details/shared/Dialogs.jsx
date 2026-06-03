import {
  X,
  MessageSquare,
  Monitor,
  Users,
  Globe2,
  CircleStop,
  ShieldAlert,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useState } from "react";
import { BlurOverlay } from "../../BlurOverlay.jsx";

export function ConfirmDialog({ device, onCancel, onConfirm }) {
  if (!device) return null;

  return (
    <BlurOverlay onClose={onCancel}>
      <div className="w-full rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-900">Archive device?</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              This removes {device.hostname} from the registered device list.
              The device can appear again when its agent reconnects.
            </p>
          </div>
          <button
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
            onClick={onCancel}
            type="button"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button
            className="h-11 rounded-lg border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-11 rounded-lg bg-slate-900 px-6 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition hover:bg-slate-800 active:scale-[0.98]"
            onClick={onConfirm}
            type="button"
          >
            Archive Device
          </button>
        </div>
      </div>
    </BlurOverlay>
  );
}

export function BroadcastDialog({ onCancel, onSend, device, allDevices = [] }) {
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState("single");

  const groupDevices = allDevices.filter(d => d.group === device.group && d.status === "online");
  const onlineDevices = allDevices.filter(d => d.status === "online");

  const targetCount = target === "single" ? 1 : target === "group" ? groupDevices.length : onlineDevices.length;

  const targets = [
    { id: "single", label: "This Device", icon: Monitor, description: device.hostname },
    { id: "group", label: "Same Group", icon: Users, description: `${device.group || 'Unassigned'} (${groupDevices.length} online)` },
    { id: "all", label: "All Online", icon: Globe2, description: `Broadcast to ${onlineDevices.length} devices` },
  ];

  return (
    <BlurOverlay onClose={onCancel}>
      <div className="w-full max-h-[90vh] flex flex-col rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 p-5 border-b border-slate-50 bg-slate-50/30">
          <span className="grid h-11 w-11 place-items-center rounded-lg border border-blue-100 bg-blue-50 text-blue-600 shadow-sm">
            <MessageSquare size={22} strokeWidth={2.5} />
          </span>
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">Broadcast Message</h3>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">System Notification</p>
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

          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Message Text</p>
          <textarea
            autoFocus
            className="w-full h-28 rounded-lg border border-slate-200 bg-slate-50/50 p-4 text-sm font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100/50 transition-all resize-none"
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Lab will close in 5 minutes. Please save your work."
            value={message}
          />
        </div>

        <div className="flex justify-end gap-2 p-4 bg-slate-50/30 border-t border-slate-50">
          <button 
            className="h-11 rounded-lg border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]" 
            onClick={onCancel} 
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-11 rounded-lg bg-blue-600 px-6 text-sm font-semibold text-white shadow-lg shadow-blue-900/10 transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
            disabled={!message.trim()}
            onClick={() => onSend(message, target)}
            type="button"
          >
            Send to {targetCount} {targetCount === 1 ? 'PC' : 'PCs'}
          </button>
        </div>
      </div>
    </BlurOverlay>
  );
}

export function ActionConfirmDialog({ action, onCancel, onConfirm, device, allDevices = [] }) {
  const [target, setTarget] = useState("single");
  if (!action) return null;
  const Icon = action.icon;

  const isDangerous = ["shutdown", "restart", "system-purge", "workspace-reset"].includes(action.id);

  const groupDevices = allDevices.filter(d => d.group === device.group && d.status === "online");
  const onlineDevices = allDevices.filter(d => d.status === "online");

  const targetCount = target === "single" ? 1 : target === "group" ? groupDevices.length : onlineDevices.length;

  const targets = [
    { id: "single", label: "This Device", icon: Monitor, description: device.hostname },
    { id: "group", label: "Same Group", icon: Users, description: `${device.group || 'Unassigned'} (${groupDevices.length} online)` },
    { id: "all", label: "All Online", icon: Globe2, description: `Broadcast to ${onlineDevices.length} devices` },
  ];

  return (
    <BlurOverlay onClose={onCancel}>
      <div className="w-full max-h-[90vh] flex flex-col rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 p-5 border-b border-slate-50 bg-slate-50/30">
          <span className={`grid h-11 w-11 place-items-center rounded-lg border shadow-sm ${isDangerous ? 'border-rose-100 bg-rose-50 text-rose-600' : 'border-blue-100 bg-blue-50 text-blue-600'}`}>
            <Icon size={22} strokeWidth={2.5} />
          </span>
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">{action.label}</h3>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Remote Command</p>
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

          <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-100">
            <p className="text-xs font-medium text-slate-600 leading-relaxed">
              Confirming will <strong>{action.label.toLowerCase()}</strong> {targetCount > 1 ? `${targetCount} devices` : "this device"}. 
              <span className="block mt-1 text-slate-400 font-normal text-[10px]">{action.description}</span>
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 bg-slate-50/30 border-t border-slate-50">
          <button 
            className="h-11 rounded-lg border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]" 
            onClick={onCancel} 
            type="button"
          >
            Cancel
          </button>
          <button
            className={`h-11 rounded-lg px-8 text-sm font-semibold text-white shadow-lg transition active:scale-[0.98] ${
              isDangerous 
              ? 'bg-rose-600 shadow-rose-900/10 hover:bg-rose-700' 
              : 'bg-blue-600 shadow-blue-900/10 hover:bg-blue-700'
            }`}
            onClick={() => onConfirm(target)}
            type="button"
          >
            Confirm Execution
          </button>
        </div>
      </div>
    </BlurOverlay>
  );
}

export function ProcessEndConfirmDialog({ count, loading, onCancel, onConfirm }) {
  if (!count) return null;

  return createPortal(
    <BlurOverlay onClose={onCancel}>
      <div className="w-full rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-rose-100 bg-rose-50 text-rose-600">
            <ShieldAlert size={22} />
          </span>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-900">End selected process{count > 1 ? "es" : ""}?</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              This sends a termination command to the agent. Unsaved work in the selected app may be lost.
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            className="h-11 rounded-lg border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]"
            disabled={loading}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-rose-600 px-6 text-sm font-semibold text-white shadow-lg shadow-rose-900/10 transition hover:bg-rose-700 disabled:cursor-wait disabled:opacity-70"
            disabled={loading}
            onClick={onConfirm}
            type="button"
          >
            <CircleStop className={loading ? "animate-spin" : ""} size={16} />
            End {count} Processes
          </button>
        </div>
      </div>
    </BlurOverlay>,
    document.body,
  );
}
