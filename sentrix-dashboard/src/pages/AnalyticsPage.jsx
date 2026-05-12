import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BadgeAlert,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Cpu,
  Download,
  Filter,
  Gauge,
  HardDrive,
  Laptop,
  LineChart,
  MemoryStick,
  Radio,
  RefreshCcw,
  ShieldCheck,
  Timer,
  Wifi,
} from "lucide-react";
import { SentrixLogoLoader } from "../components/SentrixLogo.jsx";
import * as analyticsApi from "../services/analyticsApi.js";

const timeRanges = [
  { key: "24h", label: "Last 24h", points: ["12a", "4a", "8a", "12p", "4p", "Now"] },
  { key: "7d", label: "7d", points: ["Mon", "Tue", "Wed", "Thu", "Fri", "Now"] },
  { key: "30d", label: "30d", points: ["W1", "W2", "W3", "W4", "W5", "Now"] },
];

const emptyAnalytics = {
  range: { key: "24h", label: "Last 24 hours" },
  generatedAt: null,
  filters: { group: "all" },
  totals: { total: 0, online: 0, offline: 0 },
  averages: { cpu: 0, ram: 0, disk: 0, uptime: 0, load: 0, health: 0 },
  alerts: { total: 0, critical: 0, byType: [], active: [] },
  trends: { cpu: [], ram: [], disk: [], health: [], alerts: [] },
  groups: [],
  devices: { topLoad: [], outliers: [], recent: [], rows: [] },
  exportUrls: { csv: "" },
  dataQuality: {
    realMetrics: [],
    storedHistory: false,
    unavailableMetrics: [],
    notes: [],
  },
};

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return "No heartbeat";

  const minutes = Math.max(0, Math.floor((Date.now() - Number(timestamp)) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function getLastSeenAt(device) {
  return device.lastSeenAt ?? device.last_seen_at;
}

function formatUptime(seconds = 0) {
  const hours = Math.floor((Number(seconds) || 0) / 3600);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function getDeviceLoad(device) {
  if (Number.isFinite(Number(device.load))) {
    return Number(device.load);
  }

  const metrics = device.metrics || {};
  return Math.round(
    (clamp(metrics.cpu) + clamp(metrics.ram) + clamp(metrics.disk)) / 3,
  );
}

function getHealthScore(device) {
  if (Number.isFinite(Number(device.health))) {
    return Number(device.health);
  }

  const load = getDeviceLoad(device);
  const statusPenalty = device.status === "online" ? 0 : 34;

  return clamp(Math.round(100 - load * 0.32 - statusPenalty));
}

function getDeviceIssues(device) {
  if (Array.isArray(device.issues)) {
    return device.issues;
  }

  const metrics = device.metrics || {};
  const issues = [];

  if (device.status !== "online") issues.push("Offline");
  if (clamp(metrics.cpu) >= 85) issues.push("High CPU");
  if (clamp(metrics.ram) >= 85) issues.push("High RAM");
  if (clamp(metrics.disk) >= 90) issues.push("Disk pressure");

  return issues;
}

function normalizeApiAnalytics(data = emptyAnalytics) {
  const safeData = data || emptyAnalytics;
  const totals = safeData.totals || emptyAnalytics.totals;
  const averages = safeData.averages || emptyAnalytics.averages;
  const alerts = safeData.alerts || emptyAnalytics.alerts;
  const trends = safeData.trends || emptyAnalytics.trends;
  const devices = safeData.devices || emptyAnalytics.devices;
  const dataQuality = safeData.dataQuality || emptyAnalytics.dataQuality;
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
    healthTrend: trends.health || [],
    alertTrend: trends.alerts || [],
    topAlerts: alerts.byType || [],
    topIssues,
    topDevices: devices.topLoad || [],
    outliers: devices.outliers || [],
    recentDevices: devices.recent || [],
    statusChanges: devices.recent || [],
    allDevices: devices.rows || [],
    groupStats: safeData.groups || [],
    exportUrls: safeData.exportUrls || {},
    dataQuality,
  };
}

function getStatusTone(score) {
  if (score >= 80) return "emerald";
  if (score >= 60) return "amber";
  return "red";
}

function buildSmoothSvgPath(coordinates, step) {
  return coordinates
    .map((point, index) => {
      if (index === 0) return `M ${point.x} ${point.y}`;

      const previous = coordinates[index - 1];
      const controlOffset = step * 0.42;
      return `C ${previous.x + controlOffset} ${previous.y}, ${
        point.x - controlOffset
      } ${point.y}, ${point.x} ${point.y}`;
    })
    .join(" ");
}

const iconTones = {
  blue: "border-blue-100 bg-blue-50 text-blue-700",
  rose: "border-rose-100 bg-rose-50 text-rose-700",
  amber: "border-amber-100 bg-amber-50 text-amber-700",
  teal: "border-teal-100 bg-teal-50 text-teal-700",
  emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
  slate: "border-slate-200 bg-slate-50 text-slate-700",
};

function TooltipIcon({ icon: Icon, label, tone = "teal" }) {
  return (
    <span
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border shadow-sm shadow-slate-200/70 ${iconTones[tone]}`}
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
      <span className="inline-flex items-center gap-2 rounded-md border border-blue-100 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm">
        <span className="text-signal">
          <SentrixLogoLoader compact />
        </span>
        Updating
      </span>
    </div>
  );
}

function Panel({ icon, title, subtitle, children, action, loading = false, tone = "teal" }) {
  return (
    <section className="analytics-panel analytics-reveal relative flex h-full min-w-0 flex-col rounded-lg border border-line bg-white p-5 shadow-sm sm:p-6">
      <ModuleLoader loading={loading} />
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <TooltipIcon icon={icon} label={title} tone={tone} />
            <h2 className="text-lg font-bold leading-6 text-slate-950">
              {title}
            </h2>
          </div>
          <p className="mt-1 text-sm leading-5 text-slate-500">{subtitle}</p>
        </div>
        {action}
      </div>
      <div className="flex flex-1 flex-col">{children}</div>
    </section>
  );
}

function MetricCard({ icon: Icon, label, value, detail, tone = "blue", warning = false, loading = false }) {
  return (
    <article
      className="analytics-card analytics-reveal relative rounded-lg border border-line bg-white p-4 shadow-sm"
    >
      <ModuleLoader loading={loading} />
      <div className="grid grid-cols-[minmax(0,1fr)_44px] items-start gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-5 text-slate-500">{label}</p>
          <strong className="mt-3 block text-3xl font-bold leading-none text-slate-950">{value}</strong>
          <span className="mt-2 block text-xs font-medium leading-4 text-slate-500">
            {detail}
          </span>
        </div>
        <span
          className={`analytics-icon grid h-11 w-11 shrink-0 place-items-center rounded-md border shadow-sm ${iconTones[warning ? "rose" : tone]}`}
          title={label}
        >
          {warning ? <BadgeAlert size={20} strokeWidth={2.4} /> : <Icon size={20} strokeWidth={2.4} />}
        </span>
      </div>
    </article>
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
    <div className="rounded-lg border border-slate-100 bg-white p-5 shadow-inner">
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
            className="text-slate-200"
            strokeDasharray="4 6"
            x1="0"
            x2={width}
            y1={line}
            y2={line}
          />
        ))}
        <path className="analytics-area" d={areaPath} fill={color} opacity="0.12" />
        <path
          className="analytics-line"
          d={path}
          fill="none"
          key={`${label}-${points.map((point) => point.value).join("-")}`}
          stroke={color}
          strokeLinecap="round"
          strokeWidth="4"
        />
        {coordinates.map((point, index) => (
          <circle
            className="analytics-point"
            cx={point.x}
            cy={point.y}
            fill="#ffffff"
            key={`${label}-${index}`}
            r="4"
            stroke={color}
            strokeWidth="3"
          />
        ))}
      </svg>
      <div className="mt-4 flex flex-wrap justify-between gap-2 text-center">
        {points.map((point) => (
          <div className="min-w-[70px] rounded-md bg-slate-50 px-2 py-2 shadow-sm ring-1 ring-slate-100" key={point.label}>
            <p className="text-xs font-medium text-slate-500">
              {point.label}
            </p>
            <p className="text-xs font-bold text-slate-700">
              {point.value}%
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MultiLineChart({ devices = [] }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-5 shadow-inner">
      {!devices.length ? (
        <div className="grid min-h-64 place-items-center rounded-lg bg-slate-50 text-sm font-medium text-slate-500">
          No clients available for comparison.
        </div>
      ) : (
        <div className="space-y-4">
          {devices.slice(0, 5).map((device) => {
            const health = getHealthScore(device);
            const load = getDeviceLoad(device);

            return (
              <div key={device.id}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="break-words font-semibold text-slate-800">{device.hostname}</span>
                  <span className="shrink-0 text-xs font-bold text-slate-500">
                    Health {health}% / Load {load}%
                  </span>
                </div>
                <div className="grid gap-2">
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${clamp(health)}%` }} />
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${clamp(load)}%` }} />
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

function TimeRangeToolbar({ rangeKey, setRangeKey, loading, groupOptions, selectedGroup, setSelectedGroup }) {
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <TooltipIcon icon={CalendarDays} label="Select analytics time range" />
        {timeRanges.map((range) => (
          <button
            className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition ${
              rangeKey === range.key
                ? "border-signal bg-signal text-white"
                : "border-line bg-white text-slate-700 shadow-sm hover:border-signal hover:text-signal"
            }`}
            key={range.key}
            onClick={() => setRangeKey(range.key)}
            title={`Show ${range.label} analytics`}
            type="button"
          >
            <Clock3 size={15} />
            {range.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-600 shadow-sm">
          <RefreshCcw className={loading ? "animate-spin" : ""} size={15} />
          {loading ? "Refreshing in background" : "Live data cached"}
        </span>
        <label className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-600 shadow-sm">
          <Filter size={15} />
          <select
            className="bg-transparent text-sm font-semibold outline-none"
            onChange={(event) => setSelectedGroup(event.target.value)}
            title="Filter analytics by group"
            value={selectedGroup}
          >
            <option value="all">All groups</option>
            {groupOptions.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function UnavailableMetricsPanel({ analytics, loading }) {
  const unavailableMetrics = analytics.dataQuality?.unavailableMetrics || [];
  const notes = analytics.dataQuality?.notes || [];
  return (
    <Panel
      icon={Gauge}
      loading={loading}
      title="Metrics Not Reported Yet"
      subtitle="The backend is marking these as unavailable until the agent reports real measurements"
      tone="slate"
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(unavailableMetrics.length ? unavailableMetrics : ["temperature", "networkThroughput", "packetLoss", "latency"]).map((metric) => (
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-4" key={metric}>
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-slate-200 bg-white text-slate-500">
                <AlertTriangle size={16} />
              </span>
              <div className="min-w-0">
                <p className="break-words text-sm font-bold text-slate-800">{metric}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Waiting for agent-side collection.</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      {notes.length ? (
        <div className="mt-4 space-y-2">
          {notes.map((note) => (
            <p className="rounded-md bg-white p-3 text-sm leading-6 text-slate-600 ring-1 ring-slate-100" key={note}>
              {note}
            </p>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}

function HealthScorePanel({ analytics, loading }) {
  const tone = getStatusTone(analytics.health);
  const colors = {
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    red: "text-red-600",
  };
  const factors = [
    { label: "Utilization", value: 100 - analytics.pressure, icon: Gauge },
    { label: "CPU", value: 100 - analytics.cpu, icon: Cpu },
    { label: "RAM", value: 100 - analytics.ram, icon: MemoryStick },
    { label: "Availability", value: analytics.total ? Math.round((analytics.online / analytics.total) * 100) : 0, icon: Radio },
  ];

  return (
    <Panel
      icon={ShieldCheck}
      loading={loading}
      title="Health Score"
      subtitle="Backend score from real agent utilization and availability data"
      tone="emerald"
    >
      <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
        <div className="grid place-items-center rounded-lg border border-slate-100 bg-slate-50 p-5">
          <div className="grid h-40 w-40 place-items-center rounded-full border-[14px] border-slate-200 bg-white">
            <div className="text-center">
              <strong className={`block text-4xl font-bold ${colors[tone]}`}>{analytics.health}%</strong>
              <span className="text-xs font-medium text-slate-500">overall</span>
            </div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {factors.map((factor) => {
            const Icon = factor.icon;
            return (
              <div className="rounded-lg border border-slate-100 bg-white p-3" key={factor.label}>
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-700">
                    <Icon size={15} />
                    <span>{factor.label}</span>
                  </span>
                  <span className="shrink-0 text-sm font-bold">{clamp(factor.value)}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-ocean" style={{ width: `${clamp(factor.value)}%` }} />
                </div>
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
      title="Alert Trends"
      subtitle="Warning count over time, top alerts, and resolution metrics"
      tone="rose"
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Sparkline color="#dc2626" label="Alert count trend" points={analytics.alertTrend} />
        <div className="space-y-3">
          <div className="rounded-lg border border-red-200 bg-red-50/75 p-3 text-red-700 shadow-sm shadow-red-100 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-sm font-bold">
                <AlertTriangle size={15} />
                Active warnings
              </span>
              <strong>{analytics.alerts}</strong>
            </div>
          </div>
          <div className="rounded-lg border border-slate-100 bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-sm font-bold">
                <Timer size={15} />
                Stored history
              </span>
              <strong>{analytics.dataQuality?.storedHistory ? "On" : "Off"}</strong>
            </div>
          </div>
          {analytics.topAlerts.length ? analytics.topAlerts.map((alert) => (
            <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm" key={alert.name}>
              <span className="inline-flex min-w-0 items-center gap-2 font-semibold text-slate-700">
                <BadgeAlert className="shrink-0 text-red-500" size={14} />
                <span>{alert.name}</span>
              </span>
              <span className="shrink-0 rounded-md bg-white px-2 py-1 text-xs font-bold">{alert.count}</span>
            </div>
          )) : (
            <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">
              No active alerts in the selected range.
            </p>
          )}
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
      subtitle="Selected devices ranked by health, load, and outlier risk"
      tone="blue"
    >
      <MultiLineChart devices={devices} rangeKey={rangeKey} />
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <div className="hidden grid-cols-[1.3fr_0.7fr_0.7fr_0.7fr] bg-slate-900 px-4 py-3 text-xs font-bold text-white md:grid">
          <span>Device</span>
          <span>Health</span>
          <span>Load</span>
          <span>Outlier</span>
        </div>
        <div className="divide-y divide-slate-200">
          {devices.length ? devices.map((device) => {
            const health = getHealthScore(device);
            const load = getDeviceLoad(device);
            const isOutlier = health < 65 || load > 82;

            return (
              <div className="grid gap-3 bg-white px-4 py-3 text-sm md:grid-cols-[1.3fr_0.7fr_0.7fr_0.7fr] md:items-center" key={device.id}>
                <span className="min-w-0 break-words font-semibold text-slate-800">{device.hostname}</span>
                <span className="whitespace-nowrap">{health}%</span>
                <span className="whitespace-nowrap">{load}%</span>
                <span className={`inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1 text-xs font-bold backdrop-blur ${isOutlier ? "border-amber-200 bg-amber-50/80 text-amber-700" : "border-emerald-200 bg-emerald-50/80 text-emerald-700"}`}>
                  {isOutlier ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
                  {isOutlier ? "Review" : "Normal"}
                </span>
              </div>
            );
          }) : (
            <p className="p-5 text-center text-sm text-slate-500">No devices available for comparison.</p>
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
      title="Heatmap View"
      subtitle="Device health matrix color-coded by status"
      tone="teal"
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {devices.length ? devices.map((device) => {
          const score = getHealthScore(device);
          const tone = getStatusTone(score);
          const styles = {
            emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
            amber: "border-amber-200 bg-amber-50 text-amber-800",
            red: "border-red-200 bg-red-50 text-red-800",
          };

          return (
            <div className={`min-w-0 rounded-lg border p-3 ${styles[tone]}`} key={device.id} title={`${device.hostname}: ${score}% health`}>
              <p className="break-words text-xs font-bold leading-4">{device.hostname}</p>
              <p className="mt-2 text-2xl font-bold">{score}</p>
            </div>
          );
        }) : (
          <p className="col-span-full rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-500">
            No devices to show.
          </p>
        )}
      </div>
    </Panel>
  );
}

function DistributionPanel({ analytics, loading }) {
  const bars = [
    { label: "CPU", value: analytics.cpu, icon: Cpu, color: "bg-rose-500" },
    { label: "RAM", value: analytics.ram, icon: MemoryStick, color: "bg-blue-500" },
    { label: "Disk", value: analytics.disk, icon: HardDrive, color: "bg-amber-500" },
  ];

  return (
    <Panel
      icon={LineChart}
      loading={loading}
      title="Distribution Charts"
      subtitle="CPU/RAM/Disk distribution across the fleet"
      tone="amber"
    >
      <div className="space-y-4">
        {bars.map((bar) => {
          const Icon = bar.icon;
          return (
            <div key={bar.label}>
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="inline-flex min-w-0 items-center gap-2 font-semibold text-slate-700">
                  <Icon size={15} />
                  <span>{bar.label}</span>
                </span>
                <span className="shrink-0 whitespace-nowrap font-bold">{bar.value}% average</span>
              </div>
              <div className="h-4 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${bar.color}`} style={{ width: `${bar.value}%` }} />
              </div>
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
    })),
    ...analytics.recentDevices.slice(0, 3).map((device) => ({
      title: device.status === "online" ? "Heartbeat received" : "Device offline",
      detail: device.hostname,
      time: formatTimeAgo(getLastSeenAt(device)),
      warning: device.status !== "online",
    })),
  ].slice(0, 6);

  return (
    <Panel
      icon={Activity}
      loading={loading}
      title="Event Timeline"
      subtitle="Significant events correlated with performance dips"
      tone="blue"
    >
      <div className="space-y-3">
        {events.length ? events.map((event, index) => (
          <div className="flex gap-3 rounded-lg bg-slate-50 p-3" key={`${event.title}-${index}`}>
            <span className={`mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-md ${event.warning ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
              {event.warning ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
            </span>
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-slate-800">{event.title}</p>
              <p className="break-words text-xs leading-5 text-slate-500">{event.detail} - {event.time}</p>
            </div>
          </div>
        )) : (
          <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No significant events yet.</p>
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
      title="Top Issues Summary"
      subtitle="Most common problems with quick drill-down cues"
      tone="rose"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {(analytics.topAlerts.length ? analytics.topAlerts : [{ name: "No issues", count: 0 }]).map((issue) => (
          <button
            className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white p-3 text-left transition hover:border-signal"
            key={issue.name}
            title={`Review devices with ${issue.name}`}
            type="button"
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <AlertTriangle size={15} />
              <span className="break-words text-sm font-semibold text-slate-700">{issue.name}</span>
            </span>
            <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-bold">{issue.count}</span>
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
      title="Status Transitions"
      subtitle="Recently online/offline devices and frequent status changes"
      tone="emerald"
    >
      <div className="space-y-3">
        {analytics.statusChanges.length ? analytics.statusChanges.map((device) => (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm" key={device.id}>
            <span className="min-w-0">
              <span className="block break-words font-semibold text-slate-800">{device.hostname}</span>
              <span className="text-xs text-slate-500">{formatTimeAgo(getLastSeenAt(device))}</span>
            </span>
            <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-bold capitalize ${device.status === "online" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              <Wifi size={13} />
              {device.status}
            </span>
          </div>
        )) : (
          <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No transitions to show.</p>
        )}
      </div>
    </Panel>
  );
}

function GroupPerformancePanel({ analytics, loading }) {
  return (
    <Panel
      icon={Gauge}
      loading={loading}
      title="Device Groups Performance"
      subtitle="Backend metrics breakdown by group"
      tone="teal"
    >
      <div className="space-y-3">
        {analytics.groupStats.length ? analytics.groupStats.map((group) => (
          <div className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm" key={group.name}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="break-words font-semibold text-slate-800">{group.name}</span>
              <span className="shrink-0 text-xs font-medium text-slate-500">{group.count} devices</span>
            </div>
            <div className="mt-4 grid gap-3">
              <div>
                <div className="mb-1 flex justify-between text-xs font-semibold text-slate-500">
                  <span>Health</span>
                  <span>{group.health}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${group.health}%` }} />
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs font-semibold text-slate-500">
                  <span>Load</span>
                  <span>{group.load}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-blue-500 transition-all duration-700" style={{ width: `${group.load}%` }} />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <span className="rounded-md bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-700">CPU {group.cpu}%</span>
                <span className="rounded-md bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-700">RAM {group.ram}%</span>
                <span className="rounded-md bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-700">Disk {group.disk}%</span>
              </div>
            </div>
          </div>
        )) : (
          <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No groups available.</p>
        )}
      </div>
    </Panel>
  );
}

function ExportPanel({ analytics, loading, onExportCsv, exporting }) {
  return (
    <Panel
      icon={Download}
      loading={loading}
      title="Export Analytics"
      subtitle="Backend-generated CSV report and alert summary"
      tone="slate"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-70"
          disabled={loading || exporting}
          onClick={onExportCsv}
          title="Export analytics as CSV"
          type="button"
        >
          <Download size={16} />
          {exporting ? "Exporting" : "CSV"}
        </button>
        <div className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-line bg-white px-4 text-sm font-semibold text-slate-700" title="Real-time notification count">
          <BadgeAlert size={16} />
          {analytics.criticalAlerts} critical
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        CSV export uses the authenticated backend analytics report endpoint.
      </p>
    </Panel>
  );
}

export function AnalyticsPage({ dashboardData = {}, loading = false }) {
  const [rangeKey, setRangeKey] = useState("24h");
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [analyticsData, setAnalyticsData] = useState(emptyAnalytics);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState("");
  const [exporting, setExporting] = useState(false);
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

    async function loadAnalytics() {
      setAnalyticsLoading(true);
      setAnalyticsError("");

      try {
        const nextAnalytics = await analyticsApi.getAnalytics({
          range: rangeKey,
          group: selectedGroup,
        });

        if (active) {
          setAnalyticsData(nextAnalytics || emptyAnalytics);
        }
      } catch (error) {
        if (active) {
          setAnalyticsError(error.message || "Unable to load analytics.");
          setAnalyticsData(emptyAnalytics);
        }
      } finally {
        if (active) {
          setAnalyticsLoading(false);
        }
      }
    }

    loadAnalytics();

    return () => {
      active = false;
    };
  }, [rangeKey, selectedGroup]);

  async function handleExportCsv() {
    setExporting(true);
    setAnalyticsError("");

    try {
      await analyticsApi.downloadAnalyticsCsv({
        range: rangeKey,
        group: selectedGroup,
      });
    } catch (error) {
      setAnalyticsError(error.message || "Unable to export analytics CSV.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="analytics-shell w-full min-w-0 space-y-6 rounded-lg bg-white" aria-busy={pageLoading}>
      <div className="space-y-6">
        <section className="analytics-hero analytics-reveal rounded-lg border border-line bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-5">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(260px,420px)] xl:items-center">
              <div className="min-w-0">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-ocean">
                  <Activity size={16} />
                  Analytics
                </p>
                <h1 className="mt-2 text-2xl font-bold tracking-normal text-slate-950 sm:text-3xl">
                  Lab health and device performance
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
                  Backend analytics for real agent metrics, alert trends,
                  device comparisons, and export-ready summaries.
                </p>
                {analyticsError ? (
                  <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                    {analyticsError}
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-100 bg-white px-3 py-3 text-sm font-bold text-emerald-700 shadow-sm">
                  <Wifi size={16} />
                  {analytics.online} online
                </span>
                <span className="inline-flex items-center gap-2 rounded-lg border border-red-100 bg-white px-3 py-3 text-sm font-bold text-red-700 shadow-sm">
                  <BadgeAlert size={16} />
                  {analytics.criticalAlerts} critical
                </span>
                <span className="inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-white px-3 py-3 text-sm font-bold text-blue-700 shadow-sm">
                  <Laptop size={16} />
                  {pageLoading ? "Refreshing" : `${analytics.total} devices`}
                </span>
              </div>
            </div>
            <TimeRangeToolbar
              groupOptions={groupOptions}
              loading={pageLoading}
              rangeKey={rangeKey}
              selectedGroup={selectedGroup}
              setSelectedGroup={setSelectedGroup}
              setRangeKey={setRangeKey}
            />
          </div>
        </section>

        <div className="grid min-w-0 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          <MetricCard icon={ShieldCheck} label="Health Score" value={`${analytics.health}%`} detail="Backend calculated score" loading={pageLoading} tone="teal" />
          <MetricCard icon={Cpu} label="Average CPU" value={`${analytics.cpu}%`} detail={`${analytics.pressure}% fleet pressure`} loading={pageLoading} tone="rose" />
          <MetricCard icon={MemoryStick} label="Average RAM" value={`${analytics.ram}%`} detail={`${formatUptime(analytics.uptime)} avg uptime`} loading={pageLoading} tone="blue" />
          <MetricCard icon={HardDrive} label="Average Disk" value={`${analytics.disk}%`} detail={`${analytics.offline} offline agents`} loading={pageLoading} tone="amber" />
        </div>

        <div className="grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
          <HealthScorePanel analytics={analytics} loading={pageLoading} />
          <AlertTrendsPanel analytics={analytics} loading={pageLoading} />
        </div>

        <div className="grid min-w-0 gap-6">
          <UnavailableMetricsPanel analytics={analytics} loading={pageLoading} />
        </div>

        <div className="grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <DeviceComparisonPanel devices={analytics.outliers} loading={pageLoading} rangeKey={rangeKey} />
          <HeatmapPanel devices={analytics.allDevices} loading={pageLoading} />
        </div>

        <div className="grid min-w-0 gap-6 xl:grid-cols-2">
          <DistributionPanel analytics={analytics} loading={pageLoading} />
          <EventTimelinePanel analytics={analytics} loading={pageLoading} />
          <TopIssuesPanel analytics={analytics} loading={pageLoading} />
        </div>

        <div className="grid min-w-0 gap-6 xl:grid-cols-2">
          <StatusTransitionsPanel analytics={analytics} loading={pageLoading} />
          <GroupPerformancePanel analytics={analytics} loading={pageLoading} />
          <ExportPanel analytics={analytics} exporting={exporting} loading={pageLoading} onExportCsv={handleExportCsv} />
        </div>
      </div>
    </div>
  );
}
