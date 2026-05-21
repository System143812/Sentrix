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
    <div className="min-w-0 rounded-md bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-200/70">
      <dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium leading-5 text-slate-800">
        {value || "Unknown"}
      </dd>
    </div>
  );
}

function ListItem({ title, detail }) {
  return (
    <div className="min-w-0 rounded-md bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-200/70">
      <p className="break-words text-sm font-semibold text-slate-800">
        {title || "Unknown"}
      </p>
      {detail ? <p className="text-xs leading-5 text-slate-500">{detail}</p> : null}
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4">
      <div className="w-full max-w-md rounded-lg border border-line bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold">Archive device?</h3>
            <p className="mt-2 text-sm text-slate-500">
              This removes {device.hostname} from the registered device list.
              The device can appear again when its agent reconnects.
            </p>
          </div>
          <button
            className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-ink"
            onClick={onCancel}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            className="h-10 rounded-md border border-line bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-10 rounded-md bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700"
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
    { id: "specification", label: "Specification", icon: Monitor },
    { id: "networkActivity", label: "Network Activity", icon: RadioTower },
    { id: "remoteControl", label: "Remote Control", icon: Terminal },
  ];

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {buttons.map((button) => {
        const Icon = button.icon;
        const selected = activeView === button.id;

        return (
          <button
            className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition ${
              selected
                ? "border-signal bg-blue-50 text-signal shadow-sm"
                : "border-line bg-white text-slate-600 hover:border-signal hover:text-signal"
            }`}
            key={button.id}
            onClick={() => onChange(button.id)}
            type="button"
          >
            <Icon size={16} />
            {button.label}
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
    { id: "shutdown", label: "Shutdown", icon: Power, tone: "rose", description: "Power off the remote PC immediately" },
    { id: "restart", label: "Restart", icon: RotateCw, tone: "amber", description: "Reboot the remote PC" },
    { id: "sleep", label: "Sleep", icon: Moon, tone: "blue", description: "Put the remote PC into sleep mode" },
    { id: "lock", label: "Lock", icon: Lock, tone: "slate", description: "Lock the current user session" },
    { id: "update", label: "Update", icon: ArrowUpCircle, tone: "emerald", description: "Check and install system updates" },
  ];

  async function handleCommand(command) {
    setLoading(true);
    setCommandStatus(`Sending ${command} command...`);
    try {
      await clientApi.sendDeviceCommand(device.id, command);
      setCommandStatus(`${command.charAt(0).toUpperCase() + command.slice(1)} command sent successfully.`);
    } catch (err) {
      setCommandStatus(`Failed to send ${command} command: ${err.message}`);
    } finally {
      setLoading(false);
      setTimeout(() => setCommandStatus(""), 5000);
    }
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-lg border border-line bg-slate-100/80 p-4">
        <h4 className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          <Power size={14} className="text-slate-400" />
          Remote Power Management
        </h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {powerActions.map((action) => {
            const Icon = action.icon;
            const toneStyles = {
              rose: "border-red-100 bg-white text-red-600 hover:bg-red-50 hover:border-red-200",
              amber: "border-amber-100 bg-white text-amber-600 hover:bg-amber-50 hover:border-amber-200",
              blue: "border-blue-100 bg-white text-blue-600 hover:bg-blue-50 hover:border-blue-200",
              slate: "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300",
              emerald: "border-emerald-100 bg-white text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200",
            };

            return (
              <div className="group relative" key={action.id}>
                <button
                  className={`flex h-20 w-full flex-col items-center justify-center gap-2 rounded-xl border shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:translate-y-0 ${toneStyles[action.tone]}`}
                  disabled={loading}
                  onClick={() => handleCommand(action.id)}
                  type="button"
                >
                  <Icon size={20} strokeWidth={2.5} />
                  <span className="text-[10px] font-bold uppercase tracking-tight">{action.label}</span>
                </button>
                <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden w-48 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-center text-[11px] font-medium text-white shadow-xl group-hover:block z-20">
                  {action.description}
                  <div className="absolute top-full left-1/2 -ml-1 border-4 border-transparent border-t-slate-900" />
                </div>
              </div>
            );
          })}
        </div>
        {commandStatus && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2 text-[11px] font-semibold text-blue-700 animate-in fade-in slide-in-from-top-1">
            <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
            {commandStatus}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-line bg-slate-100/80 p-4">
        <h4 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase text-slate-600">
          <Terminal size={15} />
          Remote Management Notes
        </h4>
        <div className="rounded-md bg-white p-4 text-sm leading-6 text-slate-600 shadow-sm ring-1 ring-slate-200/70">
          <p>
            Power commands are sent via the Sentrix Agent service. Ensure the agent is running with administrative privileges for all actions to succeed. 
            The <strong>Update</strong> command will trigger the OS-native update mechanism.
          </p>
        </div>
      </section>
    </div>
  );
}

function NetworkActivityDetails({ device }) {
  const [selectedProcesses, setSelectedProcesses] = useState([]);
  const [endedProcesses, setEndedProcesses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const activity = buildSampleNetworkActivity(device);
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
    <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
      <section className="rounded-lg border border-line bg-slate-100/80 p-4">
        <h4 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase text-slate-600">
          <Globe2 size={15} />
          DNS Logging
        </h4>

        <div className="grid gap-3">
          <div>
            <p className="mb-2 text-xs font-bold uppercase text-slate-500">
              Active URLs and DNS
            </p>
            <div className="grid gap-2">
              {activity.activeDns.map((item) => (
                <div
                  className="rounded-md bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-200/70"
                  key={item.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="break-words text-sm font-semibold text-slate-800">
                      {item.domain}
                    </p>
                    <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-xs leading-5 text-slate-500">
                    {item.url}
                  </p>
                  <p className="text-xs leading-5 text-slate-500">
                    {item.remoteAddress} - {item.processName} - {item.openedAt}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase text-slate-500">
              DNS History
            </p>
            <div className="grid max-h-64 gap-2 overflow-auto pr-1">
              {activity.dnsHistory.map((item) => (
                <ListItem
                  detail={`${item.resolvedAddress} - ${item.processName} - ${item.checkedAt}`}
                  key={item.id}
                  title={item.domain}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-slate-100/80 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h4 className="flex items-center gap-2 text-sm font-bold uppercase text-slate-600">
            <CircleStop size={15} />
            Process Monitoring
          </h4>
          <div className="flex items-center gap-2">
            {error && <span className="text-xs font-medium text-red-600">{error}</span>}
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={selectedProcesses.length === 0 || loading}
              onClick={endSelectedProcesses}
              type="button"
            >
              <CircleStop size={15} />
              {loading ? "Ending..." : "End selected"}
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-line bg-white">
          <div className="hidden grid-cols-[44px_1fr_80px_80px_100px_90px] gap-3 bg-slate-100 px-3 py-2 text-xs font-bold uppercase text-slate-500 lg:grid">
            <div />
            <div>Process</div>
            <div>CPU</div>
            <div>Memory</div>
            <div>Network</div>
            <div>Status</div>
          </div>

          <div className="divide-y divide-line">
            {processes.map((process) => {
              const ended = process.status === "Ended";

              return (
                <label
                  className={`grid gap-2 px-3 py-3 text-sm transition lg:grid-cols-[44px_1fr_80px_80px_100px_90px] lg:items-center lg:gap-3 ${
                    ended ? "bg-slate-50 text-slate-400" : "text-slate-700 hover:bg-slate-50"
                  }`}
                  key={process.id}
                >
                  <input
                    checked={selectedProcesses.includes(process.id)}
                    className="h-4 w-4 rounded border-line text-signal focus:ring-signal"
                    disabled={ended}
                    onChange={() => toggleProcess(process.id)}
                    type="checkbox"
                  />
                  <div className="min-w-0">
                    <p className="break-words font-semibold">{process.name}</p>
                    <p className="text-xs text-slate-500">
                      PID {process.pid} - {process.user}
                    </p>
                  </div>
                  <span>{process.cpu}%</span>
                  <span>{process.memoryMb} MB</span>
                  <span>{process.network}</span>
                  <span
                    className={`w-fit rounded-md px-2 py-1 text-xs font-bold ${
                      ended
                        ? "bg-slate-100 text-slate-500"
                        : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {process.status}
                  </span>
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
        <section className="rounded-lg border border-line bg-slate-100/80 p-4">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase text-slate-600">
            <Monitor size={15} />
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

        <section className="rounded-lg border border-line bg-slate-100/80 p-4">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase text-slate-600">
            <Cpu size={15} />
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

        <section className="rounded-lg border border-line bg-slate-100/80 p-4">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase text-slate-600">
            <Usb size={15} />
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
        <section className="rounded-lg border border-line bg-slate-100/80 p-4">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase text-slate-600">
            <Thermometer size={15} />
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

        <section className="rounded-lg border border-line bg-slate-100/80 p-4">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase text-slate-600">
            <Network size={15} />
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
        <section className="rounded-lg border border-line bg-slate-100/80 p-4">
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

        <section className="rounded-lg border border-line bg-slate-100/80 p-4">
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

        <section className="rounded-lg border border-line bg-slate-100/80 p-4">
          <h4 className="mb-3 text-sm font-bold uppercase text-slate-600">
            USB Devices
          </h4>
          <div className="grid max-h-56 gap-2 overflow-auto pr-1">
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
        <section className="rounded-lg border border-line bg-slate-100/80 p-4">
          <h4 className="mb-3 text-sm font-bold uppercase text-slate-600">
            Network Adapters
          </h4>
          <div className="grid max-h-56 gap-2 overflow-auto pr-1">
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

        <section className="rounded-lg border border-line bg-slate-100/80 p-4">
          <h4 className="mb-3 text-sm font-bold uppercase text-slate-600">
            Displays
          </h4>
          <div className="grid max-h-56 gap-2 overflow-auto pr-1">
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
      <div className="rounded-xl border border-line bg-white p-12 text-center shadow-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="text-signal">
            <SentrixLogoLoader />
          </div>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Synchronizing Fleet Data...</p>
        </div>
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-12 text-center">
        <div className="flex flex-col items-center gap-2">
          <Monitor className="text-slate-300" size={32} />
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No devices registered in this view</p>
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

      <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm ring-1 ring-slate-200/50 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="hidden bg-slate-50/80 px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 lg:grid lg:grid-cols-[60px_minmax(180px,1.25fr)_minmax(140px,0.85fr)_minmax(280px,1.4fr)_minmax(150px,0.7fr)_100px_80px] lg:items-center lg:gap-6 border-b border-line/60">
          <div className="text-center">Expand</div>
          <div>Device Terminal</div>
          <div>Network Info</div>
          <div>Live Metrics</div>
          <div>Group Policy</div>
          <div className="text-center">Status</div>
          <div className="text-right">Manage</div>
        </div>

        <div className="divide-y divide-line/60">
          {devices.map((device) => {
            const metrics = device.metrics || {};
            const groupValue = device.group || "Unassigned";
            const expanded = expandedId === device.id;

            return (
              <article className={`bg-white transition-colors duration-200 ${expanded ? 'bg-slate-50/30' : 'hover:bg-slate-50/50'}`} key={device.id}>
                <div className="grid gap-4 px-4 py-6 text-sm text-slate-700 lg:grid-cols-[60px_minmax(180px,1.25fr)_minmax(140px,0.85fr)_minmax(280px,1.4fr)_minmax(150px,0.7fr)_100px_80px] lg:items-center lg:gap-6">
                  <div className="flex justify-center">
                    <button
                      className={`grid h-10 w-10 place-items-center rounded-xl border transition-all duration-300 ${expanded ? 'bg-slate-900 border-slate-900 text-white shadow-lg' : 'bg-white border-line text-slate-500 hover:border-signal hover:text-signal shadow-sm'}`}
                      onClick={() =>
                        setExpandedId(expanded ? null : device.id)
                      }
                      title={expanded ? "Collapse details" : "Expand details"}
                      type="button"
                    >
                      <ChevronDown
                        className={`transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
                        size={18}
                        strokeWidth={2.5}
                      />
                    </button>
                  </div>

                  <div className="min-w-0">
                    <strong className="block break-words text-base font-bold text-slate-950 lg:text-[15px] tracking-tight">
                      {device.hostname}
                    </strong>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-slate-100 text-[9px] font-bold text-slate-500 uppercase">OS</span>
                      <span className="block break-words text-xs font-medium text-slate-500">
                        {device.os}
                      </span>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400 lg:hidden">
                      Network
                    </span>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-1 rounded-full bg-slate-300" />
                        <span className="block break-words font-bold text-slate-700 tabular-nums">{device.ip}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-1 rounded-full bg-slate-200" />
                        <span className="block break-words text-[11px] font-medium text-slate-400 tabular-nums font-mono">
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
                      label="Disk"
                      value={formatPercent(metrics.disk)}
                    />
                    <MetricPill
                      icon={Timer}
                      label="Up"
                      value={formatUptimeVerbose(metrics.uptime)}
                    />
                  </div>

                  <div className="min-w-0">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400 lg:hidden">
                      Group Policy
                    </span>
                    <select
                      className="h-10 w-full min-w-0 rounded-xl border border-line bg-white px-3 text-xs font-bold text-slate-600 outline-none transition-all focus:border-signal focus:ring-4 focus:ring-blue-50 lg:w-40 shadow-sm"
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
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest border transition-all ${
                        device.status === "online"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-100 shadow-sm shadow-emerald-50"
                          : "bg-red-50 text-red-700 border-red-100 shadow-sm shadow-red-50"
                      }`}
                    >
                      <div className={`h-1.5 w-1.5 rounded-full ${device.status === 'online' ? 'bg-emerald-500' : 'bg-red-500'} ${device.status === 'online' ? 'animate-pulse' : ''}`} />
                      {device.status}
                    </span>
                  </div>

                  <div className="group relative flex justify-start lg:justify-end">
                    <button
                      className="grid h-9 w-9 place-items-center rounded-xl border border-red-100 bg-white text-red-600 shadow-sm transition-all hover:bg-red-600 hover:text-white hover:shadow-lg active:scale-95"
                      onClick={() => setPendingArchive(device)}
                      title="Archive device"
                      type="button"
                    >
                      <Archive size={16} strokeWidth={2.5} />
                    </button>
                    <div className="pointer-events-none absolute right-0 top-full mt-2 z-30 hidden w-44 rounded-lg bg-slate-900 px-3 py-2 text-center text-[11px] font-medium text-white shadow-xl group-hover:block">
                      Remove from active fleet
                      <div className="absolute bottom-full right-4 border-4 border-transparent border-b-slate-900" />
                    </div>
                  </div>
                </div>

                {expanded ? (
                  <div className="animate-in slide-in-from-top-2 duration-300">
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
