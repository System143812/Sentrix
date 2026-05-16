import {
  Archive,
  ChevronDown,
  Cpu,
  HardDrive,
  MemoryStick,
  Monitor,
  Timer,
  Usb,
  X,
} from "lucide-react";
import { useState } from "react";
import { MetricPill } from "./MetricPill.jsx";
import { formatUptimeVerbose, formatBool } from "../shared/utils.js";

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

function DeviceDetails({ device }) {
  const details = device.details || {};
  const specs = details.specs || {};
  const usbDevices = details.usbDevices || [];
  const peripherals = inferPeripherals(details.peripherals || {}, usbDevices);
  const metrics = device.metrics || {};

  return (
    <div className="border-t border-line bg-slate-50 px-4 py-5 sm:px-5">
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

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <section className="rounded-lg border border-line bg-slate-100/80 p-4">
          <h4 className="mb-3 text-sm font-bold uppercase text-slate-600">
            Graphics
          </h4>
          <div className="grid gap-2">
            {(peripherals.graphicsCards || []).length ? (
              peripherals.graphicsCards.map((gpu, index) => (
                <div className="min-w-0 rounded-md bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-200/70" key={index}>
                  <p className="break-words text-sm font-semibold text-slate-800">
                    {gpu.model}
                  </p>
                  <p className="text-xs text-slate-500">
                    {gpu.vendor} {gpu.vram ? `- ${gpu.vram} MB VRAM` : ""}
                  </p>
                </div>
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
            {(specs.disks || []).length ? (
              specs.disks.map((disk, index) => (
                <div className="min-w-0 rounded-md bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-200/70" key={index}>
                  <p className="break-words text-sm font-semibold text-slate-800">
                    {disk.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {disk.type} - {disk.sizeGb} GB
                  </p>
                </div>
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
                <div className="min-w-0 rounded-md bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-200/70" key={index}>
                  <p className="break-words text-sm font-semibold text-slate-800">
                    {device.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {device.type} - {device.vendor}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No USB devices reported.</p>
            )}
          </div>
        </section>
      </div>
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

      <div className="overflow-hidden rounded-lg border border-line bg-white shadow-sm">
        <div className="hidden bg-slate-100 px-5 py-3 text-xs font-semibold uppercase text-slate-500 lg:grid lg:grid-cols-[48px_minmax(180px,1.25fr)_minmax(140px,0.85fr)_minmax(260px,1.4fr)_minmax(150px,0.7fr)_auto_auto] lg:items-center lg:gap-4">
          <div />
          <div>Device</div>
          <div>Network</div>
          <div>Metrics</div>
          <div>Group</div>
          <div>Status</div>
          <div className="text-right">Actions</div>
        </div>

        <div className="divide-y divide-line">
          {devices.map((device) => {
            const metrics = device.metrics || {};
            const groupValue = device.group || "Unassigned";
            const expanded = expandedId === device.id;

            return (
              <article className="bg-white" key={device.id}>
                <div className="grid gap-4 px-4 py-5 text-sm text-slate-700 transition hover:bg-slate-50 sm:px-5 lg:grid-cols-[48px_minmax(180px,1.25fr)_minmax(140px,0.85fr)_minmax(260px,1.4fr)_minmax(150px,0.7fr)_auto_auto] lg:items-start lg:gap-4">
                  <button
                    className="grid h-10 w-10 place-items-center rounded-md border border-line bg-white text-slate-600 shadow-sm transition hover:border-signal hover:text-signal"
                    onClick={() =>
                      setExpandedId(expanded ? null : device.id)
                    }
                    title={expanded ? "Collapse details" : "Expand details"}
                    type="button"
                  >
                    <ChevronDown
                      className={`transition ${expanded ? "rotate-180" : ""}`}
                      size={17}
                    />
                  </button>

                  <div className="min-w-0">
                    <strong className="block break-words text-base font-bold text-slate-900 lg:text-sm">
                      {device.hostname}
                    </strong>
                    <span className="mt-1 block break-words text-xs leading-5 text-slate-500">
                      {device.os}
                    </span>
                  </div>

                  <div className="min-w-0 rounded-md bg-slate-50 p-3 lg:bg-transparent lg:p-0">
                    <span className="mb-1 block text-xs font-bold uppercase text-slate-400 lg:hidden">
                      Network
                    </span>
                    <span className="block break-words font-medium">{device.ip}</span>
                    <span className="mt-1 block break-words text-xs text-slate-500">
                      {device.mac}
                    </span>
                  </div>

                  <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
                    <MetricPill
                      icon={Cpu}
                      label="CPU"
                      value={`${metrics.cpu ?? 0}%`}
                    />
                    <MetricPill
                      icon={MemoryStick}
                      label="RAM"
                      value={`${metrics.ram ?? 0}%`}
                    />
                    <MetricPill
                      icon={HardDrive}
                      label="Disk"
                      value={`${metrics.disk ?? 0}%`}
                    />
                    <MetricPill
                      icon={Timer}
                      label="Up"
                      value={formatUptimeVerbose(metrics.uptime)}
                    />
                  </div>

                  <div className="min-w-0">
                    <span className="mb-1 block text-xs font-bold uppercase text-slate-400 lg:hidden">
                      Group
                    </span>
                    <select
                      className="h-10 w-full min-w-0 rounded-md border border-line bg-white px-2 text-sm outline-none focus:border-signal focus:ring-2 focus:ring-blue-100 lg:w-40"
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

                  <span
                    className={`inline-flex w-fit items-center rounded-md px-2.5 py-1 text-xs font-bold capitalize ${
                      device.status === "online"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-700"
                    }`}
                  >
                    {device.status}
                  </span>

                  <div className="group relative flex justify-start lg:justify-end">
                    <button
                      className="grid h-9 w-9 place-items-center rounded-md border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100"
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

                {expanded ? <DeviceDetails device={device} /> : null}
              </article>
            );
          })}
        </div>
      </div>
    </>
  );
}
