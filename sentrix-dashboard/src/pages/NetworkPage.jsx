import {
  AlertTriangle,
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
} from "lucide-react";
import { useState } from "react";
import { Card } from "../components/Card.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { ProgressBar } from "../components/ProgressBar.jsx";
import { DeployDialog } from "../components/DeployDialog.jsx";
import { useToast } from "../components/ToastProvider.jsx";

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

  if (
    normalized.includes("not found") ||
    normalized.includes("unavailable") ||
    normalized.includes("offline") ||
    normalized.includes("timed out") ||
    normalized.includes("timeout") ||
    normalized.includes("rpc server is unavailable")
  ) {
    return {
      title: "Agent deployment failed. Device is unavailable.",
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
      title: "Deployment blocked by target PC security controls.",
      detail: "The target PC appears to be rejecting the remote installer because of Windows security filtering, firewall rules, or administrator permission restrictions.",
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
      title: "Deployment failed because the credentials were rejected.",
      detail: "Check the administrator username and password, then try the deployment again.",
      technical: rawMessage,
    };
  }

  return {
    title: "Agent deployment failed.",
    detail: "Sentrix could not complete the installer push. Review the technical message below, then retry after checking the target PC connection and permissions.",
    technical: rawMessage,
  };
}

function DeploymentFailureOverlay({ failure, loading, onClose, onRetry }) {
  if (!failure) return null;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-rose-100 bg-white p-6 shadow-2xl shadow-slate-950/20">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-rose-100 bg-rose-50 text-rose-600">
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

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Technical message
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
            Retry redeploy
          </button>
        </div>
      </div>
    </div>
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
  const [deploymentFailure, setDeploymentFailure] = useState(null);
  const [retryRequest, setRetryRequest] = useState(null);
  const { notify } = useToast();
  const scanResults = snapshot?.devices || [];
  const scanLoading = snapshot?.status === "scanning";

  async function handleDeploy(credentials) {
    try {
      await onDeploy(selectedIp, "PC", credentials);
      notify(`Deployment started for ${selectedIp}.`, "success");
      setSelectedIp(null);
    } catch (error) {
      const failure = getDeploymentFailure(error, selectedIp);
      setRetryRequest({ ip: selectedIp, credentials });
      setDeploymentFailure(failure);
      setSelectedIp(null);
      notify(failure.title, "failed");
    }
  }

  async function handleRetryDeploy() {
    if (!retryRequest?.ip) return;

    const { ip, credentials } = retryRequest;
    setDeploymentFailure(null);

    try {
      await onDeploy(ip, "PC", credentials);
      notify(`Deployment started for ${ip}.`, "success");
      setRetryRequest(null);
      setSelectedIp(null);
    } catch (error) {
      const failure = getDeploymentFailure(error, ip);
      setDeploymentFailure(failure);
      notify(failure.title, "failed");
      setSelectedIp(null);
    }
  }

  const isError = deployMessage?.toLowerCase().includes("failed") || 
                  deployMessage?.toLowerCase().includes("error") ||
                  deployMessage?.toLowerCase().includes("wrong");

  return (
    <div className="space-y-6">
      {selectedIp ? (
        <DeployDialog
          ip={selectedIp}
          onCancel={() => setSelectedIp(null)}
          onConfirm={handleDeploy}
          loading={deployingIp === selectedIp}
          error={isError ? deployMessage : null}
        />
      ) : null}

      <DeploymentFailureOverlay
        failure={deploymentFailure}
        loading={Boolean(deployingIp)}
        onClose={() => setDeploymentFailure(null)}
        onRetry={handleRetryDeploy}
      />

      <PageHeader
        icon={Radar}
        title="Automatic Network Discovery"
        subtitle="Sentrix scans in the background and streams discovery updates here. Use Rescan when you want to refresh the network now."
        backgroundImage="/network_header.jpg"
        action={
          <button
            type="button"
            onClick={onScan}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-5 text-sm font-bold text-white shadow-xl backdrop-blur transition hover:bg-white/20 disabled:cursor-wait disabled:opacity-60"
            disabled={scanLoading}
          >
            {scanLoading ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : (
              <RefreshCcw size={16} />
            )}
            <span>{scanLoading ? "Scanning" : "Rescan"}</span>
          </button>
        }
      >
        <div className="mt-4 flex flex-wrap gap-3 text-xs font-bold text-white">
          <span className="rounded-lg border border-white/15 bg-white/10 px-4 py-2.5 shadow-xl shadow-black/10 backdrop-blur-md">
            Subnet: {snapshot?.subnet || "Unknown"}
          </span>
          <span className="rounded-lg border border-white/15 bg-white/10 px-4 py-2.5 shadow-xl shadow-black/10 backdrop-blur-md">
            Last scan: {formatTime(snapshot?.lastScanAt)}
          </span>
          <span className="rounded-lg border border-white/15 bg-white/10 px-4 py-2.5 shadow-xl shadow-black/10 backdrop-blur-md">
            Next auto scan: {formatTime(snapshot?.nextScanAt)}
          </span>
        </div>

        <div className="mt-5">
          <ProgressBar value={snapshot?.progress || 0} color="ocean" height="h-2" />
          <p className="mt-2 text-sm font-semibold text-white/85">
            {snapshot?.message || "Waiting for discovery updates."}
          </p>
        </div>
      </PageHeader>

      {deployMessage && !selectedIp ? (
        <div className={`rounded-lg border p-4 text-sm shadow-sm ${
          isError 
            ? "border-red-200 bg-red-50 text-red-800" 
            : "border-emerald-200 bg-emerald-50 text-emerald-800"
        }`}>
          {deployMessage}
        </div>
      ) : null}

      <Card padding="6">
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
                    onClick={() => setSelectedIp(host.ip)}
                    disabled={!host.deploy_eligible || deployingIp === host.ip}
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
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
                      <PackageCheck size={15} />
                    )}
                    {host.deploy_eligible
                      ? deployingIp === host.ip
                        ? "Preparing"
                        : "Deploy agent"
                      : "Not eligible"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
