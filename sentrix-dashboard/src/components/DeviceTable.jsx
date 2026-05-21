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
import { useEffect, useState } from "react";
import { MetricPill } from "./MetricPill.jsx";
import { SentrixLogoLoader } from "./SentrixLogo.jsx";
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
    <div className="min-w-0 rounded-xl border border-slate-100 bg-white p-4 shadow-sm ring-1 ring-slate-100/50 transition-all hover:border-slate-200">
      <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-ui">{label}</dt>
      <dd className="mt-1.5 break-words text-sm font-bold text-slate-800 tracking-tight font-data">
        {value || "—"}
      </dd>
    </div>
  );
}

function ListItem({ title, detail }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-white px-4 py-3.5 shadow-sm ring-1 ring-slate-100/50 transition-colors hover:bg-slate-50/50">
      <p className="break-words text-sm font-bold text-slate-800 tracking-tight font-ui">
        {title || "—"}
      </p>
      {detail ? <p className="mt-1 text-xs font-medium text-slate-500 font-data truncate">{detail}</p> : null}
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
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-900 font-ui">Archive Terminal?</h3>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed font-data">
              Removing <strong className="text-slate-900">{device.hostname}</strong> from the active fleet will suspend telemetry processing. The node can be re-registered upon the next agent heartbeat.
            </p>
          </div>
          <button
            className="rounded-lg p-1.5 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-900"
            onClick={onCancel}
            type="button"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        <div className="mt-8 flex justify-end gap-3 font-ui">
          <button
            className="btn-minimal h-11 px-6 active:scale-95"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-11 rounded-xl bg-slate-900 px-6 text-sm font-bold text-white transition-all hover:bg-slate-800 active:scale-95 shadow-lg shadow-slate-900/10"
            onClick={onConfirm}
            type="button"
          >
            Confirm Archive
          </button>
        </div>
      </div>
    </div>
  );
}

function buildSampleNetworkActivity(device) {
  const hostname = device.hostname || "client-pc";
  const ip = device.ip || "192.168.1.24";

  return {
    activeDns: [
      {
        id: "dns-active-1",
        domain: "classroom.portal.local",
        url: "https://classroom.portal.local/dashboard",
        remoteAddress: "192.168.1.10",
        processName: "chrome.exe",
        openedAt: "Now",
        status: "Active",
      },
      {
        id: "dns-active-2",
        domain: "updates.microsoft.com",
        url: "https://updates.microsoft.com",
        remoteAddress: "20.53.203.50",
        processName: "svchost.exe",
        openedAt: "2 minutes ago",
        status: "Active",
      },
    ],
    dnsHistory: [
      {
        id: "dns-history-1",
        domain: "accounts.google.com",
        resolvedAddress: "142.250.190.45",
        processName: "chrome.exe",
        checkedAt: "8 minutes ago",
      },
      {
        id: "dns-history-2",
        domain: "cdn.jsdelivr.net",
        resolvedAddress: "151.101.1.229",
        processName: "msedge.exe",
        checkedAt: "14 minutes ago",
      },
      {
        id: "dns-history-3",
        domain: hostname.toLowerCase().replaceAll(" ", "-"),
        resolvedAddress: ip,
        processName: "sentrix-agent.exe",
        checkedAt: "21 minutes ago",
      },
    ],
    processes: [
      {
        id: "proc-1",
        pid: 4820,
        name: "chrome.exe",
        user: "Student",
        cpu: 7,
        memoryMb: 420,
        network: "1.8 MB/s",
        status: "Running",
      },
      {
        id: "proc-2",
        pid: 1196,
        name: "sentrix-agent.exe",
        user: "SYSTEM",
        cpu: 2,
        memoryMb: 96,
        network: "220 KB/s",
        status: "Running",
      },
      {
        id: "proc-3",
        pid: 764,
        name: "svchost.exe",
        user: "SYSTEM",
        cpu: 1,
        memoryMb: 138,
        network: "80 KB/s",
        status: "Running",
      },
      {
        id: "proc-4",
        pid: 3328,
        name: "msedge.exe",
        user: "Student",
        cpu: 4,
        memoryMb: 310,
        network: "640 KB/s",
        status: "Running",
      },
    ],
  };
}

function DetailViewSwitch({ activeView, onChange }) {
  const buttons = [
    { id: "specification", label: "Inventory", icon: Monitor },
    { id: "networkActivity", label: "Network Log", icon: RadioTower },
    { id: "remoteControl", label: "Remote Access", icon: Terminal },
  ];

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      {buttons.map((button) => {
        const Icon = button.icon;
        const selected = activeView === button.id;

        return (
          <button
            className={`btn-minimal h-10 px-5 transition-all ${
              selected
                ? "bg-slate-900 border-slate-900 text-white shadow-md shadow-slate-900/10 hover:bg-slate-800"
                : "bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            }`}
            key={button.id}
            onClick={() => onChange(button.id)}
            type="button"
          >
            <Icon size={15} strokeWidth={2.5} />
            <span className="text-xs font-bold uppercase tracking-wider font-ui">{button.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function RemoteControlPanel({ device }) {
  const [commandStatus, setCommandStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const powerActions = [
    { id: "shutdown", label: "Shutdown", icon: Power, hoverTone: "group-hover:text-red-500", description: "Terminate session and power off" },
    { id: "restart", label: "Restart", icon: RotateCw, hoverTone: "group-hover:text-amber-500", description: "Warm reboot of the remote system" },
    { id: "sleep", label: "Sleep", icon: Moon, hoverTone: "group-hover:text-blue-500", description: "Low power suspension mode" },
    { id: "lock", label: "Lock", icon: Lock, hoverTone: "group-hover:text-slate-900", description: "Secure current user environment" },
    { id: "update", label: "Update", icon: ArrowUpCircle, hoverTone: "group-hover:text-emerald-500", description: "Deploy system-level patches" },
  ];

  async function handleCommand(command) {
    setLoading(true);
    setCommandStatus(`Executing ${command}...`);
    try {
      await clientApi.sendDeviceCommand(device.id, command);
      setCommandStatus(`${command.charAt(0).toUpperCase() + command.slice(1)} Success`);
    } catch (err) {
      setCommandStatus(`Error: ${err.message}`);
    } finally {
      setLoading(false);
      setTimeout(() => setCommandStatus(""), 4000);
    }
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 shadow-inner font-ui">
        <h4 className="mb-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          <Power size={14} strokeWidth={3} />
          Terminal Execution Control
        </h4>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
          {powerActions.map((action) => {
            const Icon = action.icon;
            return (
              <div className="group relative" key={action.id}>
                <button
                  className="flex h-20 w-full flex-col items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md hover:border-slate-300 active:bg-slate-900 active:text-white active:border-slate-900 disabled:opacity-50 disabled:translate-y-0"
                  disabled={loading}
                  onClick={() => handleCommand(action.id)}
                  type="button"
                >
                  <Icon size={20} strokeWidth={2.5} className={`text-slate-400 transition-colors duration-300 icon-gradual ${action.hoverTone} group-active:text-white`} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">{action.label}</span>
                </button>
                <div className="pointer-events-none absolute bottom-full left-1/2 mb-3 hidden w-48 -translate-x-1/2 rounded-lg bg-slate-900 px-3.5 py-2.5 text-center text-[11px] font-medium text-white shadow-2xl group-hover:block z-20 leading-relaxed font-data">
                  {action.description}
                  <div className="absolute top-full left-1/2 -ml-1.5 border-[6px] border-transparent border-t-slate-900" />
                </div>
              </div>
            );
          })}
        </div>
        {commandStatus && (
          <div className="mt-6 flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-[11px] font-bold text-slate-700 shadow-sm animate-in fade-in slide-in-from-top-1 font-data">
             <div className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse" />
             <span className="uppercase">{commandStatus}</span>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 shadow-inner">
        <h4 className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 font-ui">
          <Terminal size={14} strokeWidth={3} />
          Operator Guidance
        </h4>
        <div className="rounded-xl bg-white p-5 text-sm leading-relaxed text-slate-600 shadow-sm border border-slate-100 font-data">
          <p className="font-medium tracking-tight">
            Remote power operations are executed through the validated Sentrix Agent kernel extension. Administrative elevation is maintained via active session tokens.
          </p>
        </div>
      </section>
    </div>
  );
}

function NetworkActivityDetails({ device }) {
  const metrics = device.metrics || {};
  const [selectedProcesses, setSelectedProcesses] = useState([]);
  const [endedProcesses, setEndedProcesses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const activity = buildSampleNetworkActivity(device);

  const hasRealData = Array.isArray(metrics.processes) && metrics.processes.length > 0;

  const activity = hasRealData ? {
    activeDns: (metrics.networkActivity?.activeConnections || []).map((conn, idx) => ({
      id: `dns-active-${idx}`,
      domain: conn.domain || "Direct IP",
      url: conn.domain ? `https://${conn.domain}` : `http://${conn.peerAddress}`,
      remoteAddress: conn.peerAddress,
      processName: conn.process || "Unknown",
      openedAt: "Active",
      status: conn.state === "LISTEN" ? "Listening" : "Active",
    })).slice(0, 15),
    dnsHistory: (metrics.networkActivity?.dnsCache || []).map((dns, idx) => ({
      id: `dns-history-${idx}`,
      domain: dns.domain,
      resolvedAddress: dns.resolvedAddress,
      processName: "DNS Cache",
      checkedAt: "Recent",
    })).slice(0, 30),
    processes: (metrics.processes || []).map((p, idx) => ({
      id: `proc-${idx}`,
      pid: p.pid,
      name: p.name,
      user: p.user,
      cpu: p.cpu,
      memoryMb: p.memoryMb,
      network: "...",
      status: p.state.charAt(0).toUpperCase() + p.state.slice(1),
    })),
  } : buildSampleNetworkActivity(device);

  const processes = activity.processes.map((process) => ({
    ...process,
    status: endedProcesses.includes(process.id) ? "Ended" : process.status,
  }));

  function toggleProcess(processId) {
    setSelectedProcesses((current) =>
      current.includes(processId)
        ? current.filter((id) => id !== processId)
        : [...current, processId],
    );
  }

  async function endSelectedProcesses() {
    setLoading(true);
    setError("");
    try {
      const pids = activity.processes
        .filter((p) => selectedProcesses.includes(p.id))
        .map((p) => p.pid);
      
      await Promise.all(pids.map(pid => clientApi.sendDeviceCommand(device.id, "kill_process", { pid })));

      setEndedProcesses((current) => [
        ...new Set([...current, ...selectedProcesses]),
      ]);
      setSelectedProcesses([]);
    } catch (err) {
      setError(`Failed to end processes: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr] font-data">
      <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 shadow-inner">
        <h4 className="mb-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 font-ui">
          <Globe2 size={14} strokeWidth={3} />
          Network Ingress Audit
        </h4>

        <div className="grid gap-5">
          <div>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 font-ui">
              Active TCP/UDP Streams
            </p>
            <div className="grid gap-3">
              {activity.activeDns.map((item) => (
                <div
                  className="rounded-xl bg-white p-4 shadow-sm border border-slate-100 hover:border-slate-300 transition-all"
                  key={item.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="break-words text-sm font-bold text-slate-900 tracking-tight">
                      {item.domain}
                    </p>
                    <span className="badge-minimal bg-emerald-50 text-emerald-700 border-emerald-100">
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-2 break-words text-xs leading-5 text-slate-500 font-medium">
                    {item.url}
                  </p>
                  <p className="mt-1 text-[11px] font-bold text-slate-400 uppercase tracking-tighter">
                    {item.remoteAddress} • {item.processName} • {item.openedAt}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 font-ui">
              Historic DNS Resolution
            </p>
            <div className="grid max-h-64 gap-2.5 overflow-auto custom-scrollbar pr-1">
              {activity.dnsHistory.map((item) => (
                <ListItem
                  detail={`${item.resolvedAddress} • ${item.processName} • ${item.checkedAt}`}
                  key={item.id}
                  title={item.domain}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 shadow-inner">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h4 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 font-ui">
            <CircleStop size={14} strokeWidth={3} />
            Live Process Audit
          </h4>
          <div className="flex items-center gap-3">
            {error && <span className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">{error}</span>}
            <button
              className="btn-minimal-primary h-9 px-4 text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-rose-900/10 active:scale-95 disabled:opacity-30 disabled:bg-slate-200 disabled:text-slate-500"
              disabled={selectedProcesses.length === 0 || loading}
              onClick={endSelectedProcesses}
              type="button"
            >
              {loading ? "Syncing..." : "Terminate selected"}
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100">
          <div className="hidden grid-cols-[44px_1fr_80px_80px_100px_90px] gap-4 bg-slate-50 border-b border-slate-200 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 lg:grid font-ui">
            <div />
            <div>Node Task</div>
            <div>CPU</div>
            <div>MEM</div>
            <div>Net</div>
            <div className="text-right">Sync</div>
          </div>

          <div className="divide-y divide-slate-100">
            {processes.map((process) => {
              const ended = process.status === "Ended";

              return (
                <label
                  className={`grid gap-4 px-4 py-4 text-sm transition lg:grid-cols-[44px_1fr_80px_80px_100px_90px] lg:items-center ${
                    ended ? "bg-slate-50/50 grayscale opacity-50" : "text-slate-700 hover:bg-slate-50/50 cursor-pointer"
                  }`}
                  key={process.id}
                >
                  <div className="flex justify-center">
                    <input
                      checked={selectedProcesses.includes(process.id)}
                      className="h-4 w-4 rounded-md border-slate-300 text-slate-900 focus:ring-slate-900 transition-all cursor-pointer"
                      disabled={ended}
                      onChange={() => toggleProcess(process.id)}
                      type="checkbox"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 tracking-tight truncate">{process.name}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter pt-0.5">
                      PID {process.pid} • {process.user}
                    </p>
                  </div>
                  <span className="font-bold tabular-nums text-slate-600">{process.cpu}%</span>
                  <span className="font-bold tabular-nums text-slate-600">{process.memoryMb}MB</span>
                  <span className="font-bold tabular-nums text-slate-500">{process.network}</span>
                  <div className="flex justify-end">
                    <span
                      className={`badge-minimal px-2 py-0.5 font-bold ${
                        ended
                          ? "bg-slate-100 text-slate-400 border-slate-200"
                          : "bg-emerald-50 text-emerald-700 border-emerald-100"
                      }`}
                    >
                      {process.status}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </section>
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
    <div className="border-t border-slate-200 bg-slate-50/30 px-6 py-8 sm:px-8">
      {loading ? (
        <div className="mb-6 rounded-xl border border-blue-100 bg-white p-4 text-center shadow-sm">
           <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 animate-pulse">Synchronizing Kernel Registry...</p>
        </div>
      ) : null}
      {error ? (
        <div className="mb-6 rounded-xl border border-rose-100 bg-rose-50/50 p-4 text-center shadow-sm">
           <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-rose-700">{error}</p>
        </div>
      ) : null}

      <DetailViewSwitch activeView={activeView} onChange={setActiveView} />

      {activeView === "specification" ? (
        <div className="device-detail-view font-data">
          <div className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 shadow-inner">
          <h4 className="mb-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 font-ui">
            <Monitor size={14} strokeWidth={3} />
            Terminal Identity
          </h4>
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <DetailItem label="Hostname" value={device.hostname} />
            <DetailItem label="Environment" value={device.os} />
            <DetailItem label="IPV4 Address" value={device.ip} />
            <DetailItem label="MAC Identifier" value={device.mac} />
            <DetailItem label="Cluster" value={device.group} />
            <DetailItem label="Active Session" value={formatUptimeVerbose(metrics.uptime)} />
            <DetailItem label="Kernel Platform" value={sampleSystem.os?.platform} />
          </dl>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 shadow-inner">
          <h4 className="mb-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 font-ui">
            <Cpu size={14} strokeWidth={3} />
            Hardware Profile
          </h4>
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <DetailItem label="Manufacturer" value={specs.manufacturer} />
            <DetailItem label="Board Model" value={specs.model} />
            <DetailItem label="Processor" value={specs.cpu} />
            <DetailItem
              label="Logical Cores"
              value={`${specs.cpuCores || 0} / ${specs.cpuThreads || 0}`}
            />
            <DetailItem
              label="Physical Memory"
              value={`${specs.totalMemoryGb || 0} GB`}
            />
            <DetailItem label="Firmware/BIOS" value={specs.bios} />
          </dl>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 shadow-inner">
          <h4 className="mb-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 font-ui">
            <Usb size={14} strokeWidth={3} />
            Peripheral Registry
          </h4>
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <DetailItem label="Pointing Device" value={formatBool(peripherals.mouse)} />
            <DetailItem
              label="Input Matrix"
              value={formatBool(peripherals.keyboard)}
            />
            <DetailItem
              label="Wireless Vector"
              value={formatBool(peripherals.wifiDongle)}
            />
            <DetailItem
              label="Radio Vector"
              value={formatBool(peripherals.bluetoothDongle)}
            />
            <DetailItem label="Imaging Unit" value={formatBool(peripherals.webcam)} />
            <DetailItem
              label="Block Storage"
              value={formatBool(peripherals.storage)}
            />
          </dl>
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 shadow-inner">
          <h4 className="mb-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 font-ui">
            <Thermometer size={14} strokeWidth={3} />
            Thermal Status
          </h4>
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <DetailItem
              label="CPU Thermal State"
              value={formatTemperature(sampleTemperature.cpu?.temperatureCelsius)}
            />
            <DetailItem
              label="GPU Thermal State"
              value={formatTemperature(sampleTemperature.gpu?.temperatureCelsius)}
            />
            <DetailItem label="Integrated GPU" value={sampleTemperature.gpu?.model} />
          </dl>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 shadow-inner">
          <h4 className="mb-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 font-ui">
            <Network size={14} strokeWidth={3} />
            Network Performance
          </h4>
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <DetailItem label="Active Interface" value={sampleNetwork.interface} />
            <DetailItem label="Inbound Delta" value={formatBytesPerSecond(sampleNetwork.uploadBytesPerSec)} />
            <DetailItem label="Outbound Delta" value={formatBytesPerSecond(sampleNetwork.downloadBytesPerSec)} />
            <DetailItem
              label="Latency (MS)"
              value={sampleNetwork.latencyMs == null ? "—" : `${Math.round(Number(sampleNetwork.latencyMs))} ms`}
            />
            <DetailItem label="Signal Integrity" value={formatPercent(sampleNetwork.packetLoss)} />
          </dl>
        </section>

      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 shadow-inner">
          <h4 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 font-ui">
            Video Adapters
          </h4>
          <div className="grid gap-2.5">
            {graphicsCards.length ? (
              graphicsCards.map((gpu, index) => (
                <ListItem
                  detail={`${gpu.vendor || "Unknown"} • ${gpu.vram ? `${gpu.vram} MB VRAM` : "Integrated"}`}
                  key={index}
                  title={gpu.model}
                />
              ))
            ) : (
              <div className="p-4 text-center rounded-lg border border-dashed border-slate-200 text-[10px] font-bold uppercase tracking-widest text-slate-300">Null Output</div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 shadow-inner">
          <h4 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 font-ui">
            Storage Clusters
          </h4>
          <div className="grid gap-2.5">
            {disks.length ? (
              disks.map((disk, index) => (
                <ListItem
                  detail={`${disk.type || "Fixed"} • ${disk.sizeGb || 0} GB`}
                  key={index}
                  title={disk.name}
                />
              ))
            ) : (
              <div className="p-4 text-center rounded-lg border border-dashed border-slate-200 text-[10px] font-bold uppercase tracking-widest text-slate-300">Null Output</div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 shadow-inner">
          <h4 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 font-ui">
            External Bus Devices
          </h4>
          <div className="grid max-h-64 gap-2.5 overflow-auto custom-scrollbar pr-1">
            {usbDevices.length ? (
              usbDevices.map((device, index) => (
                <ListItem
                  detail={`${device.type || "Logic"} • ${device.vendor || "Standard"}`}
                  key={index}
                  title={device.name}
                />
              ))
            ) : (
              <div className="p-4 text-center rounded-lg border border-dashed border-slate-200 text-[10px] font-bold uppercase tracking-widest text-slate-300">Null Output</div>
            )}
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 shadow-inner">
          <h4 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 font-ui">
            Adapter Stack
          </h4>
          <div className="grid max-h-64 gap-2.5 overflow-auto custom-scrollbar pr-1">
            {networkAdapters.length ? (
              networkAdapters.map((adapter, index) => (
                <ListItem
                  detail={`${adapter.type || "Ethernet"} • ${adapter.mac || "—"} • ${adapter.ip4 || "—"}`}
                  key={index}
                  title={adapter.name}
                />
              ))
            ) : (
              <div className="p-4 text-center rounded-lg border border-dashed border-slate-200 text-[10px] font-bold uppercase tracking-widest text-slate-300">Null Output</div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 shadow-inner">
          <h4 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 font-ui">
            Display Output
          </h4>
          <div className="grid max-h-64 gap-2.5 overflow-auto custom-scrollbar pr-1">
            {displays.length ? (
              displays.map((display, index) => (
                <ListItem
                  detail={display.resolution || "Logic Output"}
                  key={index}
                  title={display.model}
                />
              ))
            ) : (
              <div className="p-4 text-center rounded-lg border border-dashed border-slate-200 text-[10px] font-bold uppercase tracking-widest text-slate-300">Null Output</div>
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
      <div className="rounded-2xl border border-slate-200 bg-white p-20 text-center shadow-sm">
        <div className="flex flex-col items-center gap-5">
          <div className="text-slate-900">
            <SentrixLogoLoader />
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.25em]">Synchronizing Fleet Registry...</p>
        </div>
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-20 text-center">
        <div className="flex flex-col items-center gap-4">
          <Monitor className="text-slate-200" size={48} strokeWidth={1.5} />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">No Terminals Registered</p>
        </div>
      </div>
    );
  }

  async function confirmArchive() {
    if (!pendingArchive) return;
    await onArchive?.(pendingArchive.id);
    setExpandedId((current) =>
      current === pendingArchive.id ? null : current,
    );
    setPendingArchive(null);
  }

  return (
    <>
      <ConfirmDialog
        device={pendingArchive}
        onCancel={() => setPendingArchive(null)}
        onConfirm={confirmArchive}
      />

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/40 ring-1 ring-slate-100 animate-in fade-in slide-in-from-bottom-3 duration-700">
        <div className="hidden bg-slate-50/80 px-8 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-400 lg:grid lg:grid-cols-[60px_minmax(180px,1.25fr)_minmax(140px,0.85fr)_minmax(280px,1.4fr)_minmax(150px,0.7fr)_100px_80px] lg:items-center lg:gap-8 border-b border-slate-200 font-ui">
          <div className="text-center opacity-50">#</div>
          <div>Node Terminal</div>
          <div>Network Stack</div>
          <div>Metrics</div>
          <div>Cluster Group</div>
          <div className="text-center">Status</div>
          <div className="text-right">Manage</div>
        </div>

        <div className="divide-y divide-slate-100">
          {devices.map((device) => {
            const metrics = device.metrics || {};
            const groupValue = device.group || "Unassigned";
            const expanded = expandedId === device.id;

            return (
              <article className={`bg-white transition-all duration-300 ${expanded ? 'bg-slate-50/30' : 'hover:bg-slate-50/50'}`} key={device.id}>
                <div className="grid gap-6 px-6 py-7 text-sm text-slate-700 lg:grid-cols-[60px_minmax(180px,1.25fr)_minmax(140px,0.85fr)_minmax(280px,1.4fr)_minmax(150px,0.7fr)_100px_80px] lg:items-center lg:gap-8">
                  <div className="flex justify-center">
                    <button
                      className={`grid h-11 w-11 place-items-center rounded-xl transition-all duration-500 active:scale-90 ${expanded ? 'bg-slate-900 text-white shadow-2xl shadow-slate-900/30 rotate-180' : 'bg-white border border-slate-200 text-slate-400 hover:border-slate-400 hover:text-slate-900 shadow-sm'}`}
                      onClick={() =>
                        setExpandedId(expanded ? null : device.id)
                      }
                      title={expanded ? "Collapse" : "Audit Node"}
                      type="button"
                    >
                      <ChevronDown
                        size={20}
                        strokeWidth={2.5}
                      />
                    </button>
                  </div>

                  <div className="min-w-0 font-ui">
                    <strong className="block break-words text-[15px] font-bold text-slate-900 tracking-tight leading-none">
                      {device.hostname}
                    </strong>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="badge-minimal px-1.5 py-0 border-slate-100 text-[8px] tracking-tight">{device.os?.split(' ')[0]}</span>
                      <span className="block break-words text-[11px] font-bold text-slate-400 truncate">
                        {device.os}
                      </span>
                    </div>
                  </div>

                  <div className="min-w-0 font-data">
                    <span className="mb-2 block text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400 lg:hidden font-ui">
                      Network Stack
                    </span>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-1 w-1 rounded-full bg-slate-300" />
                        <span className="block break-words font-bold text-slate-700 tabular-nums text-sm">{device.ip}</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <div className="h-1 w-1 rounded-full bg-slate-100" />
                        <span className="block break-words text-[11px] font-medium text-slate-400 tabular-nums">
                          {device.mac}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
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
                      label="DSK"
                      value={formatPercent(metrics.disk)}
                    />
                    <MetricPill
                      icon={Timer}
                      label="UP"
                      value={formatUptimeVerbose(metrics.uptime)}
                    />
                  </div>

                  <div className="min-w-0 font-ui">
                    <span className="mb-2 block text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400 lg:hidden">
                      Cluster Group
                    </span>
                    <select
                      className="h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600 outline-none transition-all focus:border-slate-900 focus:ring-4 focus:ring-slate-100 lg:w-40 shadow-sm cursor-pointer"
                      onChange={(event) =>
                        onUpdateGroup(device.id, event.target.value)
                      }
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

                  <div className="flex justify-center">
                    <span
                      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[9px] font-bold uppercase tracking-[0.2em] border transition-all ${
                        device.status === "online"
                          ? "bg-white text-emerald-600 border-emerald-100 shadow-sm"
                          : "bg-white text-rose-600 border-rose-100 shadow-sm"
                      }`}
                    >
                      <div className={`h-1.5 w-1.5 rounded-full ${device.status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                      {device.status}
                    </span>
                  </div>

                  <div className="group relative flex justify-start lg:justify-end">
                    <button
                      className="btn-minimal-rose h-10 w-10 p-0 rounded-xl shadow-sm hover:shadow-lg active:scale-90"
                      onClick={() => setPendingArchive(device)}
                      title="Archive Terminal"
                      type="button"
                    >
                      <Archive size={18} strokeWidth={2} />
                    </button>
                    <div className="pointer-events-none absolute right-0 top-full mt-3 z-30 hidden w-48 rounded-xl bg-slate-900 px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-widest text-white shadow-2xl group-hover:block transition-all animate-in zoom-in-95 origin-top-right">
                      Revoke Terminal Access
                      <div className="absolute bottom-full right-4 border-[6px] border-transparent border-b-slate-900" />
                    </div>
                  </div>
                </div>

                {expanded ? (
                  <div className="animate-in slide-in-from-top-3 duration-500 ease-out">
                    <DeviceDetails
                      device={device}
                      error={detailCache[device.id]?.error}
                      hardware={detailCache[device.id]?.hardware}
                      loading={detailCache[device.id]?.loading}
                      metricHistory={detailCache[device.id]?.metricHistory}
                    />
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </>
  );
}
