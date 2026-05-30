import {
  Archive,
  ChevronDown,
  CircleStop,
  Cpu,
  Globe2,
  Database,
  Info,
  CircuitBoard,
  Users,
  Monitor,
  Network,
  RadioTower,
  Thermometer,
  Hourglass,
  Usb,
  X,
  Power,
  RotateCw,
  Moon,
  Lock,
  ArrowUpCircle,
  Terminal,
  History,
  Search,
  ShieldAlert,
  LoaderCircle,
  CircleHelp,
  HardDrive,
  MonitorDot,
  Zap,
  Trash2,
  MessageSquare,
  Eraser,
  Clock as ClockIcon,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useLayoutEffect, useRef, useEffect, useMemo, useState } from "react";
import { MetricPill } from "./MetricPill.jsx";
import { SearchFilterBar } from "./SearchFilterBar.jsx";
import { DateFilterBar } from "./DateFilterBar.jsx";
import { Pagination } from "./Pagination.jsx";
import { useTelemetryInterval } from "../hooks/useTelemetryInterval.js";
import { useToast } from "./ToastProvider.jsx";
import * as clientApi from "../services/clientApi.js";
import * as settingsApi from "../services/settingsApi.js";
import {
  formatBool,
  formatBytesPerSecond,
  formatPercent,
  formatTemperature,
  formatUptimeVerbose,
  matchesSearch,
} from "../shared/utils.js";

function getUsbSearchText(device = {}) {
  return [device.name, device.type, device.vendor, device.id]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function inferPeripherals(peripherals = {}, usbDevices = []) {
  const texts = usbDevices.map(getUsbSearchText);

  const inferred = {
    mouse: texts.some((text) =>
      includesAny(text, ["mouse", "pointing device", "trackball", "touchpad"]),
    ),
    keyboard: texts.some((text) =>
      includesAny(text, ["keyboard", "kbd", "keychron", "logitech receiver"]),
    ),
    wifiDongle: texts.some((text) =>
      includesAny(text, [
        "wireless",
        "wi-fi",
        "wifi",
        "802.11",
        "wlan",
        "rtl8188",
        "rtl8192",
        "rtl8812",
        "rtl8814",
        "realtek 11n",
        "ac600",
        "ac1200",
        "wireless adapter",
        "wireless lan",
        "network adapter",
        "wifi adapter",
      ]),
    ),
    bluetoothDongle: texts.some((text) =>
      includesAny(text, [
        "bluetooth",
        "bt adapter",
        "bt dongle",
        "bluetooth radio",
        "csr8510",
        "broadcom bluetooth",
      ]),
    ),
    webcam: texts.some((text) =>
      includesAny(text, ["camera", "webcam", "uvc", "imaging device"]),
    ),
    storage: texts.some((text) =>
      includesAny(text, [
        "mass storage",
        "flash",
        "disk",
        "usb drive",
        "thumb drive",
        "storage",
        "card reader",
      ]),
    ),
  };

  return {
    ...peripherals,
    ...Object.fromEntries(
      Object.entries(inferred).map(([key, value]) => [
        key,
        Boolean(peripherals[key]) || value,
      ]),
    ),
  };
}

function DetailItem({ label, value }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200/60 bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-100/60 transition hover:border-slate-200">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold leading-5 text-slate-800">
        {value || "Unknown"}
      </dd>
    </div>
  );
}

function ListItem({ title, detail }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200/60 bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-100/60 transition hover:bg-slate-50/60">
      <p className="break-words text-sm font-semibold text-slate-800">
        {title || "Unknown"}
      </p>
      {detail ? <p className="mt-1 truncate text-xs leading-5 text-slate-500">{detail}</p> : null}
    </div>
  );
}

function hasNetworkReading(network = {}) {
  const hasKnownInterface = Boolean(network.interface && network.interface !== "Unknown");
  const hasMeasuredValue = [
    network.uploadBytesPerSec,
    network.downloadBytesPerSec,
    network.latencyMs,
    network.packetLoss,
  ].some((value) => Number.isFinite(Number(value)) && Number(value) > 0);

  return Boolean(
    hasKnownInterface ||
      hasMeasuredValue,
  );
}

function hasTemperatureReading(temperature = {}) {
  return Boolean(
    Number(temperature.cpu?.temperatureCelsius) > 0 ||
      Number(temperature.gpu?.temperatureCelsius) > 0 ||
      (temperature.gpu?.model && temperature.gpu.model !== "Unknown"),
  );
}

import { BlurOverlay } from "./BlurOverlay.jsx";

function ConfirmDialog({ device, onCancel, onConfirm }) {
  if (!device) return null;

  return (
    <BlurOverlay onClose={onCancel}>
      <div className="w-full rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
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
            className="h-11 rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-11 rounded-xl bg-slate-900 px-6 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition hover:bg-slate-800 active:scale-[0.98]"
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

function DetailViewSwitch({ activeView, onChange, canControl }) {
  const buttons = [
    { id: "specification", label: "Specification", icon: Monitor },
    { id: "networkActivity", label: "Network Activity", icon: RadioTower },
    { id: "behavior", label: "Timeline & Assets", icon: History },
    ...(canControl ? [{ id: "remoteControl", label: "Remote Controls", icon: Terminal }] : []),
  ];

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      {buttons.map((button) => {
        const Icon = button.icon;
        const selected = activeView === button.id;

        return (
          <button
            className={`btn-minimal h-10 px-4 transition-all ${
              selected
                ? "!border-slate-900 !bg-slate-900 !text-white shadow-lg shadow-slate-900/15 hover:!border-slate-900 hover:!bg-slate-900 hover:!text-white"
                : "!bg-white text-slate-500 hover:!border-slate-300 hover:!bg-slate-50 hover:!text-slate-900"
            }`}
            key={button.id}
            onClick={() => onChange(button.id)}
            title={button.label}
            type="button"
            aria-label={button.label}
          >
            <Icon size={16} strokeWidth={2.5} />
            <span className="hidden text-xs font-semibold uppercase tracking-wider sm:inline">{button.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function BroadcastDialog({ onCancel, onSend, device, allDevices = [] }) {
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
      <div className="w-full max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-slate-50 bg-slate-50/30">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600 shadow-sm">
            <MessageSquare size={22} strokeWidth={2.5} />
          </span>
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">Broadcast Message</h3>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">System Notification</p>
          </div>
        </div>
        
        {/* Content Area */}
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
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                    active 
                    ? 'border-blue-600 bg-white shadow-md ring-4 ring-blue-50' 
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
            className="w-full h-28 rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-sm font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100/50 transition-all resize-none"
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Lab will close in 5 minutes. Please save your work."
            value={message}
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 bg-slate-50/30 border-t border-slate-50">
          <button 
            className="h-11 rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]" 
            onClick={onCancel} 
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-11 rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-lg shadow-blue-900/10 transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
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

function ActionConfirmDialog({ action, onCancel, onConfirm, device, allDevices = [] }) {
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
      <div className="w-full max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        {/* Header - Tightened */}
        <div className="flex items-center gap-3 p-5 border-b border-slate-50 bg-slate-50/30">
          <span className={`grid h-11 w-11 place-items-center rounded-xl border shadow-sm ${isDangerous ? 'border-rose-100 bg-rose-50 text-rose-600' : 'border-blue-100 bg-blue-50 text-blue-600'}`}>
            <Icon size={22} strokeWidth={2.5} />
          </span>
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">{action.label}</h3>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Remote Command</p>
          </div>
        </div>
        
        {/* Scrollable Content Area */}
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
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                    active 
                    ? 'border-blue-600 bg-white shadow-md ring-4 ring-blue-50' 
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

          <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
            <p className="text-xs font-medium text-slate-600 leading-relaxed">
              Confirming will <strong>{action.label.toLowerCase()}</strong> {targetCount > 1 ? `${targetCount} devices` : "this device"}. 
              <span className="block mt-1 text-slate-400 font-normal text-[10px]">{action.description}</span>
            </p>
          </div>
        </div>

        {/* Footer - Compact */}
        <div className="flex justify-end gap-2 p-4 bg-slate-50/30 border-t border-slate-50">
          <button 
            className="h-11 rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]" 
            onClick={onCancel} 
            type="button"
          >
            Cancel
          </button>
          <button
            className={`h-11 rounded-xl px-8 text-sm font-semibold text-white shadow-lg transition active:scale-[0.98] ${
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


function RemoteControlPanel({ device, allDevices = [], utilityConfig }) {
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

      <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 sm:p-6 shadow-inner">
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
                  className="flex h-24 w-full flex-col items-center justify-center gap-2 rounded-xl border border-slate-200/60 bg-slate-50/30 text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-white hover:shadow-md active:scale-95 disabled:cursor-wait disabled:opacity-50"
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
                <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-3 hidden w-44 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-center text-[11px] font-medium leading-relaxed text-white shadow-2xl group-hover:block">
                  {action.description}
                  <div className="absolute left-1/2 top-full -ml-1.5 border-[6px] border-transparent border-t-slate-900" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 sm:p-6 shadow-inner">
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
                    className="flex h-24 w-full flex-col items-center justify-center gap-2 rounded-xl border border-slate-200/60 bg-slate-50/30 text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-white hover:shadow-md active:scale-95 disabled:cursor-wait disabled:opacity-50"
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
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-3 hidden w-44 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-center text-[11px] font-medium leading-relaxed text-white shadow-2xl group-hover:block">
                    {action.description}
                    <div className="absolute left-1/2 top-full -ml-1.5 border-[6px] border-transparent border-t-slate-900" />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full flex flex-col items-center justify-center py-6 text-center">
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-slate-300">
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

        <div className="mt-6 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3.5 text-xs font-medium leading-5 text-blue-700 shadow-sm">
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

function ActivityMonitor({ connections, history, error }) {
  const [showHistory, setShowHistory] = useState(false);
  const [query, setQuery] = useState("");
  const activeDomains = new Set(connections.map(c => c.domain));
  const filteredHistory = history.filter(h => !activeDomains.has(h.domain));
  const visibleItems = useMemo(() => {
    const source = showHistory ? filteredHistory : connections;
    return source.filter((item) =>
      matchesSearch(item, query, ["domain", "peerAddress", "process", "organization", "serviceLabel"]),
    );
  }, [connections, filteredHistory, query, showHistory]);
  
  const activeListRef = useRef(null);
  const historyListRef = useRef(null);
  const scrollPos = useRef({ active: 0, history: 0 });

  useLayoutEffect(() => {
    if (activeListRef.current) activeListRef.current.scrollTop = scrollPos.current.active;
    if (historyListRef.current) historyListRef.current.scrollTop = scrollPos.current.history;
  });

  const handleScroll = (type) => (e) => {
    scrollPos.current[type] = e.target.scrollTop;
  };

  return (
    <section className="flex flex-col h-full max-h-[640px] overflow-hidden rounded-xl border border-slate-200/60 bg-white p-4 sm:p-6 shadow-sm">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600 shadow-sm">
            <Globe2 size={18} strokeWidth={2.5} />
          </span>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold uppercase tracking-widest text-slate-800 font-ui">
              Activity Monitor
            </h4>
            <div className="group relative">
              <CircleHelp size={14} strokeWidth={2.5} className="cursor-help text-slate-300 hover:text-slate-500 transition-colors" />
              <div className="pointer-events-none absolute top-full left-1/2 z-20 mt-3 hidden w-64 -translate-x-1/2 rounded-xl bg-slate-900 p-4 text-[11px] font-medium leading-relaxed text-white shadow-2xl group-hover:block">
                <p className="font-bold text-blue-400 mb-1">Network Visibility</p>
                Tracks real-time and historical network interactions. It maps outbound connections to hostnames (DNS) and identifies which applications (processes) are communicating with external services.
                <div className="absolute bottom-full left-1/2 -ml-1.5 border-[6px] border-transparent border-b-slate-900" />
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex w-fit items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/50 p-1">
          <div 
            className={`absolute h-9 w-9 rounded-md bg-white shadow-sm ring-1 ring-slate-200 transition-all duration-300 ease-in-out ${showHistory ? "translate-x-10" : "translate-x-0"}`}
          />
          <button
            onClick={() => setShowHistory(false)}
            className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-md transition-colors duration-300 ${!showHistory ? "text-slate-900" : "text-slate-400 hover:text-slate-600"}`}
            title="Show active sites and connections"
            type="button"
          >
            <Globe2 size={16} strokeWidth={2.5} />
          </button>
          <button
            onClick={() => setShowHistory(true)}
            className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-md transition-colors duration-300 ${showHistory ? "text-slate-900" : "text-slate-400 hover:text-slate-600"}`}
            title="Show recent activity history"
            type="button"
          >
            <History size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <SearchFilterBar
        className="mb-5 !border-slate-200 !bg-slate-50/50"
        count={visibleItems.length}
        onQueryChange={setQuery}
        placeholder={showHistory ? "Search recent activity" : "Search active sites"}
        query={query}
      />

      {error && (
        <div className="mb-5 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-600">
          {error}
        </div>
      )}

      <div className="flex flex-1 flex-col min-h-0">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 font-ui px-1">
          {showHistory ? "Recent Activity History" : "Active Sites & Connections"}
        </p>
        <div 
          className={`custom-scrollbar grid gap-3 overflow-auto pr-1 flex-1 transition-opacity duration-300 ${visibleItems.length === 0 ? "opacity-50" : "opacity-100"}`}
          style={{ minHeight: '300px' }}
          onScroll={handleScroll(showHistory ? "history" : "active")}
          ref={showHistory ? historyListRef : activeListRef}
          key={showHistory ? "history-list" : "active-list"}
        >
          {!showHistory && visibleItems.length > 0 ? visibleItems.map((item) => (
            <div
              className="group min-w-0 rounded-xl border border-slate-200/60 bg-white p-3 shadow-sm transition hover:border-slate-300 hover:shadow-md"
              key={item.id ? `conn-${item.id}` : `conn-${item.process}-${item.domain}-${item.peerAddress}-${item.peerPort}`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={`truncate text-sm font-bold font-ui ${item.domain?.includes('localhost') ? 'text-blue-600' : 'text-slate-900'}`}>
                      {item.domain || item.peerAddress}
                    </p>
                    {item.isCloud && (
                      <span className="rounded bg-blue-50 px-1 py-0.5 text-[7px] font-bold text-blue-600 uppercase border border-blue-100">Cloud</span>
                    )}
                  </div>
                  {item.organization && item.organization !== item.domain && (
                    <p className="mt-0.5 truncate text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                      {item.organization}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {item.count > 1 && (
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 uppercase">
                      {item.count} hits
                    </span>
                  )}
                  <span className="rounded-md border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600 uppercase">
                    Live
                  </span>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 border-t border-slate-50 pt-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Via</span>
                  <span className="text-[11px] font-bold text-slate-700 font-data truncate">{item.process}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-ui">Port</span>
                  <span className="text-[11px] font-bold text-slate-600 font-data tabular-nums">{item.peerPort}</span>
                </div>
              </div>
            </div>
          )) : !showHistory ? (
            <div className="flex h-full items-center justify-center py-12">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300 font-ui">No active activity detected.</p>
            </div>
          ) : null}
          {showHistory && visibleItems.length > 0 ? visibleItems.map((item) => (
            <div
              className="group min-w-0 rounded-xl border border-slate-200/60 bg-white p-3 shadow-sm transition hover:border-slate-300 hover:shadow-md opacity-90"
              key={`hist-${item.domain}-${item.process}`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="truncate text-sm font-bold text-slate-700 font-ui">
                  {item.domain}
                </p>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter font-data">
                  {new Date(item.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 border-t border-slate-50 pt-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Via</span>
                  <span className="text-[11px] font-bold text-slate-600 font-data truncate">{item.process}</span>
                </div>
              </div>
            </div>
          )) : showHistory ? (
            <div className="flex h-full items-center justify-center py-12">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300 font-ui">No history archived yet.</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

const ProcessList = ({ list, title, icon: Icon, actionLoading, selectedProcesses, onToggle }) => {
  const listRef = useRef(null);
  const scrollPos = useRef(0);

  useLayoutEffect(() => {
    if (listRef.current) listRef.current.scrollTop = scrollPos.current;
  });

  const handleScroll = (e) => {
    scrollPos.current = e.target.scrollTop;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h5 className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 font-ui">
        <Icon size={12} strokeWidth={2.5} />
        {title} ({list.length})
      </h5>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200/60 bg-white shadow-sm">
        <div className="hidden grid-cols-[44px_1fr_80px_100px_100px] gap-4 border-b border-slate-100 bg-slate-50/50 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 font-ui lg:grid">
          <div />
          <div>Process Name</div>
          <div className="text-right">CPU Load</div>
          <div className="text-right">Memory</div>
          <div className="text-center">Status</div>
        </div>

        <div 
          className="max-h-96 divide-y divide-slate-100 overflow-auto custom-scrollbar xl:min-h-0 xl:flex-1"
          onScroll={handleScroll}
          ref={listRef}
        >
          {list.length > 0 ? list.map((process) => {
            const ended = process.status === "Ended";
            const uniqueId = `proc-${process.pid}-${process.name}`;

            return (
              <label
                className={`flex flex-col gap-3 px-4 py-3.5 transition lg:grid lg:grid-cols-[44px_1fr_80px_100px_100px] lg:items-center lg:gap-4 ${
                  ended ? "bg-slate-50/50 text-slate-400" : "text-slate-700 hover:bg-slate-50/50"
                } cursor-pointer`}
                key={uniqueId}
              >
                <div className="flex items-center gap-3 lg:justify-center lg:gap-0">
                  <input
                    checked={selectedProcesses.includes(uniqueId)}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    disabled={ended || actionLoading}
                    onChange={() => onToggle(uniqueId)}
                    type="checkbox"
                  />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 lg:hidden">Select Process</span>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-slate-900 leading-tight font-ui">
                    {process.name}
                  </p>
                  <p className="truncate text-[10px] text-slate-500 mt-1 font-data">
                    {process.windowTitle || `PID ${process.pid} - ${process.user}`}
                  </p>
                </div>

                <div className="flex items-center justify-between lg:block lg:text-right">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 lg:hidden">CPU Usage</span>
                  <span className="text-xs font-bold font-data tabular-nums text-slate-700">
                    {process.cpu}%
                  </span>
                </div>

                <div className="flex items-center justify-between lg:block lg:text-right">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 lg:hidden">Memory</span>
                  <span className="text-xs font-bold font-data tabular-nums text-slate-700">
                    {process.memoryMb} MB
                  </span>
                </div>

                <div className="flex items-center justify-between lg:justify-center">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 lg:hidden">Status</span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight border ${
                      ended
                        ? "bg-slate-100 border-slate-200 text-slate-400"
                        : "bg-emerald-50 border-emerald-100 text-emerald-600"
                    }`}
                  >
                    {process.status}
                  </span>
                </div>
              </label>
            );
          }) : (
            <div className="py-12 text-center text-[10px] font-bold uppercase tracking-widest text-slate-300 font-ui">No processes detected.</div>
          )}
        </div>
      </div>
    </div>
  );
};

function ProcessMonitor({ processes, actionLoading, actionMessage, selectedProcesses, onToggle, onEnd }) {
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("cpu");
  const visibleProcesses = useMemo(() => {
    const searched = processes.filter((process) =>
      matchesSearch(process, query, ["name", "user", "pid", "windowTitle", "status"]),
    );

    return [...searched].sort((first, second) => {
      if (sortBy === "name") return String(first.name || "").localeCompare(String(second.name || ""));
      if (sortBy === "memory") return Number(second.memoryMb || 0) - Number(first.memoryMb || 0);
      return Number(second.cpu || 0) - Number(first.cpu || 0);
    });
  }, [processes, query, sortBy]);

  return (
    <section className="flex h-full max-h-[640px] min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/60 bg-white p-4 sm:p-6 shadow-sm">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-slate-50 pb-5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-100 bg-rose-50 text-rose-600 shadow-sm">
            <CircleStop size={18} strokeWidth={2.5} />
          </span>
          <h4 className="text-sm font-bold uppercase tracking-widest text-slate-800 font-ui">
            Process Monitor
          </h4>
        </div>
        <button
          className={`inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-xs font-bold uppercase tracking-wider transition disabled:cursor-not-allowed disabled:opacity-50 ${
            actionLoading 
              ? "bg-slate-100 text-slate-500 border-slate-200" 
              : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 active:scale-95"
          }`}
          disabled={selectedProcesses.length === 0 || actionLoading}
          onClick={onEnd}
          type="button"
        >
          <CircleStop className={actionLoading ? "animate-spin" : ""} size={16} strokeWidth={2.5} />
          {actionLoading ? "Ending..." : `End ${selectedProcesses.length || ""} selected`}
        </button>
      </div>

      {actionMessage.text && (
        <div className={`mb-5 flex items-center gap-3 rounded-xl border px-4 py-3 text-xs font-bold shadow-sm ${
          actionMessage.type === "error" ? "bg-rose-50 border-rose-200 text-rose-700" :
          actionMessage.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
          "bg-blue-50 border-blue-200 text-blue-700"
        }`}>
          <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            actionMessage.type === "error" ? "bg-rose-500" :
            actionMessage.type === "success" ? "bg-emerald-500" :
            "bg-blue-500"
          } animate-pulse`} />
          {actionMessage.text}
        </div>
      )}

      <SearchFilterBar
        className="mb-5 !border-slate-200 !bg-slate-50/50"
        count={visibleProcesses.length}
        filters={[
          {
            id: "sort",
            label: "Sort",
            value: sortBy,
            onChange: setSortBy,
            options: [
              { value: "cpu", label: "CPU usage" },
              { value: "memory", label: "Memory usage" },
              { value: "name", label: "Alphabetical" },
            ],
          },
        ]}
        onQueryChange={setQuery}
        placeholder="Search active processes"
        query={query}
      />

      <div className="grid min-h-0 flex-1 gap-6">
        <ProcessList 
          icon={Cpu} 
          list={visibleProcesses}
          title="Process Stream" 
          actionLoading={actionLoading}
          selectedProcesses={selectedProcesses}
          onToggle={onToggle}
        />
      </div>
    </section>
  );
}

function ProcessEndConfirmDialog({ count, loading, onCancel, onConfirm }) {
  if (!count) return null;

  return createPortal(
    <BlurOverlay onClose={onCancel}>
      <div className="w-full rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-rose-100 bg-rose-50 text-rose-600">
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
            className="h-11 rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]"
            disabled={loading}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 px-6 text-sm font-semibold text-white shadow-lg shadow-rose-900/10 transition hover:bg-rose-700 disabled:cursor-wait disabled:opacity-70"
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

function NetworkActivityDetails({ device }) {
  const [processes, setProcesses] = useState([]);
  const [history, setHistory] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState({ text: "", type: "" });
  
  const [selectedProcesses, setSelectedProcesses] = useState([]);
  const [endedProcesses, setEndedProcesses] = useState([]);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const refreshIntervalMs = useTelemetryInterval();

  useEffect(() => {
    let active = true;
    let timer = null;

    async function fetchData() {
      try {
        const [procData, activityData, historyData] = await Promise.all([
          clientApi.getClientProcesses(device.id),
          clientApi.getClientNetworkActivity(device.id),
          clientApi.getClientActivityHistory(device.id),
        ]);

        if (!active) return;

        setProcesses(procData || []);
        setHistory(historyData || []);
        setConnections(activityData?.activeConnections || activityData?.connections || []);
        setLoading(false);
        setError("");
      } catch (err) {
        if (!active) return;
        setError("Failed to load real-time network activity.");
        setLoading(false);
      }
    }

    fetchData();
    timer = setInterval(fetchData, refreshIntervalMs);

    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [device.id, refreshIntervalMs]);

  const displayedProcesses = processes.map((p) => ({
    pid: p.pid,
    name: p.name,
    user: p.user,
    cpu: p.cpu,
    memoryMb: p.memoryMb,
    windowTitle: p.windowTitle,
    status: endedProcesses.includes(p.pid) ? "Ended" : "Running",
  }));

  function toggleProcess(processId) {
    setSelectedProcesses((current) =>
      current.includes(processId)
        ? current.filter((id) => id !== processId)
        : [...current, processId],
    );
  }

  async function endSelectedProcesses() {
    if (selectedProcesses.length === 0) return;

    setActionLoading(true);
    setActionMessage({ text: "Ending processes...", type: "info" });

    const pidsToKill = selectedProcesses.map(id => {
      const match = id.match(/proc-(\d+)-/);
      return match ? parseInt(match[1], 10) : null;
    }).filter(Boolean);

    const results = [];

    for (const pid of pidsToKill) {
      try {
        const result = await clientApi.killClientProcess(device.id, pid);
        if (result.success) {
          setEndedProcesses(prev => [...prev, pid]);
          results.push({ pid, success: true });
        }
      } catch (err) {
        results.push({ pid, success: false, message: err.message });
      }
    }

    const failed = results.filter(r => !r.success);
    if (failed.length > 0) {
      setActionMessage({ text: failed[0].message, type: "error" });
    } else {
      setActionMessage({ text: "Processes ended successfully.", type: "success" });
    }

    setSelectedProcesses([]);
    setActionLoading(false);
    
    // Success disappears in 5s, errors stay for 15s so they can be read
    const delay = failed.length > 0 ? 15000 : 5000;
    setTimeout(() => setActionMessage({ text: "", type: "" }), delay);
  }

  if (loading && processes.length === 0) {
    return (
      <div className="py-12 text-center">
        <LoaderCircle className="mx-auto animate-spin text-slate-400 mb-4" size={24} strokeWidth={2.5} />
        <p className="text-sm font-bold uppercase tracking-widest text-slate-400 font-ui">Establishing real-time stream...</p>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 items-start gap-6 lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <ProcessEndConfirmDialog
        count={confirmEnd ? selectedProcesses.length : 0}
        loading={actionLoading}
        onCancel={() => setConfirmEnd(false)}
        onConfirm={async () => {
          await endSelectedProcesses();
          setConfirmEnd(false);
        }}
      />
      <ActivityMonitor 
        connections={connections}
        error={error}
        history={history}
      />
      <ProcessMonitor 
        actionLoading={actionLoading}
        actionMessage={actionMessage}
        onEnd={() => setConfirmEnd(true)}
        onToggle={toggleProcess}
        processes={displayedProcesses}
        selectedProcesses={selectedProcesses}
      />
    </div>
  );
}

function dateToMs(value, endOfDay = false) {
  if (!value) return "";
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(date.getTime()) ? "" : String(date.getTime());
}

function PeripheralHistoryPanel({ deviceId, history, canControl }) {
  const [localHistory, setLocalHistory] = useState(history || { inventory: [], events: [] });
  const [statusView, setStatusView] = useState("active");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [pendingKey, setPendingKey] = useState("");
  const [message, setMessage] = useState("");
  const inventory = localHistory?.inventory || [];
  const events = localHistory?.events || [];
  const activeInventory = inventory.filter((item) => item.status !== "archived");
  const archivedInventory = inventory.filter((item) => item.status === "archived");
  const visibleInventory = statusView === "archived" ? archivedInventory : activeInventory;
  const missing = activeInventory.filter((item) => item.status === "missing");

  useEffect(() => {
    setLocalHistory(history || { inventory: [], events: [] });
  }, [history]);

  async function reloadHistory() {
    if (!deviceId) return;
    const nextHistory = await clientApi.getClientPeripheralHistoryFiltered(deviceId, {
      startDate: dateToMs(startDate),
      endDate: dateToMs(endDate, true),
    });
    setLocalHistory(nextHistory || { inventory: [], events: [] });
  }

  async function handlePeripheralAction(item, action) {
    setPendingKey(`${action}:${item.key}`);
    setMessage("");
    try {
      await clientApi.updatePeripheralStatus(deviceId, item.key, action);
      await reloadHistory();
      setMessage(`${item.name || "Peripheral"} ${action === "resolve" ? "resolved" : action === "archive" ? "archived" : "recovered"}.`);
    } catch (error) {
      setMessage(error.message || "Unable to update peripheral.");
    } finally {
      setPendingKey("");
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-slate-200/60 bg-white p-5 sm:p-6 shadow-sm">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-100 bg-amber-50 text-amber-600 shadow-sm">
            <Usb size={18} strokeWidth={2.5} />
          </span>
          <h4 className="text-sm font-bold uppercase tracking-widest text-slate-800 font-ui">
            Peripheral Tracking
          </h4>
        </div>
        {missing.length ? (
          <span className="w-fit rounded-full border border-rose-200 bg-rose-50 px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-rose-600 shadow-sm">
            {missing.length} Missing Hardware
          </span>
        ) : (
          <span className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-600 shadow-sm">
            Security Check: Clear
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2 min-w-0 items-stretch">
        <div className="flex flex-col min-w-0">
          <div className="mb-4 flex flex-wrap gap-2">
            {[
              { id: "active", label: "Active", count: activeInventory.length },
              { id: "archived", label: "Archived", count: archivedInventory.length },
            ].map((item) => (
              <button
                className={`h-11 rounded-xl border px-5 text-xs font-bold uppercase tracking-wide transition shadow-sm ${
                  statusView === item.id
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:border-slate-300"
                }`}
                key={item.id}
                onClick={() => setStatusView(item.id)}
                type="button"
              >
                {item.label} ({item.count})
              </button>
            ))}
          </div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 font-ui px-1">Inventory State</p>
          <div className="custom-scrollbar overflow-auto pr-1 max-h-[500px] flex-1">
            {visibleInventory.length ? (
              <div className="grid gap-3">
                {visibleInventory.map((item) => (
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 shadow-sm transition hover:bg-white hover:border-slate-200 min-w-0" key={item.key}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="break-all text-sm font-bold text-slate-800 font-ui">{item.name}</p>
                        <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">{item.category || "Peripheral"}{item.vendor ? ` - ${item.vendor}` : ""}</p>
                      </div>
                      <span className={`w-fit whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight border ${
                        item.status === "missing"
                          ? "bg-rose-50 border-rose-100 text-rose-600"
                          : item.status === "resolved"
                            ? "bg-blue-50 border-blue-100 text-blue-600"
                            : item.status === "archived"
                              ? "bg-slate-100 border-slate-200 text-slate-500"
                              : "bg-emerald-50 border-emerald-100 text-emerald-600"
                      }`}>
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-3 text-[10px] font-bold text-slate-400 font-data">
                      Reported {item.lastSeenAt ? new Date(Number(item.lastSeenAt)).toLocaleString() : "Unknown"}
                    </p>
                    {canControl ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {item.status === "missing" ? (
                          <button
                            className="h-9 rounded-lg border border-blue-100 bg-blue-50 px-3 text-[10px] font-bold uppercase tracking-wide text-blue-700 disabled:opacity-60"
                            disabled={pendingKey === `resolve:${item.key}`}
                            onClick={() => handlePeripheralAction(item, "resolve")}
                            type="button"
                          >
                            Resolve
                          </button>
                        ) : null}
                        {item.status !== "archived" ? (
                          <button
                            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-bold uppercase tracking-wide text-slate-600 disabled:opacity-60"
                            disabled={pendingKey === `archive:${item.key}`}
                            onClick={() => handlePeripheralAction(item, "archive")}
                            type="button"
                          >
                            Archive
                          </button>
                        ) : (
                          <button
                            className="h-9 rounded-lg border border-emerald-100 bg-emerald-50 px-3 text-[10px] font-bold uppercase tracking-wide text-emerald-700 disabled:opacity-60"
                            disabled={pendingKey === `recover:${item.key}`}
                            onClick={() => handlePeripheralAction(item, "recover")}
                            type="button"
                          >
                            Recover
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center h-full flex items-center justify-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300 font-ui">No Inventory Samples</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col min-w-0">
          <DateFilterBar
            endDate={endDate}
            loading={pendingKey !== ""}
            onApply={reloadHistory}
            onEndDateChange={setEndDate}
            onStartDateChange={setStartDate}
            startDate={startDate}
            className="mb-4"
          />
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 font-ui px-1">Audit Log</p>
          <div className="custom-scrollbar overflow-auto pr-1 max-h-[500px] flex-1">
            {events.length ? (
              <div className="grid gap-3">
                {events.map((event) => (
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 shadow-sm transition hover:bg-white hover:border-slate-200 min-w-0" key={event.id}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="break-all text-sm font-bold text-slate-800 font-ui">{event.name}</p>
                      <span className={`w-fit whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight border ${
                        event.eventType === "connected" ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-amber-50 border-amber-100 text-amber-700"
                      }`}>
                        {event.eventType === "missing_after_offline" ? "Missing after offline" : event.eventType}
                      </span>
                    </div>
                    <p className="mt-3 text-[10px] font-bold text-slate-400 font-data">
                      {event.observedAt ? new Date(Number(event.observedAt)).toLocaleString() : "No time recorded"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center h-full flex items-center justify-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300 font-ui">Logs Empty</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function BehaviorAnalyticsDetails({ device }) {
  const [data, setData] = useState({
    events: [],
    domains: [],
    software: { inventory: [], events: [] },
    health: { snapshots: [], uptimeLogs: [] },
    anomalies: [],
  });
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  async function loadBehaviorData() {
    setLoading(true);
    const params = {
      startDate: dateToMs(startDate),
      endDate: dateToMs(endDate, true),
    };
    const [events, domains, software, health, anomalies] = await Promise.all([
      clientApi.getClientEvents(device.id, params).catch(() => []),
      clientApi.getClientDomains(device.id).catch(() => []),
      clientApi.getClientSoftware(device.id).catch(() => ({ inventory: [], events: [] })),
      clientApi.getClientHealth(device.id).catch(() => ({ snapshots: [], uptimeLogs: [] })),
      clientApi.getClientAnomalies(device.id).catch(() => []),
    ]);

    setData({ events, domains, software, health, anomalies });
    setLoading(false);
  }

  useEffect(() => {
    loadBehaviorData();
  }, [device.id]);

  const riskySoftware = (data.software.inventory || []).filter((item) => item.riskLevel !== "normal");

  return (
    <div className="grid gap-5">
      <DateFilterBar
        endDate={endDate}
        loading={loading}
        onApply={loadBehaviorData}
        onEndDateChange={setEndDate}
        onStartDateChange={setStartDate}
        startDate={startDate}
      />

      <div className="grid gap-4 xl:grid-cols-4">
        <DetailItem label="Tracked Domains" value={data.domains.length} />
        <DetailItem label="Installed Apps" value={data.software.inventory?.length || 0} />
        <DetailItem label="Anomalies" value={data.anomalies.length} />
        <DetailItem label="Uptime" value={data.health.uptimePercent == null ? "Learning" : `${data.health.uptimePercent}%`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200/60 bg-white p-5 shadow-sm">
          <h4 className="mb-4 text-sm font-bold uppercase tracking-widest text-slate-800">Historical Timeline</h4>
          <div className="custom-scrollbar grid max-h-80 gap-3 overflow-auto pr-1">
            {data.events.length ? data.events.map((event) => (
              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3" key={event.id}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-bold text-slate-800">{event.title}</p>
                  <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${
                    event.severity === "critical" ? "border-rose-100 bg-rose-50 text-rose-600" : event.severity === "warning" ? "border-amber-100 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-500"
                  }`}>{event.severity}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{event.description}</p>
                <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">{new Date(Number(event.createdAt)).toLocaleString()}</p>
              </div>
            )) : <p className="py-8 text-center text-xs font-bold uppercase tracking-widest text-slate-300">No timeline events yet.</p>}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200/60 bg-white p-5 shadow-sm">
          <h4 className="mb-4 text-sm font-bold uppercase tracking-widest text-slate-800">Domain Monitoring</h4>
          <div className="custom-scrollbar grid max-h-80 gap-3 overflow-auto pr-1">
            {data.domains.length ? data.domains.slice(0, 60).map((domain) => (
              <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/60 p-3" key={`${domain.domain}-${domain.process}`}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-800">{domain.domain}</p>
                  <p className="truncate text-xs text-slate-500">{domain.process || "System"} - {domain.category}</p>
                </div>
                <span className="shrink-0 rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">{domain.hits} hits</span>
              </div>
            )) : <p className="py-8 text-center text-xs font-bold uppercase tracking-widest text-slate-300">No domain summaries yet.</p>}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200/60 bg-white p-5 shadow-sm">
          <h4 className="mb-4 text-sm font-bold uppercase tracking-widest text-slate-800">Software Inventory</h4>
          <div className="custom-scrollbar grid max-h-80 gap-3 overflow-auto pr-1">
            {riskySoftware.length ? riskySoftware.map((software) => (
              <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3" key={software.key}>
                <p className="text-sm font-bold text-slate-800">{software.name}</p>
                <p className="text-xs text-amber-700">{software.publisher || "Unknown publisher"} {software.version ? `- ${software.version}` : ""}</p>
              </div>
            )) : (data.software.inventory || []).slice(0, 40).map((software) => (
              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3" key={software.key}>
                <p className="text-sm font-bold text-slate-800">{software.name}</p>
                <p className="text-xs text-slate-500">{software.publisher || "Unknown publisher"} {software.version ? `- ${software.version}` : ""}</p>
              </div>
            ))}
            {!data.software.inventory?.length ? <p className="py-8 text-center text-xs font-bold uppercase tracking-widest text-slate-300">No inventory received yet.</p> : null}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200/60 bg-white p-5 shadow-sm">
          <h4 className="mb-4 text-sm font-bold uppercase tracking-widest text-slate-800">Health and Anomalies</h4>
          <div className="custom-scrollbar grid max-h-80 gap-3 overflow-auto pr-1">
            {data.anomalies.length ? data.anomalies.slice(0, 20).map((alert) => (
              <div className="rounded-lg border border-rose-100 bg-rose-50/40 p-3" key={alert.id}>
                <p className="text-sm font-bold text-slate-800">{alert.title}</p>
                <p className="text-xs text-rose-700">{alert.description}</p>
              </div>
            )) : <p className="rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-xs font-bold uppercase tracking-widest text-emerald-700">No active anomalies in stored history.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function DeviceDetails({ allDevices, device, hardware, metricHistory, peripheralHistory, loading, error, canControl, canManagePeripherals, utilityConfig }) {
  const [activeView, setActiveView] = useState("specification");
  const details = device.details || {};
  const specs = hardware?.profile || details.specs || {};
  const usbDevices = hardware?.usbDevices || details.usbDevices || [];
  const peripherals = inferPeripherals(
    hardware?.peripherals || details.peripherals || {},
    usbDevices,
  );
  const disks = hardware?.disks || specs.disks || [];
  const networkAdapters = hardware?.networkAdapters || specs.networkAdapters || [];
  const graphicsCards = hardware?.graphicsCards || peripherals.graphicsCards || [];
  const displays = hardware?.displays || peripherals.displays || [];
  const metrics = device.metrics || {};
  const latestSample = metricHistory?.latest || null;
  
  const sampleNetwork = metrics.network || latestSample?.network || {};
  const sampleTemperature = metrics.temperature || latestSample?.temperature || {};
  const sampleSystem = metrics.system || latestSample?.system || {};

  return (
    <div className="border-t border-line bg-slate-50 px-4 py-5 sm:px-5">
      {error ? (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
          {error}
        </p>
      ) : null}

      <DetailViewSwitch activeView={activeView} onChange={setActiveView} canControl={canControl} />

      {activeView === "specification" ? (
        <div className="device-detail-view">
          <div className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 shadow-inner">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-600">
            <Monitor size={15} strokeWidth={2.5} />
            Device Info
          </h4>
          <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <DetailItem label="Hostname" value={device.hostname} />
            <DetailItem label="OS" value={device.os} />
            <DetailItem label="IP Address" value={device.ip} />
            <DetailItem label="MAC Address" value={device.mac} />
            <DetailItem label="Group" value={device.group} />
            <DetailItem label="Uptime" value={formatUptimeVerbose(metrics.uptime)} />
            <DetailItem label="OS Platform" value={sampleSystem.os?.platform} />
          </dl>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 shadow-inner">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-600">
            <Cpu size={15} strokeWidth={2.5} />
            Important Specs
          </h4>
          <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <DetailItem label="Manufacturer" value={specs.manufacturer} />
            <DetailItem label="Model" value={specs.model} />
            <DetailItem label="CPU" value={specs.cpu} />
            <DetailItem
              label="Cores / Threads"
              value={`${specs.cpuCores || 0} / ${specs.cpuThreads || 0}`}
            />
            <DetailItem
              label="Memory"
              value={`${specs.totalMemoryGb || 0} GB`}
            />
            <DetailItem label="BIOS" value={specs.bios} />
          </dl>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 shadow-inner">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-600">
            <Usb size={15} strokeWidth={2.5} />
            Peripherals
          </h4>
          <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <DetailItem label="Mouse" value={formatBool(peripherals.mouse)} />
            <DetailItem
              label="Keyboard"
              value={formatBool(peripherals.keyboard)}
            />
            <DetailItem
              label="WiFi Dongle"
              value={formatBool(peripherals.wifiDongle)}
            />
            <DetailItem
              label="BT Dongle"
              value={formatBool(peripherals.bluetoothDongle)}
            />
            <DetailItem label="Webcam" value={formatBool(peripherals.webcam)} />
            <DetailItem
              label="USB Storage"
              value={formatBool(peripherals.storage)}
            />
          </dl>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 shadow-inner">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-600">
            <Thermometer size={15} strokeWidth={2.5} />
            Temperature
          </h4>
          <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <DetailItem
              label="CPU Temperature"
              value={formatTemperature(sampleTemperature.cpu?.temperatureCelsius)}
            />
            <DetailItem
              label="GPU Temperature"
              value={formatTemperature(sampleTemperature.gpu?.temperatureCelsius)}
            />
            <DetailItem label="GPU Model" value={sampleTemperature.gpu?.model} />
          </dl>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 shadow-inner">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-600">
            <Network size={15} strokeWidth={2.5} />
            Network Metrics
          </h4>
          <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <DetailItem label="Interface" value={sampleNetwork.interface} />
            <DetailItem label="Upload" value={formatBytesPerSecond(sampleNetwork.uploadBytesPerSec)} />
            <DetailItem label="Download" value={formatBytesPerSecond(sampleNetwork.downloadBytesPerSec)} />
            <DetailItem
              label="Latency"
              value={sampleNetwork.latencyMs == null ? "Unknown" : `${Math.round(Number(sampleNetwork.latencyMs))} ms`}
            />
            <DetailItem label="Packet Loss" value={formatPercent(sampleNetwork.packetLoss)} />
          </dl>
        </section>

      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 shadow-inner">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-600">
            <MonitorDot size={15} strokeWidth={2.5} />
            Graphics
          </h4>
          <div className="grid gap-2">
            {graphicsCards.length ? (
              graphicsCards.map((gpu, index) => (
                <ListItem
                  detail={`${gpu.vendor || "Unknown"} ${gpu.vram ? `- ${gpu.vram} MB VRAM` : ""}`}
                  key={index}
                  title={gpu.model}
                />
              ))
            ) : (
              <p className="text-sm text-slate-500">No GPU details reported.</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 shadow-inner">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-600">
            <HardDrive size={15} strokeWidth={2.5} />
            Disks
          </h4>
          <div className="grid gap-2">
            {disks.length ? (
              disks.map((disk, index) => (
                <ListItem
                  detail={`${disk.type || "Unknown"} - ${disk.sizeGb || 0} GB`}
                  key={index}
                  title={disk.name}
                />
              ))
            ) : (
              <p className="text-sm text-slate-500">No disk details reported.</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 shadow-inner">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-600">
            <Usb size={15} strokeWidth={2.5} />
            USB Devices
          </h4>
          <div className="custom-scrollbar grid max-h-56 gap-2 overflow-auto pr-1">
            {usbDevices.length ? (
              usbDevices.map((device, index) => (
                <ListItem
                  detail={`${device.type || "USB"} - ${device.vendor || "Unknown"}`}
                  key={index}
                  title={device.name}
                />
              ))
            ) : (
              <p className="text-sm text-slate-500">No USB devices reported.</p>
            )}
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 shadow-inner">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-600">
            <Globe2 size={15} strokeWidth={2.5} />
            Network Adapters
          </h4>
          <div className="custom-scrollbar grid max-h-56 gap-2 overflow-auto pr-1">
            {networkAdapters.length ? (
              networkAdapters.map((adapter, index) => (
                <ListItem
                  detail={`${adapter.type || "Unknown"} - ${adapter.mac || "Unknown"} - ${adapter.ip4 || "Unknown"}`}
                  key={index}
                  title={adapter.name}
                />
              ))
            ) : (
              <p className="text-sm text-slate-500">No network adapters reported.</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 shadow-inner">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-600">
            <Monitor size={15} strokeWidth={2.5} />
            Displays
          </h4>
          <div className="custom-scrollbar grid max-h-56 gap-2 overflow-auto pr-1">
            {displays.length ? (
              displays.map((display, index) => (
                <ListItem
                  detail={display.resolution || "Unknown resolution"}
                  key={index}
                  title={display.model}
                />
              ))
            ) : (
              <p className="text-sm text-slate-500">No display details reported.</p>
            )}
          </div>
        </section>
      </div>

      <PeripheralHistoryPanel
        canControl={canManagePeripherals}
        deviceId={device.id}
        history={peripheralHistory}
      />
        </div>
      ) : activeView === "networkActivity" ? (
        <div className="device-detail-view">
          <NetworkActivityDetails device={device} />
        </div>
      ) : activeView === "behavior" ? (
        <div className="device-detail-view">
          <BehaviorAnalyticsDetails device={device} />
        </div>
      ) : (
        <div className="device-detail-view">
          <RemoteControlPanel device={device} allDevices={allDevices} utilityConfig={utilityConfig} />
        </div>
      )}
    </div>
  );
}


export function DeviceTable({
  devices = [],
  loading = false,
  onUpdateGroup,
  groups = [],
  onArchive,
  canControl = false,
  canManagePeripherals = false,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  totalItems,
}) {
  const [expandedId, setExpandedId] = useState(null);
  const [pendingArchive, setPendingArchive] = useState(null);
  const [detailCache, setDetailCache] = useState({});
  const [utilityConfig, setUtilityConfig] = useState(null);

  useEffect(() => {
    settingsApi.getUtilityConfig().then(setUtilityConfig).catch(() => {});
  }, []);

  useEffect(() => {
    if (!expandedId) return;
  }, [expandedId]);

  useEffect(() => {
    if (!expandedId) return;

    let active = true;

    setDetailCache((current) => {
      const cached = current[expandedId];
      const now = Date.now();
      const isExpired = cached && now - (cached.timestamp || 0) > 60000;

      if (cached?.loading || (cached?.loaded && !isExpired)) {
        return current;
      }

      Promise.all([
        clientApi.getClientHardware(expandedId).catch(() => null),
        clientApi.getClientMetrics(expandedId, { range: "24h", limit: 1440 }).catch(() => null),
        clientApi.getClientPeripheralHistory(expandedId).catch(() => null),
      ]).then(([hardware, metricHistory, peripheralHistory]) => {
        if (!active) return;
        
        setDetailCache((prev) => ({
          ...prev,
          [expandedId]: {
            hardware: hardware || prev[expandedId]?.hardware,
            metricHistory: metricHistory || prev[expandedId]?.metricHistory,
            peripheralHistory: peripheralHistory || { inventory: [], events: [] },
            loading: false,
            loaded: true,
            error: (!hardware && !metricHistory && !peripheralHistory) ? "Failed to load device details." : "",
            timestamp: Date.now(),
          },
        }));
      });

      return {
        ...current,
        [expandedId]: {
          ...current[expandedId],
          loading: true,
          error: "",
        },
      };
    });

    return () => {
      active = false;
    };
  }, [expandedId]);

  if (loading) {
    return (
      <div className="rounded-lg border border-line bg-white p-8 text-center text-sm text-slate-500">
        Loading devices...
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-white p-8 text-center text-sm text-slate-500">
        No devices match the current view.
      </div>
    );
  }

  async function confirmArchive() {
    if (!pendingArchive) return;
    try {
      await onArchive?.(pendingArchive);
      setExpandedId((current) =>
        current === pendingArchive.id ? null : current,
      );
      setPendingArchive(null);
    } catch (error) {}
  }

  return (
    <>
      <ConfirmDialog
        device={pendingArchive}
        onCancel={() => setPendingArchive(null)}
        onConfirm={confirmArchive}
      />

      <div className="overflow-hidden rounded-xl border border-slate-200/60 bg-white shadow-sm transition-all hover:shadow-md">
        <div className="hidden border-b border-slate-200/60 bg-slate-50/50 px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 xl:grid xl:grid-cols-[48px_minmax(160px,1fr)_minmax(130px,0.8fr)_minmax(240px,1.3fr)_minmax(180px,0.9fr)_100px_auto] xl:items-center xl:gap-8">
          <div />
          <div>Device</div>
          <div>Network</div>
          <div>Metrics</div>
          <div>Group</div>
          <div className="text-center">Status</div>
          <div className="text-right">Actions</div>
        </div>

        <div className="divide-y divide-slate-100">
          {devices.map((device) => {
            const metrics = device.metrics || {};
            const groupValue = device.group || "Unassigned";
            const expanded = expandedId === device.id;

            return (
              <article className={`bg-white transition ${expanded ? "bg-slate-50/30" : "hover:bg-slate-50/50"}`} key={device.id}>
                <div className="flex flex-col gap-5 px-4 py-6 sm:px-6 lg:grid lg:grid-cols-[48px_1fr_1fr] lg:items-start lg:gap-x-6 xl:grid-cols-[48px_minmax(160px,1fr)_minmax(130px,0.8fr)_minmax(240px,1.3fr)_minmax(180px,0.9fr)_100px_auto] xl:gap-8 xl:py-5">
                  <div className="flex items-center justify-between lg:block">
                    <button
                      className={`grid h-11 w-11 place-items-center rounded-xl border shadow-sm transition-all duration-300 active:scale-95 sm:h-10 sm:w-10 ${
                        expanded
                          ? "rotate-180 border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/20"
                          : "border-slate-200 bg-white text-slate-400 hover:border-slate-400 hover:text-slate-900"
                      }`}
                      onClick={() =>
                        setExpandedId(expanded ? null : device.id)
                      }
                      title={expanded ? "Collapse details" : "Expand details"}
                      type="button"
                    >
                      <ChevronDown size={18} strokeWidth={2.5} />
                    </button>

                    <div className="flex items-center gap-3 lg:hidden">
                      <span
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest ${
                          device.status === "online"
                            ? "border-emerald-100 bg-emerald-50 text-emerald-600"
                            : "border-rose-100 bg-rose-50 text-rose-600"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${device.status === "online" ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                        {device.status}
                      </span>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <strong className="block truncate text-lg font-bold text-slate-900 tracking-tight lg:text-sm">
                        {device.hostname}
                      </strong>
                    </div>
                    <span className="mt-1 block truncate text-xs font-medium text-slate-500">
                      {device.os}
                    </span>
                  </div>

                  <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/50 p-4 lg:border-0 lg:bg-transparent lg:p-0">
                    <span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-400 xl:hidden">
                      Network Identity
                    </span>
                    <div className="flex flex-col gap-1">
                      <span className="block font-data font-bold text-slate-700">{device.ip}</span>
                      <span className="block font-data text-xs text-slate-400">
                        {device.mac}
                      </span>
                    </div>
                  </div>

                  <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:col-span-2 xl:col-span-1 xl:grid-cols-2">
                    <MetricPill
                      icon={Cpu}
                      label="CPU"
                      value={formatPercent(metrics.cpu)}
                    />
                    <MetricPill
                      icon={CircuitBoard}
                      label="RAM"
                      value={formatPercent(metrics.ram)}
                    />
                    <MetricPill
                      icon={Database}
                      label="Disk"
                      value={formatPercent(metrics.disk)}
                    />
                    <MetricPill
                      icon={Hourglass}
                      label="Uptime"
                      value={formatUptimeVerbose(metrics.uptime)}
                    />
                  </div>

                  <div className="min-w-0 lg:col-start-2 xl:col-start-auto">
                    <span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-400 xl:hidden">
                      Assigned Group
                    </span>
                    <select
                      className="h-11 w-full min-w-0 cursor-pointer rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 outline-none shadow-sm transition hover:border-slate-300 focus:border-slate-900 focus:ring-4 focus:ring-slate-100/50 lg:h-10 lg:w-44 lg:px-3 lg:text-xs"
                      onChange={async (event) => {
                        try {
                          await onUpdateGroup(device.id, event.target.value);
                        } catch (error) {}
                      }}
                      value={groupValue}
                    >
                      {[
                        ...new Set([
                          "Unassigned",
                          ...groups.map((group) => group.name),
                          groupValue,
                        ]),
                      ].map((group) => (
                        <option key={group} value={group}>
                          {group}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="hidden items-center xl:flex">
                    <span
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
                        device.status === "online"
                          ? "border-emerald-100 bg-emerald-50 text-emerald-600 shadow-sm"
                          : "border-rose-100 bg-rose-50 text-rose-600 shadow-sm"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${device.status === "online" ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                      {device.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 pt-5 lg:justify-end lg:border-0 lg:pt-0">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 lg:hidden">Management</span>
                    <div className="group relative">
                      <button
                        className="grid h-10 w-10 place-items-center rounded-xl border border-rose-100 bg-rose-50 text-rose-600 shadow-sm transition-all hover:border-rose-300 hover:bg-rose-100 active:scale-95 lg:h-9 lg:w-9"
                        onClick={() => setPendingArchive(device)}
                        title="Archive device"
                        type="button"
                      >
                        <Archive size={18} strokeWidth={2.5} />
                      </button>
                      <span className="pointer-events-none absolute bottom-full right-0 z-20 mb-3 hidden w-48 rounded-lg bg-slate-900 px-3 py-2 text-center text-[11px] font-medium leading-relaxed text-white shadow-2xl lg:group-hover:block">
                        Archive this device from the registered list
                        <div className="absolute right-3 top-full border-[6px] border-transparent border-t-slate-900" />
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  className={`grid transition-all duration-300 ease-in-out ${
                    expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <DeviceDetails
                      allDevices={devices}
                      device={device}
                      error={detailCache[device.id]?.error}
                      hardware={detailCache[device.id]?.hardware}
                      loading={detailCache[device.id]?.loading}
                      metricHistory={detailCache[device.id]?.metricHistory}
                      peripheralHistory={detailCache[device.id]?.peripheralHistory}
                      canControl={canControl}
                      canManagePeripherals={canManagePeripherals}
                      utilityConfig={utilityConfig}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <Pagination
        currentPage={currentPage}
        totalItems={totalItems}
        pageSize={pageSize}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </>
  );
}
