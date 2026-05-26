import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BadgeAlert,
  AreaChart,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Cpu,
  Download,
  Filter,
  Zap,
  Database,
  MonitorDot,
  LineChart,
  CircuitBoard,
  History,
  RefreshCcw,
  ShieldCheck,
  Thermometer,
  Hourglass,
  Upload,
  Wifi,
  WifiOff,
  ChevronLeft,
  ChevronRight,
  Boxes,
  MemoryStick,
  Radio,
  BarChart3,
  Users,
  Gauge,
  HardDrive,
  Laptop,
  FileSpreadsheet,
  FileText,
  FileBarChart,
  Plug,
  Unplug,
} from "lucide-react";
import { SentrixLogoLoader } from "../components/SentrixLogo.jsx";
import { Card } from "../components/Card.jsx";
import { StatusBadge } from "../components/StatusBadge.jsx";
import { ProgressBar } from "../components/ProgressBar.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Pagination } from "../components/Pagination.jsx";
import { useTelemetryInterval } from "../hooks/useTelemetryInterval.js";
import { usePaginationState } from "../hooks/usePaginationState.js";
import * as analyticsApi from "../services/analyticsApi.js";
import {
  formatUptime,
  formatTimeAgo,
  formatBytesPerSecond,
  formatPercent,
  formatTemperature,
  clamp,
  getHealthScore,
  getDeviceLoad,
  getDeviceIssues,
  buildSmoothSvgPath,
  getLastSeenAt,
} from "../shared/utils.js";
import { EMPTY_ANALYTICS } from "../shared/emptyStates.js";
import { ICON_TONES, STATUS_TONES, HEATMAP_STATUS_STYLES, getStatusTone, PROGRESS_BAR_COLORS } from "../styles/tones.js";

const timeRanges = [
  { key: "24h", label: "Last 24h", points: ["12a", "4a", "8a", "12p", "4p", "Now"] },
  { key: "7d", label: "7d", points: ["Mon", "Tue", "Wed", "Thu", "Fri", "Now"] },
  { key: "30d", label: "30d", points: ["W1", "W2", "W3", "W4", "W5", "Now"] },
];
const GLASS_TONES = {
  emerald: "border-emerald-100/70 bg-emerald-50/45 shadow-emerald-900/5",
  blue: "border-blue-100/70 bg-blue-50/45 shadow-blue-900/5",
  amber: "border-amber-100/70 bg-amber-50/45 shadow-amber-900/5",
  rose: "border-rose-100/70 bg-rose-50/45 shadow-rose-900/5",
  teal: "border-teal-100/70 bg-teal-50/45 shadow-teal-900/5",
  indigo: "border-indigo-100/70 bg-indigo-50/45 shadow-indigo-900/5",
  slate: "border-slate-200/80 bg-slate-50/70 shadow-slate-900/5",
};
const PROGRESS_TRACK_TONES = {
  emerald: "bg-emerald-100/70",
  blue: "bg-blue-100/70",
  amber: "bg-amber-100/70",
  rose: "bg-rose-100/70",
  teal: "bg-teal-100/70",
  indigo: "bg-indigo-100/70",
  slate: "bg-slate-100",
};
const TREND_POINT_COLORS = ["#f43f5e", "#f59e0b", "#2563eb", "#14b8a6", "#8b5cf6", "#10b981"];

function normalizeApiAnalytics(data = EMPTY_ANALYTICS) {
  const safeData = data || EMPTY_ANALYTICS;
  const totals = safeData.totals || EMPTY_ANALYTICS.totals;
  const averages = safeData.averages || EMPTY_ANALYTICS.averages;
  const alerts = safeData.alerts || EMPTY_ANALYTICS.alerts;
  const trends = safeData.trends || EMPTY_ANALYTICS.trends;
  const devices = safeData.devices || EMPTY_ANALYTICS.devices;
  const dataQuality = safeData.dataQuality || EMPTY_ANALYTICS.dataQuality;
  const deviceRows = devices.rows || [];
  const metricAverage = (getter) => {
    const values = deviceRows
      .map(getter)
      .map((value) => (value == null || value === "" ? NaN : Number(value)))
      .filter((value) => Number.isFinite(value));

    if (!values.length) return null;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  };
  const averageValue = (getter) => {
    const computedValue = metricAverage(getter);
    if (computedValue != null) return computedValue;

    return null;
  };
  const temperatureAverage = (getter) => {
    const values = deviceRows
      .map(getter)
      .map((value) => (value == null || value === "" ? NaN : Number(value)))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (!values.length) return null;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  };
  const topIssues = (alerts.active || []).map((alert) => ({
    issue: alert.issue,
    device: {
      id: alert.clientId,
      hostname: alert.hostname,
      lastSeenAt: alert.lastSeenAt,
      status: alert.issue === "Offline" ? "offline" : "online",
    },
  }));

  return {
    raw: safeData,
    total: totals.total || 0,
    online: totals.online || 0,
    offline: totals.offline || 0,
    cpu: averages.cpu || 0,
    ram: averages.ram || 0,
    disk: averages.disk || 0,
    uptime: averages.uptime || 0,
    cpuTemperature: temperatureAverage(
      (device) => device.metrics?.temperature?.cpu?.temperatureCelsius ?? device.metrics?.cpuTemperature,
    ),
    gpuTemperature: temperatureAverage(
      (device) => device.metrics?.temperature?.gpu?.temperatureCelsius ?? device.metrics?.gpuTemperature,
    ),
    uploadBytesPerSec: averageValue(
      (device) => device.metrics?.network?.uploadBytesPerSec ?? device.metrics?.uploadBytesPerSec,
    ),
    downloadBytesPerSec: averageValue(
      (device) => device.metrics?.network?.downloadBytesPerSec ?? device.metrics?.downloadBytesPerSec,
    ),
    latencyMs: averageValue(
      (device) => device.metrics?.network?.latencyMs ?? device.metrics?.latencyMs,
    ),
    packetLoss: averageValue(
      (device) => device.metrics?.network?.packetLoss ?? device.metrics?.packetLoss,
    ),
    pressure: averages.load || 0,
    health: averages.health || 0,
    alerts: alerts.total || 0,
    criticalAlerts: alerts.critical || 0,
    resolutionMinutes: null,
    growth: {
      health: 0,
      alerts: 0,
      load: 0,
    },
    cpuTrend: trends.cpu || [],
    ramTrend: trends.ram || [],
    diskTrend: trends.disk || [],
    cpuTemperatureTrend: trends.cpuTemperature || [],
    gpuTemperatureTrend: trends.gpuTemperature || [],
    uploadTrend: trends.uploadBytesPerSec || [],
    downloadTrend: trends.downloadBytesPerSec || [],
    latencyTrend: trends.latencyMs || [],
    packetLossTrend: trends.packetLoss || [],
    healthTrend: trends.health || [],
    alertTrend: trends.alerts || [],
    topAlerts: alerts.byType || [],
    topIssues,
    topDevices: devices.topLoad || [],
    outliers: devices.outliers || [],
    recentDevices: devices.recent || [],
    statusChanges: devices.recent || [],
    allDevices: deviceRows,
    groupStats: safeData.groups || [],
    peripherals: safeData.peripherals || { totalMissing: 0, devicesWithMissing: 0, groups: [], byDevice: [] },
    exportUrls: safeData.exportUrls || {},
    dataQuality,
  };
}

function TooltipIcon({ icon: Icon, label, tone = "teal" }) {
  return (
    <span
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border shadow-sm transition-transform hover:scale-105 ${ICON_TONES[tone]}`}
      title={label}
      aria-label={label}
    >
      <Icon size={18} strokeWidth={2.4} />
    </span>
  );
}

function ModuleLoader({ loading }) {
  if (!loading) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-end rounded-lg bg-white/55 p-4 backdrop-blur-[1px]">
      <span className="inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 shadow-sm">
        <RefreshCcw className="animate-spin text-slate-400" size={12} strokeWidth={2.5} />
        Updating
      </span>
    </div>
  );
}

function Panel({ icon, title, subtitle, children, action, loading = false, tone = "teal" }) {
  return (
    <Card padding="0" className="analytics-panel analytics-reveal relative flex h-full min-w-0 flex-col overflow-hidden bg-white border-slate-200/60 shadow-sm transition-all hover:shadow-md">
      <ModuleLoader loading={loading} />
      <div className="flex flex-1 flex-col p-6 sm:p-8">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-4">
              <TooltipIcon icon={icon} label={title} tone={tone} />
              <div>
                <h2 className="text-lg font-bold text-slate-950 tracking-tight leading-tight font-ui">
                  {title}
                </h2>
                <p className="mt-1 text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-none font-ui">{subtitle}</p>
              </div>
            </div>
          </div>
          {action}
        </div>
        <div className="flex flex-1 flex-col">{children}</div>
      </div>
    </Card>
  );
}

function MetricCard({ icon: Icon, label, value, detail, tone = "blue", warning = false, loading = false }) {
  const cardTone = warning ? "rose" : tone;

  return (
    <Card padding="0" className={`analytics-card analytics-reveal relative overflow-hidden border shadow-sm backdrop-blur-md transition-all hover:shadow-md ${GLASS_TONES[cardTone] || GLASS_TONES.slate}`}>
      <ModuleLoader loading={loading} />
      <div className="p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 font-ui">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
            <strong className="mt-1 block text-2xl font-bold tracking-tight text-slate-900 font-data tabular-nums">{value}</strong>
          </div>
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border shadow-sm transition-all hover:scale-110 ${ICON_TONES[warning ? "rose" : tone]}`}
            title={label}
          >
            {warning ? <BadgeAlert size={18} strokeWidth={2.5} /> : <Icon size={18} strokeWidth={2.5} />}
          </span>
        </div>
        <div className="mt-5 flex items-center gap-2">
          <div className={`h-1 w-full overflow-hidden rounded-full ${PROGRESS_TRACK_TONES[cardTone] || PROGRESS_TRACK_TONES.slate}`}>
            <div 
              className={`h-full transition-all duration-1000 ${PROGRESS_BAR_COLORS[warning ? "rose" : tone]}`}
              style={{ width: value.includes("%") ? value : "100%" }}
            />
          </div>
          <span className="shrink-0 text-[9px] font-bold text-slate-400 uppercase tracking-tighter font-ui">
            {detail.split(' ')[0]}
          </span>
        </div>
        <p className="mt-2 text-[11px] font-medium text-slate-400 line-clamp-1 italic font-data">
          {detail}
        </p>
      </div>
    </Card>
  );
}

function Sparkline({ points = [], color = "#2563eb", label = "Trend" }) {
  const width = 520;
  const height = 180;
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const coordinates = points.map((point, index) => ({
    x: index * step,
    y: height - (clamp(point.value) / 100) * height,
  }));
  const path = buildSmoothSvgPath(coordinates, step);
  const areaPath = path ? `${path} L ${width} ${height} L 0 ${height} Z` : "";

  return (
    <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm sm:p-6">
      <svg
        className="h-56 w-full sm:h-64"
        preserveAspectRatio="none"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label}
      >
        {[36, 72, 108, 144].map((line) => (
          <line
            key={line}
            stroke="currentColor"
            className="text-slate-100/80"
            x1="0"
            x2={width}
            y1={line}
            y2={line}
          />
        ))}
        <path className="analytics-area" d={areaPath} fill={color} opacity="0.08" />
        <path
          className="analytics-line"
          d={path}
          fill="none"
          key={`${label}-${points.map((point) => point.value).join("-")}`}
          stroke={color}
          strokeLinecap="round"
          strokeWidth="5"
        />
        {coordinates.map((point, index) => (
          <circle
            className="analytics-point"
            cx={point.x}
            cy={point.y}
            fill="#ffffff"
            key={`${label}-${index}`}
            r="5"
            stroke={TREND_POINT_COLORS[index % TREND_POINT_COLORS.length]}
            strokeWidth="3"
          />
        ))}
      </svg>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {points.map((point, index) => {
          const pointColor = TREND_POINT_COLORS[index % TREND_POINT_COLORS.length];
          return (
          <div
            className="min-w-0 rounded-lg border bg-white px-3 py-2.5 shadow-sm"
            key={point.label}
            style={{ borderColor: `${pointColor}33`, backgroundColor: `${pointColor}0d` }}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-ui">
              {point.label}
            </p>
            <p className="mt-0.5 text-xs font-bold font-data tabular-nums" style={{ color: pointColor }}>
              {point.value}%
            </p>
          </div>
          );
        })}
      </div>
    </div>
  );
}

function MultiLineChart({ devices = [] }) {
  return (
    <div className="rounded-xl border border-slate-200/60 bg-white p-6">
      {!devices.length ? (
        <div className="grid min-h-64 place-items-center rounded-lg bg-slate-50 text-xs font-bold uppercase tracking-widest text-slate-400 font-ui">
          Syncing Device Metrics...
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {devices.slice(0, 6).map((device) => {
            const health = getHealthScore(device);
            const load = getDeviceLoad(device);

            return (
              <div key={device.id} className="group rounded-xl border border-slate-200/60 bg-slate-50/30 p-4 transition-all hover:border-slate-200 hover:bg-white hover:shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-bold text-slate-800 tracking-tight font-ui">{device.hostname}</span>
                  <div className="flex shrink-0 gap-1">
                    <div className={`h-1.5 w-1.5 rounded-full ${health >= 80 ? 'bg-emerald-400' : health >= 60 ? 'bg-amber-400' : 'bg-rose-400'}`} />
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between px-0.5">
                      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-ui">
                        <ShieldCheck size={12} className="text-emerald-500/70" />
                        Health
                      </span>
                      <span className="text-[10px] font-bold text-emerald-600 font-data">{health}%</span>
                    </div>
                    <ProgressBar value={clamp(health)} color="emerald" height="h-1.5" />
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between px-0.5">
                      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-ui">
                        <Zap size={12} className="text-blue-500/70" />
                        Workload
                      </span>
                      <span className="text-[10px] font-bold text-blue-600 font-data">{load}%</span>
                    </div>
                    <ProgressBar value={clamp(load)} color="blue" height="h-1.5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TimeRangeToolbar({ rangeKey, setRangeKey, loading, groupOptions, selectedGroup, setSelectedGroup, dark = false }) {
  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        {timeRanges.map((range) => {
          const selected = rangeKey === range.key;
          return (
            <button
              className={`btn-minimal h-10 px-5 transition-all font-ui active:scale-100 hover:scale-100 ${
                selected
                  ? dark
                    ? "!border-white/10 !bg-white/10 !text-white shadow-lg shadow-black/20 cursor-default"
                    : "!border-slate-200 !bg-slate-50 !text-slate-900 shadow-sm cursor-default"
                  : dark 
                    ? "!border-transparent !bg-white/5 text-slate-200 hover:!border-white/10 hover:!bg-white/10 hover:!text-white"
                    : "!bg-white text-slate-500 hover:!bg-slate-50"
              }`}
              key={range.key}
              onClick={() => setRangeKey(range.key)}
              title={`Show ${range.label} analytics`}
              type="button"
            >
              <Clock3 size={15} strokeWidth={2.5} />
              <span className="font-bold uppercase tracking-widest text-[10px]">{range.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 font-ui">
        <span className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-[10px] font-bold uppercase tracking-widest shadow-sm ${dark ? 'border-white/25 bg-white/20 text-white backdrop-blur-md' : 'border-slate-200/60 bg-white text-slate-500'}`}>
          <RefreshCcw className={loading ? "animate-spin" : ""} size={14} strokeWidth={2.5} />
          {loading ? "Syncing..." : "Data Live"}
        </span>
        <label className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-[10px] font-bold uppercase tracking-widest shadow-sm ${dark ? 'border-white/25 bg-white/20 text-white backdrop-blur-md hover:bg-white/25' : 'border-slate-200/60 bg-white text-slate-500 hover:bg-slate-50 hover:border-slate-200'}`}>
          <Filter size={14} strokeWidth={2.5} />
          <select
            className="bg-transparent outline-none cursor-pointer"
            onChange={(event) => setSelectedGroup(event.target.value)}
            title="Filter analytics by group"
            value={selectedGroup}
          >
            <option className="text-slate-900" value="all">All Groups</option>
            {groupOptions.map((group) => (
              <option className="text-slate-900" key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function AgentMetricsPanel({ analytics, loading }) {
  const { currentPage, pageSize, setCurrentPage, setPageSize } = usePaginationState("metrics", 5);

  const getClientMetrics = (device) => {
    const metrics = device.metrics || {};
    const network = metrics.network || {};
    const temperature = metrics.temperature || {};

    return {
      cpuTemperature: temperature.cpu?.temperatureCelsius ?? metrics.cpuTemperature,
      gpuTemperature: temperature.gpu?.temperatureCelsius ?? metrics.gpuTemperature,
      uploadBytesPerSec: network.uploadBytesPerSec ?? metrics.uploadBytesPerSec,
      downloadBytesPerSec: network.downloadBytesPerSec ?? metrics.downloadBytesPerSec,
      latencyMs: network.latencyMs ?? metrics.latencyMs,
      packetLoss: network.packetLoss ?? metrics.packetLoss,
    };
  };

  const paginatedDevices = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return (analytics.allDevices || []).slice(start, start + pageSize);
  }, [analytics.allDevices, currentPage, pageSize]);

  const metrics = [
    {
      label: "CPU Temp",
      value: formatTemperature(analytics.cpuTemperature),
      detail: "Average reported CPU sensor",
      icon: Thermometer,
      tone: "rose",
    },
    {
      label: "GPU Temp",
      value: formatTemperature(analytics.gpuTemperature),
      detail: "Average reported GPU sensor",
      icon: Thermometer,
      tone: "amber",
    },
    {
      label: "Upload",
      value: formatBytesPerSecond(analytics.uploadBytesPerSec),
      detail: "Average outbound throughput",
      icon: Upload,
      tone: "blue",
    },
    {
      label: "Download",
      value: formatBytesPerSecond(analytics.downloadBytesPerSec),
      detail: "Average inbound throughput",
      icon: Download,
      tone: "teal",
    },
    {
      label: "Latency",
      value: analytics.latencyMs == null ? "Unknown" : `${Math.round(Number(analytics.latencyMs))} ms`,
      detail: "Average agent network latency",
      icon: Wifi,
      tone: "slate",
    },
    {
      label: "Packet Loss",
      value: analytics.packetLoss == null ? "Unknown" : `${Math.round(Number(analytics.packetLoss))}%`,
      detail: "Average reported packet loss",
      icon: Radio,
      tone: "rose",
    },
  ];

  return (
    <Panel
      icon={Activity}
      loading={loading}
      title="Live Metrics"
      subtitle="Temperature and network readings reported by devices"
      tone="blue"
    >
      <div className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <div className="group relative overflow-hidden rounded-xl border border-slate-200/60 bg-white p-5 shadow-sm transition-all duration-300 hover:border-slate-300 hover:shadow-md" key={metric.label}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 font-ui">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{metric.label}</p>
                    <strong className="mt-1.5 block break-words text-2xl font-bold text-slate-900 font-data tabular-nums">
                      {metric.value}
                    </strong>
                    <span className="mt-1 block text-[11px] font-medium text-slate-400 italic">
                      {metric.detail}
                    </span>
                  </div>
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border shadow-sm transition-all duration-300 group-hover:scale-110 ${ICON_TONES[metric.tone] || ICON_TONES.blue}`}>
                    <Icon size={20} strokeWidth={2.5} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100">
            <div>
              <div className="hidden grid-cols-[1.8fr_repeat(6,1fr)] bg-slate-50 border-b border-slate-200 px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 font-ui md:grid">
                <span>Device</span>
                <span className="text-right">CPU Temp</span>
                <span className="text-right">GPU Temp</span>
                <span className="text-right">Upload</span>
                <span className="text-right">Download</span>
                <span className="text-right">Latency</span>
                <span className="text-right">Loss</span>
              </div>
              <div className="divide-y divide-slate-100 font-data">
                {paginatedDevices.length ? paginatedDevices.map((device) => {
                  const cm = getClientMetrics(device);

                  return (
                    <div className="grid gap-3 p-4 text-sm transition-colors hover:bg-slate-50/50 md:grid-cols-[1.8fr_repeat(6,1fr)] md:items-center md:px-6" key={device.id}>
                      <span className="font-bold text-slate-800 tracking-tight truncate font-ui">
                        {device.hostname}
                      </span>
                      <span className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 tabular-nums text-slate-600 font-bold md:block md:bg-transparent md:p-0 md:text-right">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 md:hidden">CPU Temp</span>
                        {formatTemperature(cm.cpuTemperature)}
                      </span>
                      <span className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 tabular-nums text-slate-600 font-bold md:block md:bg-transparent md:p-0 md:text-right">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 md:hidden">GPU Temp</span>
                        {formatTemperature(cm.gpuTemperature)}
                      </span>
                      <span className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 tabular-nums text-slate-600 font-bold md:block md:bg-transparent md:p-0 md:text-right">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 md:hidden">Upload</span>
                        {formatBytesPerSecond(cm.uploadBytesPerSec)}
                      </span>
                      <span className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 tabular-nums text-slate-600 font-bold md:block md:bg-transparent md:p-0 md:text-right">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 md:hidden">Download</span>
                        {formatBytesPerSecond(cm.downloadBytesPerSec)}
                      </span>
                      <span className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 tabular-nums text-slate-600 font-bold md:block md:bg-transparent md:p-0 md:text-right">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 md:hidden">Latency</span>
                        {cm.latencyMs == null ? "Unknown" : `${Math.round(Number(cm.latencyMs))}ms`}
                      </span>
                      <span className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 tabular-nums text-slate-600 font-bold md:block md:bg-transparent md:p-0 md:text-right">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 md:hidden">Loss</span>
                        {formatPercent(cm.packetLoss)}
                      </span>
                    </div>
                  );
                }) : (
                  <div className="p-20 text-center text-xs font-bold text-slate-300 uppercase tracking-widest font-ui">
                    Waiting for device data...
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <Pagination
            currentPage={currentPage}
            totalItems={analytics.allDevices?.length || 0}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
      </div>
    </Panel>
  );
}

function HealthScorePanel({ analytics, loading }) {
  const tone = getStatusTone(analytics.health);
  const factors = [
    { label: "Utilization", value: 100 - analytics.pressure, icon: Zap, color: "blue" },
    { label: "CPU Health", value: 100 - analytics.cpu, icon: Cpu, color: "emerald" },
    { label: "Memory State", value: 100 - analytics.ram, icon: MemoryStick, color: "indigo" },
    { label: "Uptime Sync", value: analytics.total ? Math.round((analytics.online / analytics.total) * 100) : 0, icon: Radio, color: "teal" },
  ];

  return (
    <Panel
      icon={ShieldCheck}
      loading={loading}
      title="Health Performance"
      subtitle="Overall device health and availability"
      tone="emerald"
    >
      <div className="grid gap-8 md:grid-cols-[200px_minmax(0,1fr)]">
        <div className={`grid place-items-center rounded-xl border p-6 shadow-inner ${GLASS_TONES[tone] || GLASS_TONES.emerald}`}>
          <div
            className="analytics-donut grid h-36 w-36 place-items-center rounded-full border-[10px] bg-white shadow-sm ring-4 ring-white/70"
            style={{
              borderColor:
                tone === "emerald" ? "rgba(16, 185, 129, 0.45)" :
                tone === "amber" ? "rgba(245, 158, 11, 0.45)" :
                "rgba(244, 63, 94, 0.45)",
              backgroundColor: 
                tone === "emerald" ? "rgba(16, 185, 129, 0.05)" :
                tone === "amber" ? "rgba(245, 158, 11, 0.05)" :
                "rgba(244, 63, 94, 0.05)",
              transition: "border-color 700ms ease, background-color 700ms ease, box-shadow 700ms ease",
            }}
          >
            <div className="text-center font-ui">
              <strong className={`block text-4xl font-bold tracking-tight ${STATUS_TONES[tone].split(' ')[0]}`}>{analytics.health}%</strong>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Device Health</span>
            </div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {factors.map((factor) => {
            const Icon = factor.icon;
            return (
              <div className="group rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm transition-all duration-300 hover:border-slate-300 hover:shadow-md font-ui" key={factor.label}>
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex min-w-0 items-center gap-2.5 text-xs font-bold text-slate-700 uppercase tracking-tight">
                    <span className={`p-1.5 rounded-lg border shadow-sm transition-transform group-hover:scale-110 ${ICON_TONES[factor.color] || ICON_TONES.blue}`}>
                      <Icon size={14} strokeWidth={2.5} />
                    </span>
                    <span>{factor.label}</span>
                  </span>
                  <span className="shrink-0 text-xs font-bold font-data text-slate-400 tabular-nums">{clamp(factor.value)}%</span>
                </div>
                <ProgressBar value={clamp(factor.value)} color={factor.color} height="h-1.5" className="mt-4" />
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

function AlertTrendsPanel({ analytics, loading }) {
  return (
    <Panel
      icon={BadgeAlert}
      loading={loading}
      title="Device Warnings"
      subtitle="Critical alert trends and incident logs"
      tone="rose"
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <Sparkline color="#f43f5e" label="Alert count trend" points={analytics.alertTrend} />
        <div className="space-y-3 font-ui">
          <div className="rounded-xl border border-rose-100/70 bg-rose-50/60 p-4 shadow-sm shadow-rose-900/5 backdrop-blur-md">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-xs font-bold text-rose-700 uppercase tracking-wider">
                <AlertTriangle className="text-rose-500" size={15} />
                Active Alerts
              </span>
              <strong className="text-xl font-bold text-rose-900 font-data tabular-nums">{analytics.alerts}</strong>
            </div>
          </div>
          
          <div className="flex flex-col gap-2 max-h-[220px] overflow-auto custom-scrollbar pr-1">
            {analytics.topAlerts.length ? analytics.topAlerts.map((alert) => (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-rose-100/60 bg-rose-50/35 p-3 shadow-sm shadow-rose-900/5 transition-colors hover:border-rose-200 hover:bg-rose-50/60" key={alert.name}>
                <span className="inline-flex min-w-0 items-center gap-2.5 text-xs font-bold text-slate-600">
                  <div className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                  <span className="truncate">{alert.name}</span>
                </span>
                <span className="shrink-0 text-[10px] font-bold text-rose-500 font-data tabular-nums">{alert.count}</span>
              </div>
            )) : (
              <p className="rounded-lg bg-slate-50 p-6 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">
                System Operational
              </p>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function DeviceComparisonPanel({ devices, loading, rangeKey }) {
  return (
    <Panel
      icon={Laptop}
      loading={loading}
      title="Device Comparison"
      subtitle="Selected devices ranked by health"
      tone="blue"
    >
      <MultiLineChart devices={devices} rangeKey={rangeKey} />
      <div className="mt-8 max-h-[460px] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100 custom-scrollbar">
        <div className="hidden grid-cols-[1.3fr_0.7fr_0.7fr_0.7fr] bg-slate-50 border-b border-slate-200 px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 md:grid font-ui">
          <span>Hostname</span>
          <span className="text-center">Health</span>
          <span className="text-center">Load</span>
          <span className="text-right">Status</span>
        </div>
        <div className="divide-y divide-slate-100 font-data">
          {devices.length ? devices.map((device) => {
            const health = getHealthScore(device);
            const load = getDeviceLoad(device);
            const isOutlier = health < 65 || load > 82;

            return (
              <div className="grid gap-3 p-4 text-sm transition-colors hover:bg-slate-50/50 md:grid-cols-[1.3fr_0.7fr_0.7fr_0.7fr] md:items-center md:px-6" key={device.id}>
                <span className="font-bold text-slate-800 tracking-tight font-ui truncate">{device.hostname}</span>
                <span className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 tabular-nums text-slate-600 font-bold md:block md:bg-transparent md:p-0 md:text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 md:hidden">Health</span>
                  {health}%
                </span>
                <span className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 tabular-nums text-slate-600 font-bold md:block md:bg-transparent md:p-0 md:text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 md:hidden">Load</span>
                  {load}%
                </span>
                <div className="flex justify-start font-ui md:justify-end">
                  <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight border transition-all ${isOutlier ? "bg-rose-50 text-rose-700 border-rose-100" : "bg-emerald-50 text-emerald-700 border-emerald-100"}`}>
                    <div className={`h-1 w-1 rounded-full ${isOutlier ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                    {isOutlier ? "Review" : "Standard"}
                  </span>
                </div>
              </div>
            );
          }) : (
            <p className="p-12 text-center text-xs font-bold text-slate-300 uppercase tracking-widest font-ui">No devices selected</p>
          )}
        </div>
      </div>
    </Panel>
  );
}

function HeatmapPanel({ devices, loading }) {
  return (
    <Panel
      icon={BarChart3}
      loading={loading}
      title="Group Heatmap"
      subtitle="Device status by group"
      tone="teal"
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {devices.length ? devices.map((device) => {
          const score = getHealthScore(device);
          const tone = getStatusTone(score);
          return (
            <div className={`group relative rounded-xl border p-5 transition-all hover:-translate-y-1 hover:shadow-lg cursor-help ${HEATMAP_STATUS_STYLES[tone]}`} key={device.id} title={`${device.hostname}: ${score}% health`}>
              <p className="truncate text-[10px] font-bold uppercase tracking-wider opacity-60 mb-2 font-ui">{device.hostname}</p>
              <p className="text-3xl font-bold tracking-tight font-data tabular-nums">{score}</p>
              <div className={`absolute top-2 right-2 h-1.5 w-1.5 rounded-full transition-colors ${score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`} />
            </div>
          );
        }) : (
          <div className="col-span-full rounded-xl bg-slate-50 border border-dashed border-slate-200 p-20 text-center text-xs font-bold text-slate-400 uppercase tracking-widest font-ui">
            Waiting for Device Signal...
          </div>
        )}
      </div>
    </Panel>
  );
}

function DistributionPanel({ analytics, loading }) {
  const bars = [
    { label: "CPU Usage", value: analytics.cpu, icon: Cpu, color: "rose" },
    { label: "Memory Load", value: analytics.ram, icon: MemoryStick, color: "blue" },
    { label: "Disk I/O", value: analytics.disk, icon: HardDrive, color: "amber" },
  ];

  return (
    <Panel
      icon={LineChart}
      loading={loading}
      title="Resource Distribution"
      subtitle="Resource use across active devices"
      tone="amber"
    >
      <div className="space-y-6 flex flex-col justify-center flex-1">
        {bars.map((bar) => {
          const Icon = bar.icon;
          return (
            <div key={bar.label} className="group font-ui">
              <div className="mb-3 flex items-center justify-between gap-4">
                <span className="inline-flex min-w-0 items-center gap-3">
                  <span className={`p-1.5 rounded-lg border shadow-sm transition-transform group-hover:scale-110 ${ICON_TONES[bar.color] || ICON_TONES.blue}`}>
                    <Icon size={14} strokeWidth={2.5} />
                  </span>
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-tight">{bar.label}</span>
                </span>
                <span className="shrink-0 text-xs font-bold text-slate-900 font-data tabular-nums">{bar.value}% <span className="text-[10px] text-slate-400 uppercase ml-1">avg</span></span>
              </div>
              <ProgressBar value={bar.value} color={bar.color} height="h-1.5" />
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function EventTimelinePanel({ analytics, loading }) {
  const events = [
    ...analytics.topIssues.map((item) => ({
      title: item.issue,
      detail: item.device.hostname,
      time: formatTimeAgo(getLastSeenAt(item.device)),
      warning: true,
      offline: false,
    })),
    ...analytics.recentDevices.slice(0, 3).map((device) => ({
      title: device.status === "online" ? "Device checked in" : "Device offline",
      detail: device.hostname,
      time: formatTimeAgo(getLastSeenAt(device)),
      warning: false,
      offline: device.status !== "online",
    })),
  ].slice(0, 6);

  return (
    <Panel
      icon={Activity}
      loading={loading}
      title="Incident History"
      subtitle="Chronological log of device alerts"
      tone="blue"
    >
      <div className="space-y-4 flex max-h-[380px] flex-col overflow-auto pr-1 custom-scrollbar">
        {events.length ? events.map((event, index) => (
          <div className="flex gap-4 rounded-xl bg-white border border-slate-200/60 p-4 transition hover:bg-slate-50/50 hover:shadow-sm" key={`${event.title}-${index}`}>
            <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${
              event.warning
                ? "bg-rose-50 border-rose-100 text-rose-500"
                : event.offline
                  ? "bg-rose-50 border-rose-100 text-rose-500"
                  : "bg-emerald-50 border-emerald-100 text-emerald-500"
            }`}>
              {event.warning ? <AlertTriangle size={16} /> : event.offline ? <WifiOff size={16} /> : <CheckCircle2 size={16} />}
            </span>
            <div className="min-w-0 flex-1 font-ui">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-bold text-slate-800 leading-tight truncate">{event.title}</p>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter whitespace-nowrap pt-0.5 font-data">{event.time}</span>
              </div>
              <p className="mt-1 text-xs font-medium text-slate-500 tracking-tight truncate">{event.detail}</p>
            </div>
          </div>
        )) : (
          <div className="flex-1 grid place-items-center rounded-xl bg-slate-50/50 border border-dashed border-slate-200">
             <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest font-ui">No Recorded Events</p>
          </div>
        )}
      </div>
    </Panel>
  );
}

function TopIssuesPanel({ analytics, loading }) {
  return (
    <Panel
      icon={AlertTriangle}
      loading={loading}
      title="Issue Summary"
      subtitle="Consolidated failure and warning metrics"
      tone="rose"
    >
      <div className="grid max-h-[380px] grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 overflow-auto pr-1 custom-scrollbar">
        {(analytics.topAlerts.length ? analytics.topAlerts : [{ name: "Standard", count: 0 }]).map((issue) => (
          <button
            className="group flex items-center justify-between gap-4 rounded-xl border border-slate-200/60 bg-white p-4 text-left transition hover:border-slate-300 hover:shadow-md ring-1 ring-slate-100"
            key={issue.name}
            title={`Drill-down: ${issue.name}`}
            type="button"
          >
            <div className="flex items-center gap-3 font-ui">
              <div className="p-2 rounded-lg bg-slate-50 text-slate-400 border border-slate-200/60 transition group-hover:bg-rose-500 group-hover:text-white group-hover:border-rose-500 shadow-sm">
                <AlertTriangle size={14} />
              </div>
              <span className="text-sm font-bold text-slate-700 tracking-tight truncate">{issue.name}</span>
            </div>
            <span className="shrink-0 text-xs font-bold text-slate-400 font-data tabular-nums">
              {issue.count}
            </span>
          </button>
        ))}
      </div>
    </Panel>
  );
}

function StatusTransitionsPanel({ analytics, loading }) {
  return (
    <Panel
      icon={Radio}
      loading={loading}
      title="Device Activity"
      subtitle="Recent heartbeat and connection deltas"
      tone="emerald"
    >
      <div className="space-y-3 flex flex-col flex-1">
        {analytics.statusChanges.length ? analytics.statusChanges.map((device) => (
          <div className="flex items-center justify-between gap-4 rounded-xl bg-white border border-slate-200/60 p-4 shadow-sm transition hover:bg-slate-50/50 hover:border-slate-200" key={device.id}>
            <div className="min-w-0 font-ui">
              <span className="block text-sm font-bold text-slate-800 tracking-tight truncate">{device.hostname}</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-data">{formatTimeAgo(getLastSeenAt(device))}</span>
            </div>
            <StatusBadge status={device.status} />
          </div>
        )) : (
          <div className="flex-1 grid place-items-center rounded-xl bg-slate-50/50 border border-dashed border-slate-200 font-ui">
             <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Awaiting Transition Logs</p>
          </div>
        )}
      </div>
    </Panel>
  );
}

function GroupPerformancePanel({ analytics, loading }) {
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const groups = analytics.groupStats || [];
  const activeIndex = groups.length ? Math.min(activeGroupIndex, groups.length - 1) : 0;

  useEffect(() => {
    if (activeGroupIndex >= groups.length) {
      setActiveGroupIndex(0);
    }
  }, [activeGroupIndex, groups.length]);

  function showPreviousGroup() {
    if (!groups.length) return;
    setActiveGroupIndex((currentIndex) => (currentIndex === 0 ? groups.length - 1 : currentIndex - 1));
  }

  function showNextGroup() {
    if (!groups.length) return;
    setActiveGroupIndex((currentIndex) => (currentIndex + 1) % groups.length);
  }

  return (
    <Panel
      icon={Gauge}
      loading={loading}
      title="Group Performance"
      subtitle="Metrics breakdown by logical grouping"
      tone="teal"
      action={
        groups.length > 1 ? (
          <div className="flex items-center gap-2">
            <button
              className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-600"
              onClick={showPreviousGroup}
              title="Previous group"
              type="button"
            >
              <ChevronLeft size={16} strokeWidth={2.5} />
            </button>
            <button
              className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-600"
              onClick={showNextGroup}
              title="Next group"
              type="button"
            >
              <ChevronRight size={16} strokeWidth={2.5} />
            </button>
          </div>
        ) : null
      }
    >
      <div className="flex flex-1 flex-col">
        {groups.length ? (
          <>
            {groups.map((group, index) => (
          <div
            className={`rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-500 hover:shadow-md ${index === activeIndex ? "block opacity-100 translate-x-0" : "hidden opacity-0 translate-x-4"}`}
            key={group.name}
          >
            <div className="flex items-center justify-between gap-4 border-b border-slate-200/60 pb-4 mb-5">
              <div className="flex items-center gap-3 font-ui">
                <span className="p-2 rounded-lg bg-teal-50 text-teal-600 border border-teal-100">
                  <Users size={15} />
                </span>
                <span className="text-base font-bold text-slate-800 tracking-tight truncate">{group.name}</span>
              </div>
              <span className="badge-minimal bg-slate-50 border-slate-200/60 font-ui">
                {group.count} Devices
              </span>
            </div>
            <div className="grid gap-5">
              <div>
                <div className="mb-2 flex justify-between items-center px-0.5 font-ui">
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <ShieldCheck size={12} className="text-emerald-500/70" />
                    Health Index
                  </span>
                  <span className="text-sm font-bold text-emerald-600 font-data tabular-nums">{group.health}%</span>
                </div>
                <ProgressBar value={group.health} color="emerald" height="h-1.5" />
              </div>
              <div>
                <div className="mb-2 flex justify-between items-center px-0.5 font-ui">
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <Zap size={12} className="text-blue-500/70" />
                    Current Load
                  </span>
                  <span className="text-sm font-bold text-blue-600 font-data tabular-nums">{group.load}%</span>
                </div>
                <ProgressBar value={group.load} color="blue" height="h-1.5" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  { label: "CPU", value: `${group.cpu}%`, tone: "rose" },
                  { label: "RAM", value: `${group.ram}%`, tone: "blue" },
                  { label: "Disk", value: `${group.disk}%`, tone: "amber" },
                  { label: "CPU Temp", value: formatTemperature(group.cpuTemperature), tone: "rose" },
                  { label: "Latency", value: group.latencyMs == null ? "Unknown" : `${Math.round(Number(group.latencyMs))}ms`, tone: "teal" },
                  { label: "Devices", value: group.count, tone: "slate" },
                ].map((item) => (
                  <div className={`rounded-lg border p-3 shadow-sm ${GLASS_TONES[item.tone] || GLASS_TONES.slate}`} key={item.label}>
                    <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-slate-400 font-ui">{item.label}</p>
                    <p className="truncate text-sm font-bold text-slate-700 font-data tabular-nums">{item.value}</p>
                  </div>
                ))}
              </div>
              
              <div className="hidden">
                <div className="rounded-lg bg-slate-50/80 p-3 border border-slate-200/60">
                  <p className="text-[9px] font-bold uppercase text-slate-400 tracking-widest mb-1.5 border-b border-slate-200/60/50 pb-1 font-ui">Resources</p>
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-600 font-data tabular-nums">
                    <span>C:{group.cpu}%</span>
                    <span className="text-slate-200">|</span>
                    <span>R:{group.ram}%</span>
                    <span className="text-slate-200">|</span>
                    <span>D:{group.disk}%</span>
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50/80 p-3 border border-slate-200/60">
                  <p className="text-[9px] font-bold uppercase text-slate-400 tracking-widest mb-1.5 border-b border-slate-200/60/50 pb-1 font-ui">Environment</p>
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-600 font-data tabular-nums truncate">
                    <span>{formatTemperature(group.cpuTemperature)}</span>
                    <span className="text-slate-200">|</span>
                    <span>{group.latencyMs == null ? "Unknown" : `${Math.round(Number(group.latencyMs))}ms`}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
            ))}
            {groups.length > 1 ? (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {groups.map((group, index) => (
                  <button
                    className={`h-2 rounded-full transition-all duration-300 ${
                      index === activeIndex
                        ? "w-6 bg-teal-500 shadow-sm shadow-teal-900/20"
                        : "w-2 bg-teal-100 hover:bg-teal-300"
                    }`}
                    key={`dot-${group.name}`}
                    onClick={() => setActiveGroupIndex(index)}
                    title={`Show ${group.name}`}
                    type="button"
                    aria-label={`Show ${group.name}`}
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex-1 grid place-items-center rounded-xl bg-slate-50/50 border border-dashed border-slate-200 font-ui">
             <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">No groups available</p>
          </div>
        )}
      </div>
    </Panel>
  );
}

function PeripheralSummaryPanel({ analytics, loading }) {
  const p = analytics.peripherals || { totalMissing: 0, devicesWithMissing: 0, groups: [], byDevice: [] };
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const groups = p.groups || [];
  const activeIndex = groups.length ? Math.min(activeGroupIndex, groups.length - 1) : 0;

  function showPrevious() {
    if (!groups.length) return;
    setActiveGroupIndex((i) => (i === 0 ? groups.length - 1 : i - 1));
  }

  function showNext() {
    if (!groups.length) return;
    setActiveGroupIndex((i) => (i + 1) % groups.length);
  }

  return (
    <Panel
      icon={Plug}
      loading={loading}
      title="Peripheral Status"
      subtitle="Inventory tracking and missing hardware detection"
      tone="teal"
      action={
        groups.length > 1 ? (
          <div className="flex items-center gap-2">
            <button
              className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-600"
              onClick={showPrevious}
              type="button"
            >
              <ChevronLeft size={16} strokeWidth={2.5} />
            </button>
            <button
              className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-600"
              onClick={showNext}
              type="button"
            >
              <ChevronRight size={16} strokeWidth={2.5} />
            </button>
          </div>
        ) : null
      }
    >
      <div className="space-y-5 flex flex-col flex-1">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-4 shadow-sm">
            <p className="text-[9px] font-bold uppercase tracking-widest text-rose-500 mb-1 font-ui">Missing Total</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-rose-700 font-data tabular-nums">{p.totalMissing}</span>
              <Unplug size={14} className="text-rose-400" />
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 shadow-sm">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1 font-ui">Affected Units</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-700 font-data tabular-nums">{p.devicesWithMissing}</span>
              <Laptop size={14} className="text-slate-400" />
            </div>
          </div>
        </div>

        {groups.length ? (
          <div className="flex-1">
            {groups.map((group, index) => (
              <div key={group.name} className={`${index === activeIndex ? "block animate-in fade-in slide-in-from-right-2" : "hidden"}`}>
                <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3 font-ui">
                   <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Current Group</p>
                      <h4 className="text-sm font-bold text-slate-800 truncate">{group.name}</h4>
                   </div>
                   <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Verified</p>
                      <p className="text-xs font-bold text-emerald-600 font-data">
                        {group.totalPeripherals - group.missingPeripherals} / {group.totalPeripherals}
                      </p>
                   </div>
                </div>
                
                <div className="space-y-2 max-h-[220px] overflow-auto custom-scrollbar pr-1">
                  {p.byDevice.filter(d => d.group === group.name).map(device => (
                    <div key={device.id} className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${device.missing > 0 ? "border-rose-100 bg-rose-50/30 hover:bg-rose-50/60" : "border-slate-100 bg-white hover:bg-slate-50"}`}>
                      <span className="text-xs font-bold text-slate-700 truncate mr-2 font-ui">{device.hostname}</span>
                      <div className="flex shrink-0 items-center gap-3">
                        <div className="flex -space-x-1.5">
                          {Array.from({ length: Math.min(5, device.connected) }).map((_, i) => (
                            <div key={i} className="h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-white" />
                          ))}
                          {Array.from({ length: Math.min(5, device.missing) }).map((_, i) => (
                            <div key={i} className="h-2 w-2 rounded-full bg-rose-400 ring-2 ring-white animate-pulse" />
                          ))}
                        </div>
                        <span className={`text-[10px] font-bold uppercase font-data ${device.missing > 0 ? "text-rose-500" : "text-emerald-500"}`}>
                          {device.missing > 0 ? `${device.missing} missing` : "Verified"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 grid place-items-center rounded-xl bg-slate-50/50 border border-dashed border-slate-200 font-ui text-center p-8">
             <Plug size={24} className="text-slate-300 mb-2 opacity-50" />
             <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest leading-relaxed">Collecting inventory data<br/>across all groups...</p>
          </div>
        )}
      </div>
    </Panel>
  );
}

function ExportPanel({ analytics, loading, onExport, exportingType }) {
  const exportMethods = [
    {
      id: "csv",
      label: "Export CSV",
      subtitle: "Excel spreadsheet report",
      icon: FileSpreadsheet,
      color: "bg-emerald-600",
      shadow: "shadow-emerald-200",
      hover: "hover:bg-emerald-700 hover:shadow-emerald-300",
      activeShadow: "shadow-emerald-900/20",
      iconBg: "bg-white/20",
      text: "text-emerald-50/70",
      chevron: "text-emerald-100/40",
    },
    {
      id: "pdf",
      label: "Export PDF",
      subtitle: "Visual summary report",
      icon: FileBarChart,
      color: "bg-rose-600",
      shadow: "shadow-rose-200",
      hover: "hover:bg-rose-700 hover:shadow-rose-300",
      activeShadow: "shadow-rose-900/20",
      iconBg: "bg-white/20",
      text: "text-rose-50/70",
      chevron: "text-rose-100/40",
    },
    {
      id: "docx",
      label: "Export DOCX",
      subtitle: "Word document format",
      icon: FileText,
      color: "bg-blue-600",
      shadow: "shadow-blue-200",
      hover: "hover:bg-blue-700 hover:shadow-blue-300",
      activeShadow: "shadow-blue-900/20",
      iconBg: "bg-white/20",
      text: "text-blue-50/70",
      chevron: "text-blue-100/40",
    },
  ];

  return (
    <Panel
      icon={Download}
      loading={loading}
      title="Export Data"
      subtitle="Download organized device and group reports"
      tone="indigo"
    >
      <div className="flex flex-col flex-1 pt-4">
        <div className="space-y-4">
          <div className="grid gap-3">
            {exportMethods.map((method) => {
              const isExporting = exportingType === method.id;
              const Icon = method.icon;

              return (
                <button
                  key={method.id}
                  className={`group relative w-full overflow-hidden rounded-xl ${method.color} px-5 py-4 text-white shadow-lg ${method.shadow} transition-all duration-300 ${method.hover} active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed`}
                  disabled={loading || (exportingType && !isExporting)}
                  onClick={() => onExport(method.id)}
                  title={method.label}
                  type="button"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`rounded-lg ${method.iconBg} p-2 text-white shadow-inner border border-white/10`}>
                        {isExporting ? (
                          <RefreshCcw size={18} className="animate-spin" />
                        ) : (
                          <Icon size={18} strokeWidth={2.5} />
                        )}
                      </div>
                      <div className="min-w-0 text-left font-ui">
                        <p className="text-sm font-bold leading-tight tracking-tight">
                          {isExporting ? `Preparing ${method.id.toUpperCase()}...` : method.label}
                        </p>
                        <p className={`mt-0.5 text-[9px] font-medium uppercase tracking-[0.15em] ${method.text}`}>
                          {method.subtitle}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className={`shrink-0 ${method.chevron} transition-transform duration-300 group-hover:translate-x-1 group-hover:text-white`} size={18} />
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between rounded-xl border border-slate-200/60 bg-slate-50/50 p-4 transition-all duration-300 hover:border-slate-300 hover:bg-white hover:shadow-sm group">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-500 border border-rose-100 shadow-sm transition-transform duration-300 group-hover:scale-105">
                <BadgeAlert size={18} strokeWidth={2.5} />
              </div>
              <div className="min-w-0 font-ui">
                <p className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  Attention Required
                </p>
                <p className="truncate text-sm font-bold text-slate-700">
                  {analytics.criticalAlerts} critical issues found
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function AnalyticsPage({ dashboardData = {}, loading = false }) {
  const [rangeKey, setRangeKey] = useState("24h");
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [analyticsData, setAnalyticsData] = useState(EMPTY_ANALYTICS);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState("");
  const [exportingType, setExportingType] = useState(null);
  const refreshIntervalMs = useTelemetryInterval();
  const groupOptions = useMemo(
    () => [
      ...new Set([
        ...(dashboardData.clients || []).map((device) => device.group || "Unassigned"),
        ...(analyticsData.groups || []).map((group) => group.name).filter(Boolean),
      ]),
    ],
    [analyticsData.groups, dashboardData.clients],
  );
  const analytics = useMemo(() => normalizeApiAnalytics(analyticsData), [analyticsData]);
  const pageLoading = loading || analyticsLoading;

  useEffect(() => {
    let active = true;
    let refreshTimer;
    let isFetching = false;

    async function loadAnalytics({ background = false } = {}) {
      if (isFetching) return;
      
      if (!background) {
        setAnalyticsLoading(true);
      }
      setAnalyticsError("");
      isFetching = true;

      try {
        const nextAnalytics = await analyticsApi.getAnalytics({
          range: rangeKey,
          group: selectedGroup,
        });

        if (active) {
          setAnalyticsData(nextAnalytics || EMPTY_ANALYTICS);
        }
      } catch (error) {
        if (active) {
          setAnalyticsError(error.message || "Unable to load analytics.");
          setAnalyticsData(EMPTY_ANALYTICS);
        }
      } finally {
        isFetching = false;
        if (active) {
          setAnalyticsLoading(false);
        }
      }
    }

    loadAnalytics();
    refreshTimer = setInterval(() => {
      loadAnalytics({ background: true });
    }, refreshIntervalMs);

    return () => {
      active = false;
      clearInterval(refreshTimer);
    };
  }, [rangeKey, selectedGroup, refreshIntervalMs]);

  async function handleExport(type) {
    setExportingType(type);
    setAnalyticsError("");

    try {
      if (type === "csv") {
        await analyticsApi.downloadAnalyticsCsv({
          range: rangeKey,
          group: selectedGroup,
        });
      } else if (type === "pdf") {
        await analyticsApi.downloadAnalyticsPdf({
          range: rangeKey,
          group: selectedGroup,
        });
      } else if (type === "docx") {
        await analyticsApi.downloadAnalyticsDocx({
          range: rangeKey,
          group: selectedGroup,
        });
      }
    } catch (error) {
      setAnalyticsError(error.message || `Unable to export ${type.toUpperCase()}.`);
    } finally {
      setExportingType(null);
    }
  }

  return (
    <div className="analytics-shell w-full min-w-0 space-y-6 rounded-lg" aria-busy={pageLoading}>
      <div className="space-y-6">
        <PageHeader
          icon={Activity}
          title="Lab health and device performance"
          subtitle="Live analytics for metrics, warning trends, device comparison, and export-ready summaries."
          backgroundImage="/analytics_header.jpg"
          action={
            <div className="hidden sm:flex items-center gap-3 font-ui">
              <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-400 shadow-xl shadow-black/20 backdrop-blur-md">
                <Wifi size={14} />
                {analytics.online} online
              </span>
              <span className="inline-flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-400 shadow-xl shadow-black/20 backdrop-blur-md">
                <BadgeAlert size={14} />
                {analytics.criticalAlerts} critical
              </span>
              <span className="inline-flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs font-bold text-blue-400 shadow-xl shadow-black/20 backdrop-blur-md">
                <Boxes size={14} />
                {pageLoading ? "Refreshing" : `${analytics.total} devices`}
              </span>
            </div>
          }
        >
          <div className="pt-2">
            <TimeRangeToolbar
              groupOptions={groupOptions}
              loading={pageLoading}
              rangeKey={rangeKey}
              selectedGroup={selectedGroup}
              setSelectedGroup={setSelectedGroup}
              setRangeKey={setRangeKey}
              dark={true}
            />
          </div>
          {analyticsError ? (
            <p className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-400 backdrop-blur-md font-ui">
              {analyticsError}
            </p>
          ) : null}
        </PageHeader>

        <div className="grid min-w-0 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          <MetricCard icon={ShieldCheck} label="Health Score" value={`${analytics.health}%`} detail="Calculated from live signals" loading={pageLoading} tone="emerald" />
          <MetricCard icon={Cpu} label="Average CPU" value={`${analytics.cpu}%`} detail={`${analytics.pressure}% fleet pressure`} loading={pageLoading} tone="rose" />
          <MetricCard icon={CircuitBoard} label="Average RAM" value={`${analytics.ram}%`} detail={`${formatUptime(analytics.uptime)} avg uptime`} loading={pageLoading} tone="blue" />
          <MetricCard icon={Database} label="Average Disk" value={`${analytics.disk}%`} detail={`${analytics.offline} offline devices`} loading={pageLoading} tone="amber" />
        </div>

        <div className="grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
          <HealthScorePanel analytics={analytics} loading={pageLoading} />
          <AlertTrendsPanel analytics={analytics} loading={pageLoading} />
        </div>

        <div className="grid min-w-0 gap-6">
          <AgentMetricsPanel analytics={analytics} loading={pageLoading} />
        </div>

        <div className="grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <DeviceComparisonPanel devices={analytics.outliers} loading={pageLoading} rangeKey={rangeKey} />
          <HeatmapPanel devices={analytics.allDevices} loading={pageLoading} />
        </div>

        <div className="grid min-w-0 gap-6 xl:grid-cols-3">
          <DistributionPanel analytics={analytics} loading={pageLoading} />
          <EventTimelinePanel analytics={analytics} loading={pageLoading} />
          <TopIssuesPanel analytics={analytics} loading={pageLoading} />
        </div>

        <div className="grid min-w-0 gap-6 xl:grid-cols-3 2xl:grid-cols-4">
          <StatusTransitionsPanel analytics={analytics} loading={pageLoading} />
          <GroupPerformancePanel analytics={analytics} loading={pageLoading} />
          <PeripheralSummaryPanel analytics={analytics} loading={pageLoading} />
          <ExportPanel analytics={analytics} exportingType={exportingType} loading={pageLoading} onExport={handleExport} />
        </div>
      </div>
    </div>
  );
}
//harvey pogi
