import {
  CircleHelp,
  Laptop,
  Monitor,
  PackageCheck,
  Printer,
  Radar,
  LoaderCircle,
  RefreshCcw,
  Router,
  Server,
  ServerCog,
  Smartphone,
  X,
  Clock,
} from "lucide-react";
import { useState } from "react";
import { Card } from "../components/Card.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { ProgressBar } from "../components/ProgressBar.jsx";
import { DeployDialog } from "../components/DeployDialog.jsx";

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

export function NetworkPage({
  snapshot,
  onScan,
  onDeploy,
  deployMessage,
  deployingIp,
}) {
  const [selectedIp, setSelectedIp] = useState(null);
  const scanResults = snapshot?.devices || [];
  const scanLoading = snapshot?.status === "scanning";

  async function handleDeploy(credentials) {
    try {
      await onDeploy(selectedIp, "PC", credentials);
      setSelectedIp(null);
    } catch (error) {
      // Error is handled by useDiscovery and shown in the dialog/message
    }
  }

  const isError = deployMessage?.toLowerCase().includes("failed") || 
                  deployMessage?.toLowerCase().includes("error") ||
                  deployMessage?.toLowerCase().includes("wrong");

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {selectedIp ? (
        <DeployDialog
          ip={selectedIp}
          onCancel={() => setSelectedIp(null)}
          onConfirm={handleDeploy}
          loading={deployingIp === selectedIp}
          error={isError ? deployMessage : null}
        />
      ) : null}

      <PageHeader
        icon={Radar}
        title="Network Intelligence"
        subtitle="Automatic laboratory discovery and agent provisioning. Sentrix scans your subnet to identify unmanaged terminals."
        backgroundImage="/network_header.jpg"
        action={
          <button
            type="button"
            onClick={onScan}
            className={`inline-flex h-12 items-center justify-center gap-3 rounded-xl px-6 text-sm font-bold text-white transition-all shadow-2xl active:scale-95 disabled:opacity-50 border border-white/20 backdrop-blur-xl group overflow-hidden relative ${scanLoading ? 'bg-slate-800/40 cursor-wait' : 'bg-white/10 hover:bg-white/20 hover:border-white/40'}`}
            disabled={scanLoading}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-white/5 to-blue-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
            {scanLoading ? (
              <LoaderCircle className="animate-spin text-blue-400" size={20} />
            ) : (
              <RefreshCcw size={20} strokeWidth={2.5} className="text-blue-400 group-hover:rotate-180 transition-transform duration-700" />
            )}
            <span className="relative z-10">{scanLoading ? "Scanning Network..." : "Force Subnet Rescan"}</span>
          </button>
        }
      >
        <div className="mt-4 flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-[10px] font-bold uppercase text-slate-300 tracking-wider backdrop-blur-md">
            <Server size={12} className="text-blue-400" />
            Subnet: {snapshot?.subnet || "0.0.0.0"}
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-[10px] font-bold uppercase text-slate-300 tracking-wider backdrop-blur-md">
            <Clock size={12} className="text-blue-400" />
            Last Seen: {formatTime(snapshot?.lastScanAt)}
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div className="flex justify-between items-end">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-300">
              {snapshot?.message || "System standby — Monitoring subnet traffic."}
            </p>
            <span className="text-sm font-bold text-white tabular-nums">{snapshot?.progress || 0}%</span>
          </div>
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden backdrop-blur-sm border border-white/5">
            <div 
              className="h-full bg-white shadow-[0_0_15px_rgba(255,255,255,0.5)] transition-all duration-500 ease-out rounded-full" 
              style={{ width: `${snapshot?.progress || 0}%` }}
            />
          </div>
        </div>
      </PageHeader>

      {deployMessage && !selectedIp ? (
        <div className={`rounded-xl border p-4 text-sm font-bold shadow-sm flex items-center gap-3 animate-in slide-in-from-top-2 ${
          isError 
            ? "border-red-200 bg-red-50 text-red-700" 
            : "border-emerald-200 bg-emerald-50 text-emerald-700"
        }`}>
          <div className={`h-2 w-2 rounded-full ${isError ? 'bg-red-500' : 'bg-emerald-500'}`} />
          {deployMessage}
        </div>
      ) : null}

      <Card padding="0" className="overflow-hidden border-none ring-1 ring-slate-200/60 shadow-sm">
        <div className="p-5 sm:p-6 border-b border-slate-100 bg-white flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">Discovered Laboratory Hosts</h3>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Identified terminals pending agent deployment and registration.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-slate-200 ring-4 ring-white">
            <ServerCog size={16} />
            {scanResults.length} Units Found
          </div>
        </div>

        {scanResults.length === 0 ? (
          <div className="p-12 text-center bg-slate-50/50">
            <div className="flex flex-col items-center gap-3">
              <Radar className="text-slate-300 animate-pulse" size={40} />
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No hosts discovered in this subnet</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              <div className="grid grid-cols-[1.5fr_1fr_1.2fr_1fr_80px_160px] gap-6 bg-slate-50/80 px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 border-b border-line/60">
                <div>Host Identity</div>
                <div>IP Address</div>
                <div>MAC Address</div>
                <div>Vendor</div>
                <div className="text-center">Type</div>
                <div className="text-right">Provisioning</div>
              </div>
              <div className="divide-y divide-line/60">
                {scanResults.map((host) => (
                  <div
                    key={host.ip}
                    className="grid grid-cols-[1.5fr_1fr_1.2fr_1fr_80px_160px] gap-6 bg-white px-6 py-5 text-sm transition-colors hover:bg-slate-50/50 items-center"
                  >
                    <div className="min-w-0">
                      <p className="break-words font-bold text-slate-950">
                        {host.hostname || `Host ${host.ip?.split(".").at(-1)}`}
                      </p>
                      <p className="mt-1 text-[10px] font-bold uppercase text-slate-400 tracking-tighter">
                        Origin: {host.hostname_source || "Network Scan"}
                      </p>
                    </div>
                    <div className="font-bold text-slate-700 tabular-nums">
                      {host.ip}
                    </div>
                    <div className="text-xs font-medium text-slate-400 tabular-nums font-mono">
                      {host.mac}
                    </div>
                    <div className="text-xs font-semibold text-slate-500">
                      {host.vendor || "Standard OEM"}
                    </div>
                    <div className="flex justify-center">
                      <DeviceTypeIcon
                        type={host.device_type}
                        kind={host.device_kind}
                        gateway={host.gateway}
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setSelectedIp(host.ip)}
                        disabled={!host.deploy_eligible || deployingIp === host.ip}
                        className={`inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl px-4 text-[11px] font-bold uppercase tracking-tight transition-all shadow-sm active:scale-95 disabled:opacity-40 disabled:bg-slate-100 disabled:text-slate-400 ${host.deploy_eligible ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-50 text-slate-400 border border-slate-200'}`}
                        title={
                          host.deploy_eligible
                            ? `Prepare installer for ${host.device_type}`
                            : host.gateway
                              ? "Deployment is not available for router/gateway devices"
                              : `Deployment is not available for ${host.device_kind || host.device_type || "this device"}`
                        }
                      >
                        {deployingIp === host.ip ? (
                          <LoaderCircle className="animate-spin" size={15} />
                        ) : (
                          <PackageCheck size={16} strokeWidth={2.5} />
                        )}
                        <span>
                          {host.deploy_eligible
                            ? deployingIp === host.ip
                              ? "Preparing..."
                              : "Provision Agent"
                            : "Ineligible"}
                        </span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
