import {
  Archive,
  ChevronDown,
  CircleStop,
  Cpu,
  Globe2,
  HardDrive,
  MemoryStick,
  Monitor,
  Network,
  RadioTower,
  Thermometer,
  Timer,
  Usb,
  X,
  Power,
  RotateCw,
  Moon,
  Lock,
  ArrowUpCircle,
  Terminal,
} from "lucide-react";
import { useLayoutEffect, useRef, useEffect, useState } from "react";
import { MetricPill } from "./MetricPill.jsx";
import * as clientApi from "../services/clientApi.js";
import {
  formatBool,
  formatBytesPerSecond,
  formatPercent,
  formatTemperature,
  formatUptimeVerbose,
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
    <div className="min-w-0 rounded-lg border border-slate-100 bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-100/60 transition hover:border-slate-200">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 break-words text-sm font-bold leading-5 text-slate-800">
        {value || "Unknown"}
      </dd>
    </div>
  );
}

function ListItem({ title, detail }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-100 bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-100/60 transition hover:bg-slate-50/60">
      <p className="break-words text-sm font-bold text-slate-800">
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

function ConfirmDialog({ device, onCancel, onConfirm }) {
  if (!device) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
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
            className="btn-minimal h-10 px-4"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white shadow-lg shadow-slate-900/10 transition hover:bg-slate-800 active:scale-[0.98]"
            onClick={onConfirm}
            type="button"
          >
            Archive
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailViewSwitch({ activeView, onChange }) {
  const buttons = [
    { id: "specification", label: "Specification", icon: Monitor },
    { id: "networkActivity", label: "Network Activity", icon: RadioTower },
    { id: "remoteControl", label: "Remote Controls", icon: Terminal },
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
                ? "border-blue-200 bg-blue-50 text-blue-700 shadow-sm hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                : "bg-white text-slate-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            }`}
            key={button.id}
            onClick={() => onChange(button.id)}
            type="button"
          >
            <Icon size={16} strokeWidth={2.5} />
            <span className="text-xs font-bold uppercase tracking-wide">{button.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function RemoteControlPanel({ device }) {
  const [commandStatus, setCommandStatus] = useState("");
  const [loadingCommand, setLoadingCommand] = useState("");

  const powerActions = [
    { id: "shutdown", label: "Turn off", icon: Power, hoverTone: "group-hover:text-rose-500", description: "Power off this device" },
    { id: "restart", label: "Restart", icon: RotateCw, hoverTone: "group-hover:text-amber-500", description: "Restart this device" },
    { id: "sleep", label: "Sleep", icon: Moon, hoverTone: "group-hover:text-blue-500", description: "Put this device to sleep" },
    { id: "lock", label: "Lock", icon: Lock, hoverTone: "group-hover:text-slate-900", description: "Lock the active session" },
    { id: "update", label: "Update", icon: ArrowUpCircle, hoverTone: "group-hover:text-emerald-500", description: "Start Windows Update scan" },
  ];

  async function handleCommand(command) {
    setLoadingCommand(command);
    setCommandStatus(`Sending ${command}...`);

    try {
      await clientApi.sendDeviceCommand(device.id, command);
      setCommandStatus(`${command.charAt(0).toUpperCase() + command.slice(1)} command sent.`);
    } catch (error) {
      setCommandStatus(error.message || `Unable to send ${command}.`);
    } finally {
      setLoadingCommand("");
      setTimeout(() => setCommandStatus(""), 5000);
    }
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 shadow-inner">
        <h4 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase text-slate-600">
          <Power size={15} strokeWidth={2.5} />
          Remote Controls
        </h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {powerActions.map((action) => {
            const Icon = action.icon;
            const pending = loadingCommand === action.id;

            return (
              <div className="group relative" key={action.id}>
                <button
                  className="flex h-20 w-full flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md active:scale-[0.98] active:border-slate-900 active:bg-slate-900 active:text-white disabled:cursor-wait disabled:opacity-50"
                  disabled={Boolean(loadingCommand)}
                  onClick={() => handleCommand(action.id)}
                  type="button"
                >
                  <Icon
                    className={`text-slate-400 transition-colors duration-200 ${action.hoverTone} group-active:text-white ${
                      pending ? "animate-pulse" : ""
                    }`}
                    size={20}
                    strokeWidth={2.5}
                  />
                  <span className="text-[10px] font-bold uppercase tracking-wide">
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
        {commandStatus ? (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 shadow-sm">
            <div className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse" />
            {commandStatus}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ActivityMonitor({ connections, history, error }) {
  const activeDomains = new Set(connections.map(c => c.domain));
  const filteredHistory = history.filter(h => !activeDomains.has(h.domain));
  
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
    <section className="h-full overflow-hidden rounded-lg border border-line bg-slate-100/80 p-4">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase text-slate-600">
        <Globe2 size={15} />
        Activity Monitor
      </h4>

      {error && (
        <p className="mb-3 text-xs font-medium text-red-600">{error}</p>
      )}

      <div className="grid gap-3">
        <div>
          <p className="mb-2 text-xs font-bold uppercase text-slate-500">
            Active Sites & Connections
          </p>
          <div 
            className="grid max-h-80 gap-2 overflow-auto pr-1"
            onScroll={handleScroll('active')}
            ref={activeListRef}
          >
            {connections.length > 0 ? connections.map((item) => (
              <div
                className="rounded-md bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-200/70"
                key={item.id ? `conn-${item.id}` : `conn-${item.process}-${item.domain}-${item.peerAddress}-${item.peerPort}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className={`break-words text-sm font-bold ${item.domain?.includes('localhost') ? 'text-signal' : 'text-slate-900'}`}>
                      {item.domain || item.peerAddress}
                    </p>
                    {item.organization && item.organization !== item.domain && (
                      <p className="truncate text-[10px] font-medium text-slate-400 flex items-center gap-1">
                        {item.organization}
                        {item.isCloud && (
                          <span className="rounded bg-blue-50 px-1 py-0.5 text-[8px] font-bold text-blue-600 uppercase">Cloud</span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {item.count > 1 && (
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                        {item.count} hits
                      </span>
                    )}
                    <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                      Live
                    </span>
                  </div>
                </div>
                <p className="mt-1 break-words text-xs leading-5 text-slate-500">
                  via <span className="font-semibold text-slate-700">{item.process}</span>
                </p>
              </div>
            )) : (
              <p className="py-4 text-center text-xs text-slate-400">No active activity detected.</p>
            )}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase text-slate-500">
            Recent Activity History
          </p>
          <div 
            className="grid max-h-80 gap-2 overflow-auto pr-1"
            onScroll={handleScroll('history')}
            ref={historyListRef}
          >
            {filteredHistory.length > 0 ? filteredHistory.map((item) => (
              <div
                className="rounded-md bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-200/70 opacity-80"
                key={`hist-${item.domain}-${item.process}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="break-words text-sm font-semibold text-slate-700">
                    {item.domain}
                  </p>
                  <span className="text-[10px] font-medium text-slate-400">
                    {new Date(item.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-slate-500">
                    {item.process}
                  </p>
                  <span 
                    className="text-[10px] text-slate-400"
                    title="Number of times this domain was detected as active"
                  >
                    {item.hitCount} views
                  </span>
                </div>
              </div>
            )) : (
              <p className="py-4 text-center text-xs text-slate-400">No history archived yet.</p>
            )}
          </div>
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
      <h5 className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase text-slate-500">
        <Icon size={12} />
        {title} ({list.length})
      </h5>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-line bg-white shadow-sm">
        <div className="hidden grid-cols-[44px_1fr_60px_80px_90px] gap-3 bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase text-slate-400 lg:grid">
          <div />
          <div>Process</div>
          <div className="text-right">CPU</div>
          <div className="text-right">Memory</div>
          <div className="text-center">Status</div>
        </div>

        <div 
          className="max-h-80 divide-y divide-line overflow-auto xl:min-h-0 xl:flex-1 xl:max-h-none"
          onScroll={handleScroll}
          ref={listRef}
        >
          {list.length > 0 ? list.map((process) => {
            const ended = process.status === "Ended";
            const uniqueId = `proc-${process.pid}-${process.name}`;

            return (
              <label
                className={`grid gap-2 px-3 py-2.5 text-sm transition lg:grid-cols-[44px_1fr_60px_80px_90px] lg:items-center lg:gap-3 ${
                  ended ? "bg-slate-50 text-slate-400" : "text-slate-700 hover:bg-slate-50"
                }`}
                key={uniqueId}
              >
                <div className="flex items-center justify-center">
                  <input
                    checked={selectedProcesses.includes(uniqueId)}
                    className="h-3.5 w-3.5 rounded border-line text-signal focus:ring-signal"
                    disabled={ended || actionLoading}
                    onChange={() => onToggle(uniqueId)}
                    type="checkbox"
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-900 leading-tight">
                    {process.name}
                  </p>
                  <p className="truncate text-[10px] text-slate-500 mt-0.5">
                    {process.windowTitle || `PID ${process.pid} - ${process.user}`}
                  </p>
                </div>
                <span className="text-right text-xs font-medium">{process.cpu}%</span>
                <span className="text-right text-xs font-medium">{process.memoryMb} MB</span>
                <div className="flex justify-center">
                  <span
                    className={`w-fit rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                      ended
                        ? "bg-slate-100 text-slate-400"
                        : "bg-emerald-50 text-emerald-600"
                    }`}
                  >
                    {process.status}
                  </span>
                </div>
              </label>
            );
          }) : (
            <div className="py-6 text-center text-xs text-slate-400 italic">No processes in this category.</div>
          )}
        </div>
      </div>
    </div>
  );
};

function ProcessMonitor({ processes, actionLoading, actionMessage, selectedProcesses, onToggle, onEnd }) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-slate-100/80 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <h4 className="flex items-center gap-2 text-sm font-bold uppercase text-slate-600">
          <CircleStop size={15} />
          Running Processes
        </h4>
        <button
          className={`inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
            actionLoading 
              ? "bg-slate-100 text-slate-500 border-slate-200" 
              : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
          }`}
          disabled={selectedProcesses.length === 0 || actionLoading}
          onClick={onEnd}
          type="button"
        >
          <CircleStop className={actionLoading ? "animate-spin" : ""} size={14} />
          {actionLoading ? "Ending..." : "End selected"}
        </button>
      </div>

      {actionMessage.text && (
        <div className={`mb-4 rounded-md border p-2 text-xs font-medium ${
          actionMessage.type === "error" ? "bg-red-50 border-red-200 text-red-800" :
          actionMessage.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" :
          "bg-blue-50 border-blue-200 text-blue-800"
        }`}>
          {actionMessage.text}
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-6">
        <ProcessList 
          icon={Cpu} 
          list={processes} 
          title="Live Process Stream" 
          actionLoading={actionLoading}
          selectedProcesses={selectedProcesses}
          onToggle={onToggle}
        />
      </div>
    </section>
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
    timer = setInterval(fetchData, 5000); 

    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [device.id]);

  const displayedProcesses = processes.map((p) => ({
    pid: p.pid,
    name: p.name,
    user: p.user,
    cpu: p.cpu,
    memoryMb: p.memoryMb,
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

    const count = selectedProcesses.length;
    const confirmMsg = count === 1 
      ? "Are you sure you want to end this process?"
      : `Are you sure you want to end these ${count} processes?`;

    if (!window.confirm(confirmMsg)) return;

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
      <div className="py-8 text-center">
        <p className="text-sm font-medium text-slate-500">Connecting to agent for real-time data...</p>
      </div>
    );
  }

  return (
    <div className="grid items-stretch gap-4 xl:h-[48rem] xl:grid-cols-[1fr_1.2fr]">
      <ActivityMonitor 
        connections={connections}
        error={error}
        history={history}
      />
      <ProcessMonitor 
        actionLoading={actionLoading}
        actionMessage={actionMessage}
        onEnd={endSelectedProcesses}
        onToggle={toggleProcess}
        processes={displayedProcesses}
        selectedProcesses={selectedProcesses}
      />
    </div>
  );
}

function DeviceDetails({ device, hardware, metricHistory, loading, error }) {
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
      {loading ? (
        <p className="mb-4 rounded-md border border-blue-100 bg-white px-3 py-2 text-sm font-semibold text-slate-600">
          Loading normalized agent details...
        </p>
      ) : null}
      {error ? (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
          {error}
        </p>
      ) : null}

      <DetailViewSwitch activeView={activeView} onChange={setActiveView} />

      {activeView === "specification" ? (
        <div className="device-detail-view">
          <div className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 shadow-inner">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase text-slate-600">
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
          <h4 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase text-slate-600">
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
          <h4 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase text-slate-600">
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
          <h4 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase text-slate-600">
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
          <h4 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase text-slate-600">
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
          <h4 className="mb-3 text-sm font-bold uppercase text-slate-600">
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
          <h4 className="mb-3 text-sm font-bold uppercase text-slate-600">
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
          <h4 className="mb-3 text-sm font-bold uppercase text-slate-600">
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
          <h4 className="mb-3 text-sm font-bold uppercase text-slate-600">
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
          <h4 className="mb-3 text-sm font-bold uppercase text-slate-600">
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
        </div>
      ) : activeView === "networkActivity" ? (
        <div className="device-detail-view">
          <NetworkActivityDetails device={device} />
        </div>
      ) : (
        <div className="device-detail-view">
          <RemoteControlPanel device={device} />
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
}) {
  const [expandedId, setExpandedId] = useState(null);
  const [pendingArchive, setPendingArchive] = useState(null);
  const [detailCache, setDetailCache] = useState({});

  useEffect(() => {
    if (!expandedId || detailCache[expandedId]?.loaded || detailCache[expandedId]?.loading) {
      return;
    }

    let active = true;

    setDetailCache((current) => ({
      ...current,
      [expandedId]: {
        ...current[expandedId],
        loading: true,
        error: "",
      },
    }));

    Promise.all([
      clientApi.getClientHardware(expandedId),
      clientApi.getClientMetrics(expandedId, { range: "24h", limit: 1440 }),
    ])
      .then(([hardware, metricHistory]) => {
        if (!active) return;
        setDetailCache((current) => ({
          ...current,
          [expandedId]: {
            hardware,
            metricHistory,
            loading: false,
            loaded: true,
            error: "",
          },
        }));
      })
      .catch((error) => {
        if (!active) return;
        setDetailCache((current) => ({
          ...current,
          [expandedId]: {
            ...current[expandedId],
            loading: false,
            loaded: true,
            error: error.message || "Unable to load normalized agent details.",
          },
        }));
      });

    return () => {
      active = false;
    };
  }, [detailCache, expandedId]);

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
    } catch (error) {
      // The shared toast handles the visible error message.
    }
  }

  return (
    <>
      <ConfirmDialog
        device={pendingArchive}
        onCancel={() => setPendingArchive(null)}
        onConfirm={confirmArchive}
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-200/30 ring-1 ring-slate-100">
        <div className="hidden bg-slate-50/90 px-5 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-400 xl:grid xl:grid-cols-[48px_minmax(170px,1.1fr)_minmax(140px,0.8fr)_minmax(250px,1.35fr)_minmax(150px,0.7fr)_auto_auto] xl:items-center xl:gap-4">
          <div />
          <div>Device</div>
          <div>Network</div>
          <div>Metrics</div>
          <div>Group</div>
          <div>Status</div>
          <div className="text-right">Actions</div>
        </div>

        <div className="divide-y divide-slate-100">
          {devices.map((device) => {
            const metrics = device.metrics || {};
            const groupValue = device.group || "Unassigned";
            const expanded = expandedId === device.id;

            return (
              <article className={`bg-white transition ${expanded ? "bg-slate-50/30" : "hover:bg-slate-50/50"}`} key={device.id}>
                <div className="grid gap-4 px-4 py-5 text-sm text-slate-700 transition sm:px-5 lg:grid-cols-[48px_minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-x-5 lg:gap-y-4 xl:grid-cols-[48px_minmax(170px,1.1fr)_minmax(140px,0.8fr)_minmax(250px,1.35fr)_minmax(150px,0.7fr)_auto_auto] xl:gap-4">
                  <button
                    className={`grid h-10 w-10 place-items-center rounded-xl border shadow-sm transition-all duration-300 active:scale-95 ${
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
                    <ChevronDown size={17} strokeWidth={2.5} />
                  </button>

                  <div className="min-w-0">
                    <strong className="block break-words text-base font-bold text-slate-900 lg:text-sm">
                      {device.hostname}
                    </strong>
                    <span className="mt-1 block break-words text-xs leading-5 text-slate-500">
                      {device.os}
                    </span>
                  </div>

                  <div className="min-w-0 rounded-md bg-slate-50 p-3 xl:bg-transparent xl:p-0">
                    <span className="mb-1 block text-xs font-bold uppercase text-slate-400 xl:hidden">
                      Network
                    </span>
                    <span className="block break-words font-medium">{device.ip}</span>
                    <span className="mt-1 block break-words text-xs text-slate-500">
                      {device.mac}
                    </span>
                  </div>

                  <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:col-span-3 lg:grid-cols-4 xl:col-span-1 xl:grid-cols-2">
                    <MetricPill
                      icon={Cpu}
                      label="CPU"
                      value={formatPercent(metrics.cpu)}
                    />
                    <MetricPill
                      icon={MemoryStick}
                      label="RAM"
                      value={formatPercent(metrics.ram)}
                    />
                    <MetricPill
                      icon={HardDrive}
                      label="Disk"
                      value={formatPercent(metrics.disk)}
                    />
                    <MetricPill
                      icon={Timer}
                      label="Up"
                      value={formatUptimeVerbose(metrics.uptime)}
                    />
                  </div>

                  <div className="min-w-0 lg:col-start-2 xl:col-start-auto">
                    <span className="mb-1 block text-xs font-bold uppercase text-slate-400 xl:hidden">
                      Group
                    </span>
                    <select
                      className="h-10 w-full min-w-0 cursor-pointer rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none shadow-sm transition hover:border-slate-300 focus:border-slate-900 focus:ring-4 focus:ring-slate-100 lg:w-40"
                      onChange={async (event) => {
                        try {
                          await onUpdateGroup(device.id, event.target.value);
                        } catch (error) {
                          // The shared toast handles the visible error message.
                        }
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

                  <span
                    className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${
                      device.status === "online"
                        ? "border-emerald-100 bg-white text-emerald-600 shadow-sm"
                        : "border-rose-100 bg-white text-rose-600 shadow-sm"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${device.status === "online" ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                    {device.status}
                  </span>

                  <div className="group relative flex justify-start lg:justify-end">
                    <button
                      className="grid h-9 w-9 place-items-center rounded-xl border border-rose-100 bg-rose-50 text-rose-600 shadow-sm transition hover:border-rose-200 hover:bg-rose-100 active:scale-95"
                      onClick={() => setPendingArchive(device)}
                      title="Archive device"
                      type="button"
                    >
                      <Archive size={16} />
                    </button>
                    <span className="pointer-events-none absolute right-0 top-11 z-10 hidden w-44 rounded-md border border-line bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-lg group-hover:block">
                      Archive this device from the registered list
                    </span>
                  </div>
                </div>

                {expanded ? (
                  <DeviceDetails
                    device={device}
                    error={detailCache[device.id]?.error}
                    hardware={detailCache[device.id]?.hardware}
                    loading={detailCache[device.id]?.loading}
                    metricHistory={detailCache[device.id]?.metricHistory}
                  />
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </>
  );
}
