import {
  CircleHelp,
  Laptop,
  Monitor,
  PackageCheck,
  Printer,
  Radar,
  RefreshCcw,
  Router,
  Server,
  ServerCog,
  Smartphone,
} from "lucide-react";

function formatTime(value) {
  if (!value) {
    return "Not yet";
  }

  return new Date(value).toLocaleTimeString();
}

function getTypeIcon(deviceType = "") {
  const normalized = deviceType.toLowerCase();

  if (normalized.includes("laptop")) return Laptop;
  if (normalized.includes("mobile")) return Smartphone;
  if (normalized.includes("printer")) return Printer;
  if (normalized.includes("network")) return Router;
  if (normalized.includes("server") || normalized.includes("linux"))
    return Server;
  if (normalized.includes("pc")) return Monitor;
  return CircleHelp;
}

function DeviceTypeIcon({ type, kind, gateway }) {
  const Icon = getTypeIcon(type);
  const label = [
    kind || type || "Unknown device",
    gateway ? "Default gateway" : null,
  ]
    .filter(Boolean)
    .join(" - ");

  return (
    <span
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-slate-50 text-slate-700"
      title={label}
      aria-label={label}
    >
      <Icon size={17} />
    </span>
  );
}

export function NetworkPage({ snapshot, onScan, onDeploy, deployMessage }) {
  const scanResults = snapshot?.devices || [];
  const scanLoading = snapshot?.status === "scanning";

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-line bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="rounded-lg border border-teal-100 bg-teal-50 p-3 text-ocean">
              <Radar size={22} />
            </span>
            <div>
              <h2 className="text-xl font-semibold">
                Automatic Network Discovery
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-500">
                Sentrix scans in the background and streams discovery updates
                here. Use Rescan when you want to refresh the network now.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  Subnet: {snapshot?.subnet || "Unknown"}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  Last scan: {formatTime(snapshot?.lastScanAt)}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  Next auto scan: {formatTime(snapshot?.nextScanAt)}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onScan}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-signal px-5 text-sm font-semibold text-white transition hover:bg-signal-dark disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={scanLoading}
          >
            <RefreshCcw size={16} />
            {scanLoading ? "Scanning..." : "Rescan"}
          </button>
        </div>

        <div className="mt-5">
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-ocean transition-all"
              style={{ width: `${snapshot?.progress || 0}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {snapshot?.message || "Waiting for discovery updates."}
          </p>
        </div>
      </div>

      {deployMessage ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-sm">
          {deployMessage}
        </div>
      ) : null}

      <div className="rounded-lg border border-line bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Discovered hosts</h3>
            <p className="mt-2 text-sm text-slate-500">
              Hostnames are best-effort. Registered Sentrix agents are the
              trusted identity source.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-md border border-line bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
            <ServerCog size={16} />
            {scanResults.length} found
          </span>
        </div>

        {scanResults.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
            No hosts discovered yet. Sentrix will scan automatically, or you can
            run a rescan now.
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-lg border border-slate-200">
            <div className="hidden gap-4 bg-slate-100 px-4 py-3 text-xs font-semibold uppercase text-slate-500 lg:grid lg:grid-cols-[minmax(170px,1.2fr)_minmax(120px,0.7fr)_minmax(150px,1fr)_minmax(140px,0.9fr)_72px_150px]">
              <div>Host</div>
              <div>IP</div>
              <div>MAC</div>
              <div>Vendor</div>
              <div>Type</div>
              <div className="text-right">DEPLOYMENT</div>
            </div>
            {scanResults.map((host) => (
              <div
                key={host.ip}
                className="grid gap-4 border-t border-slate-200 bg-white px-4 py-4 text-sm text-slate-700 first:border-t-0 lg:grid-cols-[minmax(170px,1.2fr)_minmax(120px,0.7fr)_minmax(150px,1fr)_minmax(140px,0.9fr)_72px_150px] lg:items-center"
              >
                <div className="min-w-0">
                  <p className="break-words font-semibold text-slate-900">
                    {host.hostname || `Host ${host.ip?.split(".").at(-1)}`}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    via {host.hostname_source || "scan"}
                  </p>
                </div>
                <div className="min-w-0">
                  <span className="mb-1 block text-xs font-bold uppercase text-slate-400 lg:hidden">
                    IP
                  </span>
                  <span className="break-words">{host.ip}</span>
                </div>
                <div className="min-w-0">
                  <span className="mb-1 block text-xs font-bold uppercase text-slate-400 lg:hidden">
                    MAC
                  </span>
                  <span className="break-words">{host.mac}</span>
                </div>
                <div className="min-w-0">
                  <span className="mb-1 block text-xs font-bold uppercase text-slate-400 lg:hidden">
                    Vendor
                  </span>
                  <span className="break-words">
                    {host.vendor || "Unknown"}
                  </span>
                </div>
                <div>
                  <span className="mb-1 block text-xs font-bold uppercase text-slate-400 lg:hidden">
                    Type
                  </span>
                  <DeviceTypeIcon
                    type={host.device_type}
                    kind={host.device_kind}
                    gateway={host.gateway}
                  />
                </div>
                <div className="flex justify-start lg:justify-end">
                  <button
                    type="button"
                    onClick={() => onDeploy(host.ip, host.device_type)}
                    disabled={!host.deploy_eligible}
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                    title={
                      host.deploy_eligible
                        ? `Prepare installer for ${host.device_type}`
                        : host.gateway
                          ? "Deployment is not available for router/gateway devices"
                          : `Deployment is not available for ${host.device_kind || host.device_type || "this device"}`
                    }
                  >
                    <PackageCheck size={15} />
                    {host.deploy_eligible ? "Deploy agent" : "Not eligible"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
