import {
  Activity,
  Cpu,
  HardDrive,
  MemoryStick,
  MonitorCheck,
  Radio,
  Timer,
  TrendingUp,
} from "lucide-react";

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function average(values = []) {
  const usable = values.filter((value) => Number.isFinite(Number(value)));
  if (!usable.length) return 0;
  return Math.round(
    usable.reduce((total, value) => total + Number(value), 0) / usable.length,
  );
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return "No heartbeat";

  const elapsedMs = Date.now() - Number(timestamp);
  const minutes = Math.max(0, Math.floor(elapsedMs / 60000));

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}

function formatUptime(seconds = 0) {
  const hours = Math.floor((Number(seconds) || 0) / 3600);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function getDeviceLoad(device) {
  const metrics = device.metrics || {};
  return Math.round(
    (clamp(metrics.cpu) + clamp(metrics.ram) + clamp(metrics.disk)) / 3,
  );
}

function buildTrend(devices) {
  const labels = ["8 AM", "10 AM", "12 PM", "2 PM", "4 PM", "Now"];
  const cpuBase = average(devices.map((device) => device.metrics?.cpu));
  const ramBase = average(devices.map((device) => device.metrics?.ram));

  return labels.map((label, index) => {
    const drift = (index - 2) * 4;
    return {
      label,
      cpu: clamp(cpuBase + drift + (index % 2 === 0 ? 3 : -2)),
      ram: clamp(ramBase + drift / 2 + (index % 2 === 0 ? -1 : 4)),
    };
  });
}

function getAnalytics(devices = [], dashboardData = {}) {
  const online =
    dashboardData.online ??
    devices.filter((device) => device.status === "online").length;
  const offline = dashboardData.offline ?? devices.filter((device) => device.status === "offline").length;
  const total = dashboardData.total ?? devices.length;
  const cpu = average(devices.map((device) => device.metrics?.cpu));
  const ram = average(devices.map((device) => device.metrics?.ram));
  const disk = average(devices.map((device) => device.metrics?.disk));
  const uptime = average(devices.map((device) => device.metrics?.uptime));
  const pressure = average(devices.map(getDeviceLoad));
  const groups = new Set(devices.map((device) => device.group || "Unassigned"));

  return {
    total,
    online,
    offline,
    cpu,
    ram,
    disk,
    uptime,
    pressure,
    groups: groups.size,
    trend: buildTrend(devices),
    topDevices: [...devices]
      .sort((first, second) => getDeviceLoad(second) - getDeviceLoad(first))
      .slice(0, 5),
    recentDevices: [...devices]
      .sort((first, second) => (second.last_seen_at || 0) - (first.last_seen_at || 0))
      .slice(0, 5),
  };
}

function buildSmoothPath(points, key, width = 640, height = 220) {
  if (!points.length) return "";

  const step = points.length > 1 ? width / (points.length - 1) : width;
  const coordinates = points.map((point, index) => ({
    x: index * step,
    y: height - (clamp(point[key]) / 100) * height,
  }));

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

function buildAreaPath(points, key, width = 640, height = 220) {
  const line = buildSmoothPath(points, key, width, height);
  if (!line) return "";
  return `${line} L ${width} ${height} L 0 ${height} Z`;
}

function MetricCard({ icon: Icon, label, value, detail, tone = "blue" }) {
  const tones = {
    blue: "border-blue-100/80 from-blue-50/95 via-white/85 to-cyan-50/95 text-blue-700",
    pink: "border-rose-100/80 from-rose-50/95 via-white/85 to-fuchsia-50/95 text-rose-700",
    amber: "border-amber-100/80 from-amber-50/95 via-white/85 to-orange-50/95 text-amber-700",
    teal: "border-teal-100/80 from-teal-50/95 via-white/85 to-emerald-50/95 text-teal-700",
  };

  return (
    <article
      className={`analytics-card analytics-reveal rounded-lg border bg-gradient-to-br ${tones[tone]} p-4 shadow-lg shadow-slate-200/80`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <strong className="mt-2 block text-3xl leading-none">{value}</strong>
          <span className="mt-2 block text-xs font-medium text-slate-500">
            {detail}
          </span>
        </div>
        <span className="analytics-icon grid h-10 w-10 shrink-0 place-items-center rounded-md bg-white/70 text-slate-700 ring-1 ring-white/80">
          <Icon size={20} />
        </span>
      </div>
    </article>
  );
}

function TrendChart({ points = [] }) {
  const cpuPath = buildSmoothPath(points, "cpu");
  const ramPath = buildSmoothPath(points, "ram");
  const cpuArea = buildAreaPath(points, "cpu");
  const ramArea = buildAreaPath(points, "ram");

  return (
    <section className="analytics-panel analytics-reveal min-w-0 rounded-lg border border-white/80 bg-white/90 p-4 shadow-lg shadow-slate-200/70 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Utilization Trend</h2>
          <p className="text-sm text-slate-500">CPU and memory pressure</p>
        </div>
        <div className="flex items-center gap-4 text-xs font-semibold text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            CPU
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            RAM
          </span>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-100 bg-gradient-to-b from-slate-50 to-white p-3 sm:p-4">
        <svg
          className="h-48 w-full sm:h-64"
          preserveAspectRatio="none"
          viewBox="0 0 640 220"
          role="img"
          aria-label="CPU and RAM utilization trend"
        >
          <defs>
            <linearGradient id="cpuArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="ramArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.02" />
            </linearGradient>
            <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur result="coloredBlur" stdDeviation="3" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {[44, 88, 132, 176].map((line) => (
            <line
              key={line}
              stroke="#e2e8f0"
              strokeDasharray="5 7"
              strokeWidth="1"
              x1="0"
              x2="640"
              y1={line}
              y2={line}
            />
          ))}

          <path className="analytics-area" d={ramArea} fill="url(#ramArea)" />
          <path className="analytics-area" d={cpuArea} fill="url(#cpuArea)" />
          <path
            className="analytics-line"
            d={ramPath}
            fill="none"
            filter="url(#softGlow)"
            stroke="#2563eb"
            strokeLinecap="round"
            strokeWidth="4"
          />
          <path
            className="analytics-line analytics-line-delay"
            d={cpuPath}
            fill="none"
            filter="url(#softGlow)"
            stroke="#f43f5e"
            strokeLinecap="round"
            strokeWidth="4"
          />
        </svg>

        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {points.map((point) => (
            <div className="min-w-0 rounded-md bg-white/70 px-1 py-2 text-center" key={point.label}>
              <p className="truncate text-xs font-semibold text-slate-500">
                {point.label}
              </p>
              <p className="mt-1 text-[10px] font-medium text-slate-400 sm:text-[11px]">
                {point.cpu}% / {point.ram}%
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatusDonut({ online, offline, total }) {
  const onlinePercent = total > 0 ? Math.round((online / total) * 100) : 0;
  const offlinePercent = total > 0 ? 100 - onlinePercent : 0;
  const circumference = 2 * Math.PI * 44;
  const onlineOffset = circumference - (onlinePercent / 100) * circumference;
  const offlineOffset = circumference - (offlinePercent / 100) * circumference;

  return (
    <section className="analytics-panel analytics-reveal min-w-0 rounded-lg border border-white/80 bg-white/90 p-4 shadow-lg shadow-slate-200/70 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Fleet Status</h2>
          <p className="text-sm text-slate-500">Registered agents</p>
        </div>
        <Radio className="text-ocean" size={20} />
      </div>

      <div className="mt-6 grid place-items-center">
        <div className="analytics-donut relative grid h-44 w-44 place-items-center rounded-full bg-gradient-to-br from-white via-slate-50 to-cyan-50">
          <svg className="h-40 w-40 -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              fill="none"
              r="44"
              stroke="#e2e8f0"
              strokeWidth="10"
            />
            <circle
              className="analytics-ring"
              cx="50"
              cy="50"
              fill="none"
              r="44"
              stroke="#ef4444"
              strokeLinecap="round"
              strokeWidth="10"
              style={{
                "--ring-offset": offlineOffset,
                strokeDasharray: circumference,
                strokeDashoffset: offlineOffset,
              }}
            />
            <circle
              className="analytics-ring analytics-ring-primary"
              cx="50"
              cy="50"
              fill="none"
              r="44"
              stroke="url(#fleetRing)"
              strokeLinecap="round"
              strokeWidth="10"
              style={{
                "--ring-offset": onlineOffset,
                strokeDasharray: circumference,
                strokeDashoffset: onlineOffset,
              }}
            />
            <defs>
              <linearGradient id="fleetRing" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute grid h-24 w-24 place-items-center rounded-full bg-white/85 text-center shadow-inner ring-1 ring-white">
            <div>
              <strong className="block text-3xl">{onlinePercent}%</strong>
              <span className="text-xs font-semibold text-slate-500">online</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-3">
          <strong className="block text-xl">{total}</strong>
          <span className="text-xs font-medium text-slate-500">Total</span>
        </div>
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/80 px-2 py-3">
          <strong className="block text-xl text-emerald-600">{online}</strong>
          <span className="text-xs font-medium text-slate-500">Online</span>
        </div>
        <div className="rounded-lg border border-red-100 bg-red-50/80 px-2 py-3">
          <strong className="block text-xl text-red-600">{offlinePercent}%</strong>
          <span className="text-xs font-medium text-slate-500">Offline</span>
        </div>
      </div>
    </section>
  );
}

function DeviceRows({ devices = [] }) {
  return (
    <section className="analytics-panel analytics-reveal min-w-0 rounded-lg border border-white/80 bg-white/90 p-4 shadow-lg shadow-slate-200/70 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Highest Load</h2>
          <p className="text-sm text-slate-500">Devices needing attention</p>
        </div>
        <TrendingUp className="text-signal" size={20} />
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-line md:block">
        <div className="grid grid-cols-[1.2fr_0.7fr_0.8fr_0.6fr] bg-slate-900 px-4 py-3 text-xs font-bold uppercase text-white">
          <span>Device</span>
          <span>Group</span>
          <span>Load</span>
          <span>Status</span>
        </div>
        <div className="divide-y divide-line">
          {devices.length ? (
            devices.map((device) => {
              const load = getDeviceLoad(device);

              return (
                <div
                  className="analytics-row grid grid-cols-[1.2fr_0.7fr_0.8fr_0.6fr] items-center gap-3 px-4 py-3 text-sm"
                  key={device.id}
                >
                  <span className="min-w-0 truncate font-semibold text-slate-800">
                    {device.hostname}
                  </span>
                  <span className="min-w-0 truncate text-slate-500">
                    {device.group || "Unassigned"}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <span
                        className="analytics-progress block h-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                        style={{ "--target-width": `${load}%` }}
                      />
                    </span>
                    <span className="w-9 text-right text-xs font-bold">{load}%</span>
                  </span>
                  <span
                    className={`w-fit rounded-md px-2 py-1 text-xs font-bold capitalize ${
                      device.status === "online"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-700"
                    }`}
                  >
                    {device.status}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              No registered devices yet.
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {devices.length ? (
          devices.map((device) => {
            const load = getDeviceLoad(device);

            return (
              <div
                className="analytics-row rounded-lg border border-line bg-white p-3 text-sm"
                key={device.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-800">
                      {device.hostname}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {device.group || "Unassigned"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold capitalize ${
                      device.status === "online"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-700"
                    }`}
                  >
                    {device.status}
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <span className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <span
                      className="analytics-progress block h-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                      style={{ "--target-width": `${load}%` }}
                    />
                  </span>
                  <span className="w-10 text-right text-xs font-bold">
                    {load}%
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-lg border border-line bg-white px-4 py-8 text-center text-sm text-slate-500">
            No registered devices yet.
          </div>
        )}
      </div>
    </section>
  );
}

function RecentActivity({ devices = [] }) {
  return (
    <section className="analytics-panel analytics-reveal min-w-0 rounded-lg border border-white/80 bg-white/90 p-4 shadow-lg shadow-slate-200/70 sm:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-bold">Recent Activity</h2>
        <p className="text-sm text-slate-500">Latest agent check-ins</p>
      </div>

      <div className="space-y-3">
        {devices.length ? (
          devices.map((device) => (
            <div className="analytics-row flex items-start gap-3 rounded-lg p-2" key={device.id}>
              <span
                className={`mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-md ${
                  device.status === "online"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                <MonitorCheck size={17} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-800">
                  {device.hostname}
                </p>
                <p className="text-xs text-slate-500">
                  {device.status === "online" ? "Heartbeat received" : "Marked offline"} - {formatTimeAgo(device.last_seen_at)}
                </p>
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            Waiting for agent activity.
          </p>
        )}
      </div>
    </section>
  );
}

export function AnalyticsPage({ dashboardData = {}, loading = false }) {
  const devices = dashboardData.clients || [];
  const analytics = getAnalytics(devices, dashboardData);

  return (
    <div className="analytics-shell w-full min-w-0 space-y-6">
      <section className="analytics-hero analytics-reveal rounded-lg border border-white/80 bg-white/90 p-4 shadow-lg shadow-slate-200/70 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-ocean">Analytics</p>
            <h1 className="mt-2 text-2xl font-bold tracking-normal">
              Lab health and device performance
            </h1>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-md border border-line bg-white/70 px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm">
            <Activity size={16} />
            {loading ? "Refreshing metrics" : `${analytics.total} devices tracked`}
          </span>
        </div>
      </section>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Cpu}
          label="Average CPU"
          value={`${analytics.cpu}%`}
          detail={`${analytics.pressure}% fleet pressure`}
          tone="pink"
        />
        <MetricCard
          icon={MemoryStick}
          label="Average RAM"
          value={`${analytics.ram}%`}
          detail={`${analytics.groups} active groups`}
          tone="blue"
        />
        <MetricCard
          icon={HardDrive}
          label="Average Disk"
          value={`${analytics.disk}%`}
          detail={`${analytics.offline} offline agents`}
          tone="amber"
        />
        <MetricCard
          icon={Timer}
          label="Average Uptime"
          value={formatUptime(analytics.uptime)}
          detail={`${analytics.online} online agents`}
          tone="teal"
        />
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <TrendChart points={analytics.trend} />
        <StatusDonut
          online={analytics.online}
          offline={analytics.offline}
          total={analytics.total}
        />
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <RecentActivity devices={analytics.recentDevices} />
        <DeviceRows devices={analytics.topDevices} />
      </div>
    </div>
  );
}
