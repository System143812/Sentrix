import {
  Monitor,
  Cpu,
  Usb,
  Thermometer,
  Network,
  MonitorDot,
  HardDrive,
  Globe2,
} from "lucide-react";
import { MetricPill } from "../MetricPill.jsx";
import {
  formatBool,
  formatBytesPerSecond,
  formatPercent,
  formatTemperature,
  formatUptimeVerbose,
} from "../../shared/utils.js";

function getUsbSearchText(device = {}) {
  return [device.name, device.type, device.vendor, device.id]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

export function inferPeripherals(peripherals = {}, usbDevices = []) {
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

export function DetailItem({ label, value }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200/60 bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-100/60 transition hover:border-slate-200">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-semibold leading-5 text-slate-800">
        {value || "Unknown"}
      </dd>
    </div>
  );
}

export function ListItem({ title, detail }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200/60 bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-100/60 transition hover:bg-slate-50/60">
      <p className="break-words text-sm font-semibold text-slate-800">
        {title || "Unknown"}
      </p>
      {detail ? (
        <p className="mt-1 truncate text-xs leading-5 text-slate-500">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

import { PeripheralHistoryPanel } from "./PeripheralHistoryPanel.jsx";

export function SpecificationView({
  device,
  hardware,
  metricHistory,
  peripheralHistory,
  canManagePeripherals,
}) {
  const details = device.details || {};
  const specs = hardware?.profile || details.specs || {};
  const usbDevices = hardware?.usbDevices || details.usbDevices || [];
  const peripherals = inferPeripherals(
    hardware?.peripherals || details.peripherals || {},
    usbDevices,
  );
  const disks = hardware?.disks || specs.disks || [];
  const networkAdapters =
    hardware?.networkAdapters || specs.networkAdapters || [];
  const graphicsCards =
    hardware?.graphicsCards || peripherals.graphicsCards || [];
  const displays = hardware?.displays || peripherals.displays || [];
  const metrics = device.metrics || {};
  const latestSample = metricHistory?.latest || null;

  const sampleNetwork = metrics.network || latestSample?.network || {};
  const sampleTemperature =
    metrics.temperature || latestSample?.temperature || {};
  const sampleSystem = metrics.system || latestSample?.system || {};

  return (
    <div className="device-detail-view">
      <div className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-5 shadow-inner">
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
            <DetailItem
              label="Uptime"
              value={formatUptimeVerbose(metrics.uptime)}
            />
            <DetailItem label="OS Platform" value={sampleSystem.os?.platform} />
          </dl>
        </section>

        <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-5 shadow-inner">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-600">
            <Cpu size={15} strokeWidth={2.5} />
            Other Specs
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

        <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-5 shadow-inner">
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
        <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-5 shadow-inner">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-600">
            <Thermometer size={15} strokeWidth={2.5} />
            Temperature
          </h4>
          <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <DetailItem
              label="CPU Temperature"
              value={formatTemperature(
                sampleTemperature.cpu?.temperatureCelsius,
              )}
            />
            <DetailItem
              label="GPU Temperature"
              value={formatTemperature(
                sampleTemperature.gpu?.temperatureCelsius,
              )}
            />
            <DetailItem
              label="GPU Model"
              value={sampleTemperature.gpu?.model}
            />
          </dl>
        </section>

        <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-5 shadow-inner">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-600">
            <Network size={15} strokeWidth={2.5} />
            Network Metrics
          </h4>
          <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <DetailItem label="Interface" value={sampleNetwork.interface} />
            <DetailItem
              label="Upload"
              value={formatBytesPerSecond(sampleNetwork.uploadBytesPerSec)}
            />
            <DetailItem
              label="Download"
              value={formatBytesPerSecond(sampleNetwork.downloadBytesPerSec)}
            />
            <DetailItem
              label="Latency"
              value={
                sampleNetwork.latencyMs == null
                  ? "Unknown"
                  : `${Math.round(Number(sampleNetwork.latencyMs))} ms`
              }
            />
            <DetailItem
              label="Packet Loss"
              value={formatPercent(sampleNetwork.packetLoss)}
            />
          </dl>
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-5 shadow-inner">
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

        <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-5 shadow-inner">
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
              <p className="text-sm text-slate-500">
                No disk details reported.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-5 shadow-inner">
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
        <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-5 shadow-inner">
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
              <p className="text-sm text-slate-500">
                No network adapters reported.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-5 shadow-inner">
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
              <p className="text-sm text-slate-500">
                No display details reported.
              </p>
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
  );
}
