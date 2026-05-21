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
  ChevronRight,
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
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-slate-500 shadow-sm transition-transform hover:scale-105"
      title={label}
      aria-label={label}
    >
      <Icon size={18} strokeWidth={2} />
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
        title="Subnet Intelligence"
        subtitle="Automated node discovery and remote agent provisioning."
        backgroundImage="/network_header.jpg"
        action={
          <button
            type="button"
            onClick={onScan}
            className={`inline-flex h-12 items-center justify-center gap-3 rounded-xl px-6 text-sm font-bold text-white transition-all shadow-2xl active:scale-95 disabled:opacity-50 border border-white/10 backdrop-blur-xl group overflow-hidden relative ${scanLoading ? 'bg-slate-800/40 cursor-wait' : 'bg-white/5 hover:bg-white/10 hover:border-white/20'}`}
            disabled={scanLoading}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-white/5 to-blue-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
            {scanLoading ? (
              <LoaderCircle className="animate-spin text-slate-400" size={20} />
            ) : (
              <RefreshCcw size={20} strokeWidth={2.5} className="text-slate-400 group-hover:rotate-180 transition-transform duration-700" />
            )}
            <span className="relative z-10 font-ui">{scanLoading ? "Scanning Network..." : "Force Subnet Rescan"}</span>
          </button>
        }
      >
        <div className="mt-4 flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/5 px-3 py-1.5 text-[10px] font-bold uppercase text-slate-400 tracking-widest backdrop-blur-md font-ui">
            <Server size={12} className="text-blue-500" />
            Subnet: {snapshot?.subnet || "0.0.0.0"}
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/5 px-3 py-1.5 text-[10px] font-bold uppercase text-slate-400 tracking-widest backdrop-blur-md font-ui">
            <Clock size={12} className="text-blue-500" />
            Last Sync: {formatTime(snapshot?.lastScanAt)}
          </div>
        </div>

        <div className="mt-8 space-y-4">
          <div className="flex justify-between items-end">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 font-ui">
              {snapshot?.message || "System Standing By"}
            </p>
            <span className="text-xs font-bold text-white font-data tabular-nums">{snapshot?.progress || 0}%</span>
          </div>
          <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden backdrop-blur-sm">
            <div 
              className="h-full bg-white opacity-80 shadow-[0_0_10px_rgba(255,255,255,0.3)] transition-all duration-700 ease-out rounded-full" 
              style={{ width: `${snapshot?.progress || 0}%` }}
            />
          </div>
        </div>
      </PageHeader>

      {deployMessage && !selectedIp ? (
        <div className={`rounded-xl border p-4 text-sm font-bold shadow-sm flex items-center gap-3 animate-in slide-in-from-top-1 bg-white border-slate-100`}>
          <div className={`h-1.5 w-1.5 rounded-full ${isError ? 'bg-rose-500' : 'bg-emerald-500'}`} />
          <span className="text-slate-700 font-data">{deployMessage}</span>
        </div>
      ) : null}

      <Card padding="0" className="overflow-hidden border-slate-200/60 bg-white shadow-sm ring-1 ring-slate-100">
        <div className="p-6 border-b border-slate-100 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-3 font-ui">
              <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              Discovered Host Registry
            </h3>
            <p className="mt-1 text-[11px] font-bold text-slate-400 uppercase tracking-widest font-ui">
              Unmanaged terminals identified within the cluster subnet
            </p>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl bg-slate-900 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-lg shadow-slate-900/10 font-ui">
            <ServerCog size={14} strokeWidth={2.5} />
            {scanResults.length} Nodes Found
          </div>
        </div>

        {scanResults.length === 0 ? (
          <div className="p-20 text-center bg-slate-50/30">
            <div className="flex flex-col items-center gap-4">
              <Radar className="text-slate-200 animate-pulse" size={40} strokeWidth={1.5} />
              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em] font-ui">No Active Discovery Sessions</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <div className="min-w-[1000px]">
              <div className="grid grid-cols-[2fr_1fr_1.2fr_1.2fr_80px_160px] gap-6 bg-slate-50/80 px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-200/60 font-ui">
                <div>Terminal Identity</div>
                <div>IP Address</div>
                <div>MAC ID</div>
                <div>OEM Vendor</div>
                <div className="text-center">Class</div>
                <div className="text-right">Action</div>
              </div>
              <div className="divide-y divide-slate-100">
                {scanResults.map((host) => (
                  <div
                    key={host.ip}
                    className="grid grid-cols-[2fr_1fr_1.2fr_1.2fr_80px_160px] gap-6 px-8 py-5 text-sm items-center hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="min-w-0 font-ui">
                      <p className="font-bold text-slate-800 tracking-tight truncate">
                        {host.hostname || `HOST-NODE-${host.ip?.split(".").at(-1)}`}
                      </p>
                      <p className="mt-0.5 text-[10px] font-bold uppercase text-slate-400 tracking-tighter">
                        Source: {host.hostname_source || "Broadcast"}
                      </p>
                    </div>
                    <div className="font-bold text-slate-600 font-data tabular-nums">
                      {host.ip}
                    </div>
                    <div className="text-[11px] font-medium text-slate-400 font-data tabular-nums">
                      {host.mac}
                    </div>
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-tight truncate font-ui">
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
                        className={`btn-minimal h-10 w-full text-[10px] font-bold uppercase tracking-widest ${host.deploy_eligible ? 'border-slate-200' : 'opacity-30 border-dashed'}`}
                        title={
                          host.deploy_eligible
                            ? `Provision Agent on ${host.ip}`
                            : "Provisioning Unavailable"
                        }
                      >
                        {deployingIp === host.ip ? (
                          <LoaderCircle className="animate-spin" size={14} />
                        ) : (
                          <PackageCheck size={14} strokeWidth={2.5} />
                        )}
                        <span>
                          {host.deploy_eligible
                            ? deployingIp === host.ip
                              ? "Syncing"
                              : "Provision"
                            : "Locked"}
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
