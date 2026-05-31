import {
  Archive,
  ChevronDown,
  CircleStop,
  Cpu,
  Database,
  Info,
  CircuitBoard,
  Monitor,
  Network,
  RadioTower,
  Thermometer,
  Hourglass,
  X,
  History,
  Terminal,
  Globe2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { MetricPill } from "./MetricPill.jsx";
import { SearchFilterBar } from "./SearchFilterBar.jsx";
import { Pagination } from "./Pagination.jsx";
import { useToast } from "./ToastProvider.jsx";
import * as clientApi from "../services/clientApi.js";
import * as settingsApi from "../services/settingsApi.js";
import {
  formatBytesPerSecond,
  formatPercent,
  formatTemperature,
  formatUptimeVerbose,
} from "../shared/utils.js";

// Modular Components
import { ConfirmDialog } from "./device-details/shared/Dialogs.jsx";
import { SpecificationView } from "./device-details/SpecificationView.jsx";
import { NetworkActivityView } from "./device-details/NetworkActivityView.jsx";
import { BehaviorAnalyticsView } from "./device-details/BehaviorAnalyticsView.jsx";
import { RemoteControlView } from "./device-details/RemoteControlView.jsx";

function DetailViewSwitch({ activeView, onChange, canControl }) {
  const buttons = [
    { id: "specification", label: "Specification", icon: Monitor },
    { id: "networkActivity", label: "Network Activity", icon: RadioTower },
    { id: "behavior", label: "Timeline & Assets", icon: History },
    ...(canControl ? [{ id: "remoteControl", label: "Remote Controls", icon: Terminal }] : []),
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
                ? "!border-slate-900 !bg-slate-900 !text-white shadow-lg shadow-slate-900/15 hover:!border-slate-900 hover:!bg-slate-900 hover:!text-white"
                : "!bg-white text-slate-500 hover:!border-slate-300 hover:!bg-slate-50 hover:!text-slate-900"
            }`}
            key={button.id}
            onClick={() => onChange(button.id)}
            title={button.label}
            type="button"
            aria-label={button.label}
          >
            <Icon size={16} strokeWidth={2.5} />
            <span className="hidden text-xs font-semibold uppercase tracking-wider sm:inline">{button.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function DeviceDetails({ allDevices, device, hardware, metricHistory, peripheralHistory, loading, error, canControl, canManagePeripherals, utilityConfig }) {
  const [activeView, setActiveView] = useState("specification");

  return (
    <div className="border-t border-line bg-slate-50 px-4 py-5 sm:px-5">
      {error ? (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
          {error}
        </p>
      ) : null}

      <DetailViewSwitch activeView={activeView} onChange={setActiveView} canControl={canControl} />

      {activeView === "specification" ? (
        <SpecificationView 
          device={device} 
          hardware={hardware} 
          metricHistory={metricHistory} 
          peripheralHistory={peripheralHistory}
          canManagePeripherals={canManagePeripherals}
        />
      ) : activeView === "networkActivity" ? (
        <NetworkActivityView device={device} />
      ) : activeView === "behavior" ? (
        <BehaviorAnalyticsView device={device} />
      ) : (
        <RemoteControlView device={device} allDevices={allDevices} utilityConfig={utilityConfig} />
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
  canControl = false,
  canManagePeripherals = false,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  totalItems,
}) {
  const [expandedId, setExpandedId] = useState(null);
  const [pendingArchive, setPendingArchive] = useState(null);
  const [detailCache, setDetailCache] = useState({});
  const [utilityConfig, setUtilityConfig] = useState(null);

  useEffect(() => {
    settingsApi.getUtilityConfig().then(setUtilityConfig).catch(() => {});
  }, []);

  useEffect(() => {
    if (!expandedId) return;

    let active = true;

    setDetailCache((current) => {
      const cached = current[expandedId];
      const now = Date.now();
      const isExpired = cached && now - (cached.timestamp || 0) > 60000;

      if (cached?.loading || (cached?.loaded && !isExpired)) {
        return current;
      }

      Promise.all([
        clientApi.getClientHardware(expandedId).catch(() => null),
        clientApi.getClientMetrics(expandedId, { range: "24h", limit: 1440 }).catch(() => null),
        clientApi.getClientPeripheralHistory(expandedId).catch(() => null),
      ]).then(([hardware, metricHistory, peripheralHistory]) => {
        if (!active) return;
        
        setDetailCache((prev) => ({
          ...prev,
          [expandedId]: {
            hardware: hardware || prev[expandedId]?.hardware,
            metricHistory: metricHistory || prev[expandedId]?.metricHistory,
            peripheralHistory: peripheralHistory || { inventory: [], events: [] },
            loading: false,
            loaded: true,
            error: (!hardware && !metricHistory && !peripheralHistory) ? "Failed to load device details." : "",
            timestamp: Date.now(),
          },
        }));
      });

      return {
        ...current,
        [expandedId]: {
          ...current[expandedId],
          loading: true,
          error: "",
        },
      };
    });

    return () => {
      active = false;
    };
  }, [expandedId]);

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
    } catch (error) {}
  }

  return (
    <>
      <ConfirmDialog
        device={pendingArchive}
        onCancel={() => setPendingArchive(null)}
        onConfirm={confirmArchive}
      />

      <div className="overflow-hidden rounded-xl border border-slate-200/60 bg-white shadow-sm transition-all hover:shadow-md">
        <div className="hidden border-b border-slate-200/60 bg-slate-50/50 px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 xl:grid xl:grid-cols-[48px_minmax(160px,1fr)_minmax(130px,0.8fr)_minmax(240px,1.3fr)_minmax(180px,0.9fr)_100px_auto] xl:items-center xl:gap-8">
          <div />
          <div>Device</div>
          <div>Network</div>
          <div>Metrics</div>
          <div>Group</div>
          <div className="text-center">Status</div>
          <div className="text-right">Actions</div>
        </div>

        <div className="divide-y divide-slate-100">
          {devices.map((device) => {
            const metrics = device.metrics || {};
            const groupValue = device.group || "Unassigned";
            const expanded = expandedId === device.id;

            return (
              <div
                className={`transition-colors ${expanded ? "bg-slate-50/30" : "bg-white hover:bg-slate-50/50"}`}
                key={device.id}
              >
                <div className="flex flex-col p-4 xl:grid xl:grid-cols-[48px_minmax(160px,1fr)_minmax(130px,0.8fr)_minmax(240px,1.3fr)_minmax(180px,0.9fr)_100px_auto] xl:items-center xl:gap-8 xl:px-5 xl:py-4">
                  <div className="hidden xl:block">
                    <span className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-400 shadow-sm transition-transform group-hover:scale-105">
                      <Database size={18} strokeWidth={2.5} />
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold text-slate-900 xl:text-base">
                        {device.hostname}
                      </p>
                      {device.status === "online" && (
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] xl:hidden" />
                      )}
                    </div>
                    <p className="truncate text-[10px] font-bold uppercase tracking-tight text-slate-400 xl:mt-0.5">
                      {device.os}
                    </p>
                  </div>

                  <div className="mt-3 xl:mt-0">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 xl:flex-col xl:gap-0.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                        <Globe2 size={12} strokeWidth={2.5} className="text-slate-400" />
                        <span className="font-data">{device.ip}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 xl:mt-0.5">
                        <CircuitBoard size={10} strokeWidth={2.5} />
                        <span className="font-data tabular-nums uppercase">{device.mac}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 xl:mt-0">
                    <div className="flex flex-wrap gap-2">
                      <MetricPill
                        icon={Cpu}
                        label="CPU"
                        value={formatPercent(metrics.cpu)}
                      />
                      <MetricPill
                        icon={Database}
                        label="RAM"
                        value={formatPercent(metrics.ram)}
                      />
                      <MetricPill
                        icon={Network}
                        label="LAT"
                        value={`${Math.round(Number(metrics.network?.latencyMs || 0))}ms`}
                      />
                    </div>
                  </div>

                  <div className="mt-4 xl:mt-0">
                    <div className="flex items-center gap-2">
                      <select
                        className="h-9 w-full min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition hover:border-slate-300 focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5 xl:w-auto"
                        onChange={(e) => onUpdateGroup(device.id, e.target.value)}
                        value={groupValue}
                      >
                        <option value="Unassigned">Unassigned</option>
                        {groups.map((group) => (
                          <option key={group.id} value={group.name}>
                            {group.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between xl:mt-0 xl:justify-center">
                    <div className="flex items-center gap-2 xl:flex-col xl:gap-1">
                      <span
                        className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider shadow-sm transition-all ${
                          device.status === "online"
                            ? "border-emerald-100 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-500/10"
                            : "border-slate-200 bg-white text-slate-500"
                        }`}
                      >
                        {device.status}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-4 xl:mt-0 xl:border-0 xl:pt-0">
                    <button
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 shadow-sm transition-all hover:border-slate-900 hover:text-slate-900 active:scale-95 ${
                        expanded ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800" : ""
                      }`}
                      onClick={() => setExpandedId(expanded ? null : device.id)}
                      title={expanded ? "Collapse Details" : "View Details"}
                      type="button"
                    >
                      <ChevronDown
                        className={`transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
                        size={18}
                        strokeWidth={2.5}
                      />
                    </button>
                    <button
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 shadow-sm transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 active:scale-95"
                      onClick={() => setPendingArchive(device)}
                      title="Archive Device"
                      type="button"
                    >
                      <Archive size={18} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>

                {expanded && (
                  <DeviceDetails
                    allDevices={devices}
                    canControl={canControl}
                    canManagePeripherals={canManagePeripherals}
                    device={device}
                    error={detailCache[device.id]?.error}
                    hardware={detailCache[device.id]?.hardware}
                    loading={detailCache[device.id]?.loading}
                    metricHistory={detailCache[device.id]?.metricHistory}
                    peripheralHistory={detailCache[device.id]?.peripheralHistory}
                    utilityConfig={utilityConfig}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Pagination
        currentPage={currentPage}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        pageSize={pageSize}
        totalItems={totalItems}
      />
    </>
  );
}
