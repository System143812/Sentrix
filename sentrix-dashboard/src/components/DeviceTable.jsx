import {
  Archive,
  ChevronDown,
  CircleStop,
  Cpu,
  Globe2,
  Database,
  Info,
  CircuitBoard,
  Users,
  Monitor,
  Network,
  RadioTower,
  Thermometer,
  Hourglass,
  Usb,
  X,
  Power,
  RotateCw,
  Moon,
  Lock,
  ArrowUpCircle,
  Terminal,
  History,
  Search,
  ShieldAlert,
  LoaderCircle,
  CircleHelp,
  HardDrive,
  MonitorDot,
  Zap,
  Trash2,
  MessageSquare,
  Eraser,
  Clock as ClockIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { MetricPill } from "./MetricPill.jsx";
import { SearchFilterBar } from "./SearchFilterBar.jsx";
import { Pagination } from "./Pagination.jsx";
import { useToast } from "./ToastProvider.jsx";
import { DetailLoader } from "./DetailLoader.jsx";
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
    { id: "specification", label: "Specs", icon: Monitor },
    { id: "networkActivity", label: "Network", icon: RadioTower },
    { id: "behavior", label: "History", icon: History },
    ...(canControl ? [{ id: "remoteControl", label: "Remote", icon: Terminal }] : []),
  ];

  const totalButtons = buttons.length;
  const activeIndex = buttons.findIndex(b => b.id === activeView);

  return (
    <div className="relative mb-6 flex items-center p-1 rounded-lg border border-slate-200 overflow-hidden w-full max-w-2xl shadow-sm">
      {/* Animated Active Pill Indicator */}
      <div 
        className="absolute h-[calc(100%-8px)] rounded-md bg-slate-900 transition-all duration-300 ease-in-out shadow-sm"
        style={{
          left: `calc(8px + ${activeIndex} * (100% - 8px) / ${totalButtons})`,
          width: `calc((100% - 8px) / ${totalButtons} - 8px)`,
        }}
      />

      {buttons.map((button) => {
        const Icon = button.icon;
        const selected = activeView === button.id;

        return (
          <button
            key={button.id}
            onClick={() => onChange(button.id)}
            className={`relative z-10 flex flex-1 items-center justify-center gap-2.5 h-9 px-3 rounded-md text-xs font-bold tracking-tight transition-all duration-200 whitespace-nowrap ${
                          selected ? 'text-white' : 'text-slate-500 hover:text-slate-800'
                        }`}
          >
            <Icon size={14} strokeWidth={1.5} className="shrink-0" />
            <span className="hidden sm:inline">{button.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function DeviceDetails({ allDevices, device, hardware, metricHistory, peripheralHistory, loading, error, canControl, canManagePeripherals, utilityConfig }) {
  const [activeView, setActiveView] = useState("specification");

  if (loading && !hardware && !metricHistory) {
    return (
      <div className="border-t border-line bg-slate-50 px-4 sm:px-5">
        <DetailLoader 
          title="Fetching Device Specifications"
          subtitle={`Retrieving hardware profile and historical metrics for ${device.hostname}...`}
        />
      </div>
    );
  }

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
  const [isArchiving, setIsArchiving] = useState(false);
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
      <DetailLoader 
        title="Loading Fleet Registry"
        subtitle="Retrieving registered devices and synchronizing live agent connections..."
      />
    );
  }

  if (devices.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-12 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-slate-50 text-slate-300">
          <Monitor size={24} />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          No devices match the current view.
        </p>
      </div>
    );
  }

  async function confirmArchive() {
    if (!pendingArchive) return;
    setIsArchiving(true);
    try {
      await onArchive?.(pendingArchive);
      setExpandedId((current) =>
        current === pendingArchive.id ? null : current,
      );
      setPendingArchive(null);
    } catch (error) {
    } finally {
      setIsArchiving(false);
    }
  }

  return (
    <>
      <ConfirmDialog
        device={pendingArchive}
        onCancel={() => setPendingArchive(null)}
        onConfirm={confirmArchive}
        loading={isArchiving}
      />

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-all hover:shadow-sm">
        <div className="hidden border-b border-slate-100 bg-slate-50/50 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 xl:grid xl:grid-cols-[48px_minmax(160px,1fr)_minmax(130px,0.8fr)_minmax(240px,1.3fr)_minmax(180px,0.9fr)_100px_auto] xl:items-center xl:gap-8">
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
              <article
                className={`bg-white transition ${expanded ? "bg-slate-50/30" : "hover:bg-slate-50/50"}`}
                key={device.id}
              >
                <div 
                  className="flex cursor-pointer flex-col gap-5 px-4 py-6 sm:px-6 xl:grid xl:grid-cols-[48px_minmax(160px,1fr)_minmax(130px,0.8fr)_minmax(240px,1.3fr)_minmax(180px,0.9fr)_100px_auto] xl:items-start xl:gap-8 xl:py-5"
                  onClick={() => setExpandedId(expanded ? null : device.id)}
                >
                  <div className="flex items-center justify-between xl:block">
                    <button
                      className={`grid h-11 w-11 place-items-center rounded-lg border shadow-sm transition-all duration-300 active:scale-95 sm:h-10 sm:w-10 ${
                        expanded
                          ? "rotate-180 border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/20"
                          : "border-slate-200 bg-white text-slate-400 hover:border-slate-400 hover:text-slate-900"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedId(expanded ? null : device.id);
                      }}
                      title={expanded ? "Collapse details" : "Expand details"}
                      type="button"
                    >
                      <ChevronDown size={18} strokeWidth={2.5} />
                    </button>

                    <div className="flex items-center gap-3 xl:hidden">
                      <span
                        className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider ${
                          device.status === "online"
                            ? "border-emerald-100 bg-emerald-50 text-emerald-600"
                            : "border-rose-100 bg-rose-50 text-rose-600"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${device.status === "online" ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                        {device.status}
                      </span>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <strong className="block truncate text-lg font-semibold text-slate-800 tracking-tight xl:text-sm">
                        {device.hostname}
                      </strong>
                    </div>
                    <span className="mt-1 block truncate text-[10px] font-medium uppercase tracking-wider text-slate-400">
                      {device.os}
                    </span>
                  </div>

                  <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50/50 p-4 xl:border-0 xl:bg-transparent xl:p-0">
                    <span className="mb-2 block text-[9px] font-semibold uppercase tracking-wider text-slate-400 xl:hidden">
                      Network Identity
                    </span>
                    <div className="flex flex-col gap-1">
                      <span className="block font-data text-xs font-semibold text-slate-700">{device.ip}</span>
                      <span className="block font-data text-[10px] font-medium text-slate-400">
                        {device.mac}
                      </span>
                    </div>
                  </div>

                  <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 xl:col-span-1 xl:grid-cols-2">
                    <MetricPill
                      icon={Cpu}
                      label="CPU"
                      value={formatPercent(metrics.cpu)}
                    />
                    <MetricPill
                      icon={CircuitBoard}
                      label="RAM"
                      value={formatPercent(metrics.ram)}
                    />
                    <MetricPill
                      icon={Database}
                      label="Disk"
                      value={formatPercent(metrics.disk)}
                    />
                    <MetricPill
                      icon={Hourglass}
                      label="Uptime"
                      value={formatUptimeVerbose(metrics.uptime)}
                    />
                  </div>

                  <div className="min-w-0 xl:col-start-auto">
                    <span className="mb-2 block text-[9px] font-semibold uppercase tracking-wider text-slate-400 xl:hidden">
                      Assigned Group
                    </span>
                    <select
                      className="h-11 w-full min-w-0 cursor-pointer rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 outline-none shadow-sm transition hover:border-slate-300 focus:border-slate-900 focus:ring-4 focus:ring-slate-100/50 xl:h-10 xl:w-44 xl:px-3 uppercase tracking-wider"
                      onClick={(e) => e.stopPropagation()}
                      onChange={async (event) => {
                        try {
                          await onUpdateGroup(device.id, event.target.value);
                        } catch (error) {}
                      }}
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

                  <div className="hidden items-center xl:flex">
                    <span
                      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1 text-[9px] font-semibold uppercase tracking-wider ${
                        device.status === "online"
                          ? "border-emerald-100 bg-emerald-50 text-emerald-600 shadow-sm"
                          : "border-rose-100 bg-rose-50 text-rose-600 shadow-sm"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${device.status === "online" ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                      {device.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 pt-5 xl:justify-end xl:border-0 xl:pt-0">
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 xl:hidden">Management</span>
                    <div className="group relative">
                      <button
                        className="grid h-10 w-10 place-items-center rounded-lg border border-rose-100 bg-rose-50 text-rose-600 shadow-sm transition-all hover:border-rose-300 hover:bg-rose-100 active:scale-95 xl:h-9 xl:w-9"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingArchive(device);
                        }}
                        title="Archive device"
                        type="button"
                      >
                        <Archive size={18} strokeWidth={2.5} />
                      </button>
                      <span className="pointer-events-none absolute bottom-full right-0 z-20 mb-3 hidden w-48 rounded-lg bg-slate-900 px-3 py-2 text-center text-[11px] font-medium leading-relaxed text-white shadow-sm xl:group-hover:block">
                        Archive this device from the registered list
                        <div className="absolute right-3 top-full border-[6px] border-transparent border-t-slate-900" />
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  className={`grid transition-all duration-300 ease-in-out ${
                    expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <DeviceDetails
                      allDevices={devices}
                      device={device}
                      error={detailCache[device.id]?.error}
                      hardware={detailCache[device.id]?.hardware}
                      loading={detailCache[device.id]?.loading}
                      metricHistory={detailCache[device.id]?.metricHistory}
                      peripheralHistory={detailCache[device.id]?.peripheralHistory}
                      canControl={canControl}
                      canManagePeripherals={canManagePeripherals}
                      utilityConfig={utilityConfig}
                    />
                  </div>
                </div>
              </article>
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
