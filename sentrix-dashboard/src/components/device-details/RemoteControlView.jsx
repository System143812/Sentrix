import {
  Terminal,
  Power,
  RotateCw,
  Moon,
  Lock,
  ArrowUpCircle,
  Zap,
  Trash2,
  Clock as ClockIcon,
  Eraser,
  MessageSquare,
  Info,
} from "lucide-react";
import { useState } from "react";
import { useToast } from "../ToastProvider.jsx";
import * as clientApi from "../../services/clientApi.js";
import { BroadcastDialog, ActionConfirmDialog } from "./shared/Dialogs.jsx";

export function RemoteControlView({ device, allDevices = [], utilityConfig }) {
  const [commandStatus, setCommandStatus] = useState("");
  const [loadingCommand, setLoadingCommand] = useState("");
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const { notify } = useToast();

  const powerActions = [
    { id: "shutdown", label: "Turn off", icon: Power, hoverTone: "group-hover:text-rose-500", description: "Power off this device" },
    { id: "restart", label: "Restart", icon: RotateCw, hoverTone: "group-hover:text-amber-500", description: "Restart this device" },
    { id: "sleep", label: "Sleep", icon: Moon, hoverTone: "group-hover:text-blue-500", description: "Put this device to sleep" },
    { id: "lock", label: "Lock", icon: Lock, hoverTone: "group-hover:text-slate-900", description: "Lock the active session" },
    { id: "update", label: "Update", icon: ArrowUpCircle, hoverTone: "group-hover:text-emerald-500", description: "Start Windows Update scan" },
  ];

  const utilityShortcuts = [
    { id: "network-reset", label: "Network Reset", icon: Zap, hoverTone: "group-hover:text-blue-500", description: "Flush DNS and reset IP stack" },
    { id: "system-purge", label: "System Purge", icon: Trash2, hoverTone: "group-hover:text-rose-500", description: "Clear temp files and update cache" },
    { id: "time-sync", label: "Clock Sync", icon: ClockIcon, hoverTone: "group-hover:text-emerald-500", description: "Force time synchronization" },
    { id: "workspace-reset", label: "Clear Workspace", icon: Eraser, hoverTone: "group-hover:text-amber-500", description: "Kill all non-system applications" },
    { id: "broadcast-message", label: "Broadcast", icon: MessageSquare, hoverTone: "group-hover:text-indigo-500", description: "Send a native screen popup" },
  ];

  const enabledShortcuts = utilityConfig?.enabledIds 
    ? utilityShortcuts.filter(s => utilityConfig.enabledIds.includes(s.id))
    : utilityShortcuts;

  async function handleCommand(targetDevices, command, payload = {}) {
    setLoadingCommand(command);
    const count = targetDevices.length;
    
    if (count > 1) {
      setCommandStatus(`Executing ${command} on ${count} devices...`);
    } else {
      setCommandStatus(`Sending ${command} to ${targetDevices[0].hostname}...`);
    }

    let successCount = 0;
    let failCount = 0;

    for (const d of targetDevices) {
      try {
        await clientApi.sendDeviceCommand(d.id, command, payload);
        successCount++;
        if (count > 1) {
          setCommandStatus(`Progress: ${successCount}/${count} devices reached...`);
        }
      } catch (error) {
        failCount++;
      }
    }

    const finalMsg = count > 1 
      ? `Batch finished: ${successCount} successful, ${failCount} failed.`
      : successCount > 0 ? `${command.charAt(0).toUpperCase() + command.slice(1)} command sent.` : `Unable to send ${command}.`;

    setCommandStatus(finalMsg);
    notify(finalMsg, failCount === 0 ? "success" : "failed");
    setLoadingCommand("");
    setTimeout(() => setCommandStatus(""), 5000);
  }

  function onActionClick(action, type) {
    if (action.id === "broadcast-message") {
      setShowBroadcast(true);
    } else {
      setPendingAction({ ...action, type });
    }
  }

  function confirmPendingAction(scope) {
    if (!pendingAction) return;
    
    const command = pendingAction.type === 'utility' 
      ? `utility:${pendingAction.id}` 
      : pendingAction.id;
    
    let targetDevices = [device];
    if (scope === "group") {
      targetDevices = allDevices.filter(d => d.group === device.group && d.status === "online");
    } else if (scope === "all") {
      targetDevices = allDevices.filter(d => d.status === "online");
    }
      
    handleCommand(targetDevices, command);
    setPendingAction(null);
  }

  return (
    <div className="grid gap-6">
      {showBroadcast && (
        <BroadcastDialog
          device={device}
          allDevices={allDevices}
          onCancel={() => setShowBroadcast(false)}
          onSend={(msg, scope) => {
            setShowBroadcast(false);
            
            let targetDevices = [device];
            if (scope === "group") {
              targetDevices = allDevices.filter(d => d.group === device.group && d.status === "online");
            } else if (scope === "all") {
              targetDevices = allDevices.filter(d => d.status === "online");
            }
            
            handleCommand(targetDevices, "utility:broadcast-message", { text: msg });
          }}
        />
      )}

      {pendingAction && (
        <ActionConfirmDialog
          action={pendingAction}
          device={device}
          allDevices={allDevices}
          onCancel={() => setPendingAction(null)}
          onConfirm={confirmPendingAction}
        />
      )}

      <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-5 sm:p-6 shadow-inner">
        <h4 className="mb-5 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-600">
          <Terminal size={18} strokeWidth={2.5} className="text-slate-400" />
          Remote Power Controls
        </h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {powerActions.map((action) => {
            const Icon = action.icon;
            const pending = loadingCommand === action.id;

            return (
              <div className="group relative" key={action.id}>
                <button
                  className="flex h-24 w-full flex-col items-center justify-center gap-2 rounded-lg border border-slate-200/60 bg-slate-50/30 text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-white hover:shadow-sm active:scale-95 disabled:cursor-wait disabled:opacity-50"
                  disabled={Boolean(loadingCommand)}
                  onClick={() => onActionClick(action, 'power')}
                  type="button"
                >
                  <Icon
                    className={`text-slate-400 transition-colors duration-200 ${action.hoverTone} group-active:text-white ${
                      pending ? "animate-pulse" : ""
                    }`}
                    size={24}
                    strokeWidth={2.5}
                  />
                  <span className="text-[10px] font-bold uppercase tracking-widest">
                    {pending ? "Sending" : action.label}
                  </span>
                </button>
                <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-3 hidden w-44 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-center text-[11px] font-medium leading-relaxed text-white shadow-sm group-hover:block">
                  {action.description}
                  <div className="absolute left-1/2 top-full -ml-1.5 border-[6px] border-transparent border-t-slate-900" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-5 sm:p-6 shadow-inner">
        <h4 className="mb-5 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-600">
          <Zap size={18} strokeWidth={2.5} className="text-slate-400" />
          Admin Maintenance Tools
        </h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {enabledShortcuts.length > 0 ? (
            enabledShortcuts.map((action) => {
              const Icon = action.icon;
              const pending = loadingCommand === `utility:${action.id}`;

              return (
                <div className="group relative" key={action.id}>
                  <button
                    className="flex h-24 w-full flex-col items-center justify-center gap-2 rounded-lg border border-slate-200/60 bg-slate-50/30 text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-white hover:shadow-sm active:scale-95 disabled:cursor-wait disabled:opacity-50"
                    disabled={Boolean(loadingCommand)}
                    onClick={() => onActionClick(action, 'utility')}
                    type="button"
                  >
                    <Icon
                      className={`text-slate-400 transition-colors duration-200 ${action.hoverTone} group-active:text-white ${
                        pending ? "animate-pulse" : ""
                      }`}
                      size={24}
                      strokeWidth={2.5}
                    />
                    <span className="text-[10px] font-bold uppercase tracking-widest">
                      {pending ? "Executing" : action.label}
                    </span>
                  </button>
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-3 hidden w-44 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-center text-[11px] font-medium leading-relaxed text-white shadow-sm group-hover:block">
                    {action.description}
                    <div className="absolute left-1/2 top-full -ml-1.5 border-[6px] border-transparent border-t-slate-900" />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full flex flex-col items-center justify-center py-6 text-center">
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
                <Zap size={24} strokeWidth={2} />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                No active maintenance tools
              </p>
              <p className="mt-1 text-[9px] font-medium text-slate-400">
                Configure shortcuts in system settings
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-3.5 text-xs font-medium leading-5 text-blue-700 shadow-sm">
          <Info className="mt-0.5 shrink-0 text-blue-400" size={18} strokeWidth={2.5} />
          <p>
            Maintenance shortcuts execute pre-defined system scripts as SYSTEM. These are high-priority operations that do not require user interaction.
          </p>
        </div>
        
        {commandStatus ? (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-slate-200/60 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-700 shadow-sm">
            <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            {commandStatus}
          </div>
        ) : null}
      </section>
    </div>
  );
}
