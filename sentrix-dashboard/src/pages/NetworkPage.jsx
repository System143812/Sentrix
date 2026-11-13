import {
  AlertTriangle,
  CircleHelp,
  Laptop,
  Monitor,
  Package,
  ArrowUp,
  Printer,
  Radar,
  LoaderCircle,
  RefreshCcw,
  Router,
  Server,
  ServerCog,
  Smartphone,
  X,
  ChevronDown,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { Card } from "../components/Card.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { ProgressBar } from "../components/ProgressBar.jsx";
import { BatchActionModal } from "../components/BatchActionModal.jsx";
import { useToast } from "../components/ToastProvider.jsx";
import { Pagination } from "../components/Pagination.jsx";
import { usePaginationState } from "../hooks/usePaginationState.js";

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

function getDeploymentFailure(error, ip) {
  const rawMessage = error?.message || "Agent deployment failed.";
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes("offline")) {
    return {
      title: "Agent is offline. Please try again later.",
      detail: `Sentrix could not reach the agent at ${ip}. The device appears to be offline or disconnected. Please ensure the agent service is running on the target PC and try again.`,
      technical: rawMessage,
    };
  }

  if (
    normalized.includes("not found") ||
    normalized.includes("unavailable") ||
    normalized.includes("timed out") ||
    normalized.includes("timeout") ||
    normalized.includes("rpc server is unavailable")
  ) {
    return {
      title: "Device is unavailable or unreachable.",
      detail: `Sentrix could not reach ${ip}. Confirm the target PC is powered on, connected to the network, and reachable from this dashboard.`,
      technical: rawMessage,
    };
  }

  if (
    normalized.includes("uac") ||
    normalized.includes("firewall") ||
    normalized.includes("blocked") ||
    normalized.includes("access is denied") ||
    normalized.includes("permission")
  ) {
    return {
      title: "Action blocked by target PC security controls.",
      detail: "The target PC rejected the request due to Windows security filtering, firewall rules, or administrator permission restrictions.",
      technical: rawMessage,
    };
  }

  if (
    normalized.includes("credential") ||
    normalized.includes("password") ||
    normalized.includes("logon failure") ||
    normalized.includes("unauthorized") ||
    normalized.includes("wrong")
  ) {
    return {
      title: "Authentication failed.",
      detail: "The administrator credentials were rejected by the target device. Please verify your administrator username and password.",
      technical: rawMessage,
    };
  }

  return {
    title: rawMessage.includes("offline") ? "Agent is offline. Please try again later." : rawMessage,
    detail: "Review the technical details below or check target PC connection and status.",
    technical: rawMessage,
  };
}

import { BlurOverlay } from "../components/BlurOverlay.jsx";

function DeploymentFailureOverlay({ failure, loading, onClose, onRetry }) {
  if (!failure) return null;

  return (
    <BlurOverlay onClose={onClose} className="z-[60]" containerClassName="w-full max-w-lg">
      <div className="rounded-lg border border-rose-100 bg-white p-6 shadow-sm shadow-slate-950/20">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-rose-100 bg-rose-50 text-rose-600">
            <AlertTriangle size={24} strokeWidth={2.5} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-slate-950">{failure.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{failure.detail}</p>
          </div>
          <button
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
            type="button"
            aria-label="Close deployment failure"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Details
          </p>
          <p className="mt-1 break-words text-sm font-semibold leading-6 text-slate-700">
            {failure.technical}
          </p>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            className="btn-minimal h-11 px-5"
            onClick={onClose}
            type="button"
          >
            OK
          </button>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 text-sm font-bold text-white shadow-lg shadow-slate-900/15 transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-70"
            disabled={loading}
            onClick={onRetry}
            type="button"
          >
            {loading ? <LoaderCircle className="animate-spin" size={16} /> : <RefreshCcw size={16} />}
            Retry
          </button>
        </div>
      </div>
    </BlurOverlay>
  );
}

export function NetworkPage({
  user,
  snapshot,
  interfaces = [],
  onScan,
  onSetSubnet,
  onDeploy,
  deployMessage,
  deployingIp,
}) {
  const canDeploy = user?.role === "network_admin";
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [deploymentFailure, setDeploymentFailure] = useState(null);
  const [retryRequest, setRetryRequest] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Initialize targetSubnet from localStorage, falling back to snapshot or empty
  const [targetSubnet, setTargetSubnet] = useState(() => {
    return localStorage.getItem("sentrix_preferred_subnet") || snapshot?.subnet || "";
  });

  const { notify } = useToast();
  const { currentPage, pageSize, setCurrentPage, setPageSize } = usePaginationState("network", 5);

  const scanResults = useMemo(() => {
    let devices = snapshot?.devices || [];
    if (targetSubnet) {
      const normalizedTarget = targetSubnet.split('/')[0].replace(/\.0$/, '');
      devices = devices.filter((host) => host.ip?.startsWith(`${normalizedTarget}.`));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      devices = devices.filter(d =>
        (d.ip && d.ip.toLowerCase().includes(q)) ||
        (d.mac && d.mac.toLowerCase().includes(q)) ||
        (d.hostname && d.hostname.toLowerCase().includes(q))
      );
    }

    if (statusFilter !== "all") {
      devices = devices.filter(d => {
        const st = (d.agent_status || "no agent").toLowerCase();
        if (statusFilter === "running") return st === "running" || st === "online";
        if (statusFilter === "no agent") return st === "none" || st === "no agent" || !st;
        if (statusFilter === "deploying") return st === "deploying";
        if (statusFilter === "updating") return st === "updating";
        return true;
      });
    }

    return devices;
  }, [snapshot?.devices, targetSubnet, searchQuery, statusFilter]);

  const eligibleCount = useMemo(() => {
    const devices = snapshot?.devices || [];
    return devices.filter(d => {
      if (!d.deploy_eligible || d.gateway) return false;
      const st = (d.agent_status || "no agent").toLowerCase();
      if (st === "running" || st === "online" || st === "deploying" || st === "updating") return false;
      return true;
    }).length;
  }, [snapshot?.devices]);

  const updateableCount = useMemo(() => {
    const devices = snapshot?.devices || [];
    return devices.filter(d => d.agent_status === "running" || d.agent_status === "online").length;
  }, [snapshot?.devices]);

  const paginatedResults = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return scanResults.slice(start, start + pageSize);
  }, [scanResults, currentPage, pageSize]);

  const scanLoading = snapshot?.status === "scanning";

  useEffect(() => {
    if (targetSubnet) {
      localStorage.setItem("sentrix_preferred_subnet", targetSubnet);
    }
  }, [targetSubnet]);

  useEffect(() => {
    if (!targetSubnet && snapshot?.subnet) {
      setTargetSubnet(snapshot.subnet);
    } else if (!targetSubnet && interfaces.length > 0) {
      setTargetSubnet(interfaces[0].subnet);
    }
  }, [snapshot?.subnet, interfaces, targetSubnet]);

  useEffect(() => {
    setCurrentPage(1);
  }, [snapshot?.lastScanAt]);

  async function handleBatchDeploy(selectedIps) {
    if (!canDeploy || selectedIps.length === 0) return;
    setBatchLoading(true);
    let successCount = 0;

    try {
      const devicesMap = new Map((snapshot?.devices || []).map(d => [d.ip, d]));

      for (const ip of selectedIps) {
        const device = devicesMap.get(ip);
        if (!device || !device.deploy_eligible || device.gateway) {
          const errMsg = `Device ${ip} is not valid or eligible for agent deployment.`;
          console.error(errMsg);
          notify(errMsg, "failed");
          continue;
        }

        try {
          await onDeploy(ip, "PC", "deploy");
          successCount++;
        } catch (err) {
          const failure = getDeploymentFailure(err, ip);
          console.error(`Failed to deploy to ${ip}:`, err);
          notify(failure.title, "failed");
        }
      }

      if (successCount > 0) {
        notify(`Batch deployment initiated for ${successCount} host(s).`, "success");
        setShowDeployModal(false);
      }
    } catch (error) {
      notify("Batch deployment encountered an error.", "failed");
    } finally {
      setBatchLoading(false);
    }
  }

  async function handleBatchUpdate(selectedIps) {
    if (!canDeploy || selectedIps.length === 0) return;
    setBatchLoading(true);
    let successCount = 0;
    let failCount = 0;
    let lastErrorMsg = "";

    try {
      for (const ip of selectedIps) {
        try {
          await onDeploy(ip, "PC", "update");
          successCount++;
        } catch (err) {
          failCount++;
          const rawMsg = err?.message || `Failed to update agent at ${ip}.`;
          lastErrorMsg = rawMsg.toLowerCase().includes("offline")
            ? "Agent is offline. Please try again later."
            : rawMsg;
          console.error(`Failed to update ${ip}:`, err);
        }
      }
      if (successCount > 0) {
        notify(`Batch update initiated for ${successCount} agent(s).`, "success");
      }
      if (failCount > 0 && successCount === 0) {
        notify(lastErrorMsg || "Batch update failed.", "failed");
      }
      if (failCount === 0) {
        setShowUpdateModal(false);
      }
    } catch (error) {
      notify(error?.message || "Batch update encountered an error.", "failed");
    } finally {
      setBatchLoading(false);
    }
  }

  async function handleRetryDeploy() {
    if (!retryRequest?.ip) return;

    const { ip, action = "deploy" } = retryRequest;
    setDeploymentFailure(null);

    try {
      await onDeploy(ip, "PC", action);
      notify(`Setup started for ${ip}.`, "success");
      setRetryRequest(null);
    } catch (error) {
      const failure = getDeploymentFailure(error, ip);
      setDeploymentFailure(failure);
      notify(failure.title, "failed");
    }
  }

  return (
    <div className="page-reveal space-y-6">
      {showDeployModal && (
        <BatchActionModal
          mode="deploy"
          devices={snapshot?.devices || []}
          onClose={() => setShowDeployModal(false)}
          onConfirm={handleBatchDeploy}
          loading={batchLoading}
        />
      )}

      {showUpdateModal && (
        <BatchActionModal
          mode="update"
          devices={snapshot?.devices || []}
          onClose={() => setShowUpdateModal(false)}
          onConfirm={handleBatchUpdate}
          loading={batchLoading}
        />
      )}

      <DeploymentFailureOverlay
        failure={deploymentFailure}
        loading={Boolean(deployingIp)}
        onClose={() => setDeploymentFailure(null)}
        onRetry={handleRetryDeploy}
      />

      <PageHeader
        icon={Radar}
        title="Network Scan"
        subtitle="Sentrix scans the local network and shows which Windows PCs have an active agent or require deployment."
        backgroundImage="/network_header.jpg"
        action={
          canDeploy ? (
            <button
              type="button"
              onClick={() => onScan(targetSubnet)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-white/20 bg-white/10 px-5 text-sm font-bold text-white shadow-sm backdrop-blur transition hover:bg-white/20 disabled:cursor-wait disabled:opacity-60"
              disabled={scanLoading}
            >
              {scanLoading ? (
                <LoaderCircle className="animate-spin" size={16} />
              ) : (
                <RefreshCcw size={16} />
              )}
              <span>{scanLoading ? "Scanning" : "Rescan"}</span>
            </button>
          ) : (
            <span className="inline-flex h-11 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-4 text-xs font-bold text-white/50 backdrop-blur-md">
              <ShieldAlert size={14} />
              View Only Mode
            </span>
          )
        }
      >
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-semibold text-white/70">
          <div className="relative">
            <select
              aria-label="Target Subnet"
              data-testid="subnet-selector"
              value={targetSubnet}
              onChange={(e) => {
                if (!canDeploy) return;
                const newSubnet = e.target.value;
                setTargetSubnet(newSubnet);
                onSetSubnet?.(newSubnet);
              }}
              className={`h-10 w-48 appearance-none rounded-md border border-white/10 bg-white/5 pl-4 pr-10 text-white shadow-sm outline-none backdrop-blur-md transition ${
                canDeploy ? "hover:bg-white/10 focus:border-white/30" : "cursor-not-allowed opacity-60"
              }`}
              disabled={scanLoading || !canDeploy}
            >
              <option value="" disabled className="text-slate-900">Select Interface</option>
              {interfaces.map((iface) => (
                <option key={iface.address} value={iface.subnet} className="text-slate-900">
                  {iface.name} ({iface.subnet}.0)
                </option>
              ))}
            </select>
            {canDeploy && <ChevronDown size={14} className="pointer-events-none absolute right-3 top-3.5 text-white/50" />}
          </div>
          <span className="cursor-default rounded-md border border-white/5 bg-white/5 px-4 py-2.5 text-white/40 shadow-none backdrop-blur-md transition-opacity">
            Last scan: {formatTime(snapshot?.lastScanAt)}
          </span>
          <span className="cursor-default rounded-md border border-white/5 bg-white/5 px-4 py-2.5 text-white/40 shadow-none backdrop-blur-md transition-opacity">
            Next auto scan: {formatTime(snapshot?.nextScanAt)}
          </span>
        </div>

        <div className="mt-5">
          <ProgressBar value={snapshot?.progress || 0} color="ocean" height="h-1.5" />
          <p className="mt-2 text-xs font-bold uppercase tracking-wider text-white/70">
            {snapshot?.message || "Discovery stream active"}
          </p>
        </div>
      </PageHeader>

      <Card padding="6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-100 pb-5 mb-5">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <div className="relative min-w-[240px]">
              <input
                type="text"
                placeholder="Search IP, MAC, hostname..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-400"
              />
            </div>
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-400"
              >
                <option value="all">All Agent Statuses</option>
                <option value="running">Running</option>
                <option value="no agent">No Agent</option>
                <option value="deploying">Deploying</option>
                <option value="updating">Updating</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canDeploy && (
              <>
                <button
                  type="button"
                  onClick={() => setShowDeployModal(true)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                  <Package size={14} />
                  <span>Deploy ({eligibleCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowUpdateModal(true)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <ArrowUp size={14} />
                  <span>Update ({updateableCount})</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">Devices found</h3>
            <p className="mt-1 text-sm text-slate-500">
              Hostnames are best-effort. Registered Sentrix agents are the
              trusted identity source.
            </p>
          </div>
          <span className="inline-flex w-fit shrink-0 items-center gap-2 rounded-md border border-line bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
            <ServerCog size={16} />
            <span className="font-bold tabular-nums">{scanResults.length}</span>
            <span>found</span>
          </span>
        </div>

        {scanResults.length === 0 ? (
          <div className="mt-6 rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
            No hosts discovered yet. Sentrix will scan automatically, or you can
            run a rescan now.
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-md border border-slate-200">
            <div className="hidden min-w-[900px] gap-4 bg-slate-50/50 px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 xl:grid xl:grid-cols-[minmax(180px,1.2fr)_minmax(120px,0.8fr)_minmax(150px,1.0fr)_minmax(140px,0.9fr)_80px_130px] border-b border-slate-100">
              <div>Host</div>
              <div>IP</div>
              <div>MAC</div>
              <div>Vendor</div>
              <div>Type</div>
              <div>Agent Status</div>
            </div>
            {paginatedResults.map((host) => (
              <div
                key={host.ip}
                className="grid gap-4 border-t border-slate-100 bg-white px-4 py-4 text-sm text-slate-700 first:border-t-0 xl:min-w-[900px] xl:grid-cols-[minmax(180px,1.2fr)_minmax(120px,0.8fr)_minmax(150px,1.0fr)_minmax(140px,0.9fr)_80px_130px] xl:items-center hover:bg-slate-50/30 transition-all"
              >
                <div className="min-w-0">
                  <p className="break-words font-semibold text-slate-800">
                    {host.hostname || `Host ${host.ip?.split(".").at(-1)}`}
                  </p>
                  <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                    via {host.hostname_source || "scan"}
                  </p>
                </div>
                <div className="min-w-0">
                  <span className="mb-1 block text-[9px] font-semibold uppercase tracking-wider text-slate-400 xl:hidden">
                    IP
                  </span>
                  <span className="break-words font-data text-xs font-medium text-slate-700">{host.ip}</span>
                </div>
                <div className="min-w-0">
                  <span className="mb-1 block text-[9px] font-semibold uppercase tracking-wider text-slate-400 xl:hidden">
                    MAC
                  </span>
                  <span className="break-words font-data text-xs font-medium text-slate-400">{host.mac}</span>
                </div>
                <div className="min-w-0">
                  <span className="mb-1 block text-[9px] font-semibold uppercase tracking-wider text-slate-400 xl:hidden">
                    Vendor
                  </span>
                  <span className="break-words text-xs font-medium text-slate-600">
                    {host.vendor || "Unknown"}
                  </span>
                </div>
                <div>
                  <span className="mb-1 block text-[9px] font-semibold uppercase tracking-wider text-slate-400 xl:hidden">
                    Type
                  </span>
                  <DeviceTypeIcon
                    type={host.device_type}
                    kind={host.device_kind}
                    gateway={host.gateway}
                  />
                </div>
                <div>
                  <span className="mb-1 block text-[9px] font-semibold uppercase tracking-wider text-slate-400 xl:hidden">
                    Agent Status
                  </span>
                  <span className={`inline-flex w-fit rounded-md border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                    host.agent_status === "running"
                      ? "border-emerald-100 bg-emerald-50 text-emerald-600"
                      : host.agent_status === "deploying" || host.agent_status === "updating"
                        ? "border-blue-100 bg-blue-50 text-blue-600"
                        : "border-slate-100 bg-slate-50 text-slate-400"
                  }`}>
                    {host.agent_status === "running" ? "Running" : host.agent_status === "deploying" ? "Deploying" : host.agent_status === "updating" ? "Updating" : "No agent"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <Pagination
          currentPage={currentPage}
          totalItems={scanResults.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </Card>
    </div>
  );
}
