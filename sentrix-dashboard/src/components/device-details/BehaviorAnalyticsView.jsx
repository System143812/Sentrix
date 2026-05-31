import { useState, useEffect, useMemo } from "react";
import { 
  History, 
  Globe2, 
  Box, 
  ShieldAlert, 
  ShieldCheck, 
  Zap, 
  Clock, 
  Activity, 
  TriangleAlert, 
  Search,
  LoaderCircle,
  Code2,
  Cloud,
  Layers,
  ChevronRight,
  Info
} from "lucide-react";
import { DateFilterBar } from "../DateFilterBar.jsx";
import * as clientApi from "../../services/clientApi.js";

const CATEGORY_ICONS = {
  Web: Globe2,
  Development: Code2,
  Cloud: Cloud,
  System: ShieldCheck,
  App: Box,
};

function dateToMs(value, endOfDay = false) {
  if (!value) return "";
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(date.getTime()) ? "" : String(date.getTime());
}

function AnalyticsMetricCard({ label, value, icon: Icon, tone = "blue" }) {
  const tones = {
    blue: "border-blue-100 bg-blue-50/50 text-blue-600",
    emerald: "border-emerald-100 bg-emerald-50/50 text-emerald-600",
    rose: "border-rose-100 bg-rose-50/50 text-rose-600",
    amber: "border-amber-100 bg-amber-50/50 text-amber-600",
  };

  return (
    <div className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl border shadow-sm transition-transform group-hover:scale-110 ${tones[tone]}`}>
          <Icon size={20} strokeWidth={2.5} />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-ui">{label}</p>
          <p className="text-lg font-bold text-slate-900 font-data tabular-nums truncate">
            {value ?? "Learning"}
          </p>
        </div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="h-24 animate-pulse rounded-xl border border-slate-100 bg-slate-50/50" />
  );
}

export function BehaviorAnalyticsView({ device }) {
  const [data, setData] = useState({
    events: [],
    domains: { rows: [], total: 0 },
    software: { inventory: [], events: [] },
    health: { snapshots: [], uptimeLogs: [] },
    anomalies: { rows: [], total: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  async function loadBehaviorData() {
    setLoading(true);
    const params = {
      startDate: dateToMs(startDate),
      endDate: dateToMs(endDate, true),
    };
    try {
      const [events, domains, software, health, anomalies] = await Promise.all([
        clientApi.getClientEvents(device.id, params).catch(() => []),
        clientApi.getClientDomains(device.id, params).catch(() => ({ rows: [], total: 0 })),
        clientApi.getClientSoftware(device.id, params).catch(() => ({ inventory: [], events: [] })),
        clientApi.getClientHealth(device.id, params).catch(() => ({ snapshots: [], uptimeLogs: [] })),
        clientApi.getClientAnomalies(device.id, params).catch(() => ({ rows: [], total: 0 })),
      ]);

      setData({ events, domains, software, health, anomalies });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBehaviorData();
  }, [device.id]);

  const riskySoftware = useMemo(() => 
    (data.software.inventory || []).filter((item) => item.riskLevel !== "normal"),
    [data.software.inventory]
  );

  if (loading && !data.events.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="relative mb-6">
          <div className="absolute inset-0 animate-ping rounded-full bg-blue-100 opacity-20" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-600 shadow-sm">
            <LoaderCircle size={32} className="animate-spin" strokeWidth={2.5} />
          </div>
        </div>
        <h5 className="text-sm font-bold uppercase tracking-widest text-slate-800 font-ui">Synchronizing History</h5>
        <p className="mt-2 text-xs font-medium text-slate-400 max-w-[280px] leading-relaxed">
          Aggregating deep behavior patterns and system events from the database...
        </p>
      </div>
    );
  }

  return (
    <div className="relative grid gap-4 min-w-0 sm:gap-5">
      {/* Loading Overlay for refreshes */}
      {loading && data.events.length > 0 && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl bg-white/60 backdrop-blur-[2px] transition-all overflow-hidden border border-blue-100/50">
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-2xl ring-1 ring-slate-900/5">
            <LoaderCircle size={40} className="animate-spin text-blue-600" />
            <div className="text-center">
              <p className="text-sm font-bold uppercase tracking-widest text-slate-900">Synchronizing Data</p>
              <p className="mt-1 text-[11px] font-bold text-slate-400 uppercase tracking-tight">Updating historical intelligence...</p>
            </div>
          </div>
        </div>
      )}

      <div className="w-full">
        <DateFilterBar
          endDate={endDate}
          loading={loading}
          onApply={loadBehaviorData}
          onEndDateChange={setEndDate}
          onStartDateChange={setStartDate}
          startDate={startDate}
          className="!w-full"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <AnalyticsMetricCard 
          label="Tracked Domains" 
          value={data.domains.total} 
          icon={Globe2} 
          tone="blue"
        />
        <AnalyticsMetricCard 
          label="Installed Apps" 
          value={data.software.inventory?.length} 
          icon={Box} 
          tone="emerald"
        />
        <AnalyticsMetricCard 
          label="Anomalies" 
          value={data.anomalies.total === 0 ? "None" : data.anomalies.total} 
          icon={ShieldAlert} 
          tone={data.anomalies.total > 0 ? "rose" : "emerald"}
        />
        <AnalyticsMetricCard 
          label="Uptime" 
          value={data.health.uptimePercent != null ? `${data.health.uptimePercent}%` : "Learning"} 
          icon={Activity} 
          tone="blue"
        />
      </div>

      <div className="grid gap-4 lg:gap-5 xl:grid-cols-2">
        {/* HISTORICAL TIMELINE */}
        <section className="flex flex-col rounded-2xl border border-slate-200/60 bg-white p-4 sm:p-5 shadow-sm overflow-hidden">
          <div className="mb-5 flex items-center justify-between border-b border-slate-50 pb-4">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <span className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg sm:rounded-xl border border-blue-100 bg-blue-50 text-blue-600 shadow-sm">
                <History size={16} sm:size={18} strokeWidth={2.5} />
              </span>
              <h4 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-slate-800 font-ui">Timeline</h4>
            </div>
            <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[9px] sm:text-[10px] font-bold text-slate-500 border border-slate-100">
              {data.events.length} EVENTS
            </span>
          </div>
          
          <div className="custom-scrollbar relative max-h-[400px] sm:max-h-[500px] overflow-auto pr-1">
            <div className="absolute left-[15px] sm:left-[19px] top-0 bottom-0 w-px bg-slate-100" />
            
            <div className="grid gap-5 sm:gap-6 pl-2 sm:pl-4">
              {data.events.length ? data.events.map((event) => {
                const isCritical = event.severity === "critical";
                const isWarning = event.severity === "warning";
                
                return (
                  <div className="relative pl-6 sm:pl-8" key={event.id}>
                    <div className={`absolute left-[-4px] sm:left-[-5px] top-1.5 h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full border-2 border-white ring-4 ${
                      isCritical ? "bg-rose-500 ring-rose-50" : isWarning ? "bg-amber-500 ring-amber-50" : "bg-blue-500 ring-blue-50"
                    }`} />
                    
                    <div className="group rounded-xl border border-slate-100 bg-slate-50/30 p-3 sm:p-3.5 transition hover:border-slate-200 hover:bg-white hover:shadow-md">
                      <div className="flex items-start justify-between gap-2 sm:gap-3">
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs sm:text-sm font-bold font-ui break-words leading-snug ${isCritical ? "text-rose-700" : isWarning ? "text-amber-700" : "text-slate-800"}`}>
                            {event.title}
                          </p>
                          <p className="mt-1 text-[11px] sm:text-xs leading-relaxed text-slate-500 line-clamp-2 sm:line-clamp-none">{event.description}</p>
                        </div>
                        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[7px] sm:text-[8px] font-bold uppercase border ${
                          isCritical ? "border-rose-200 bg-rose-50 text-rose-600" : 
                          isWarning ? "border-amber-200 bg-amber-50 text-amber-700" : 
                          "border-slate-200 bg-white text-slate-500"
                        }`}>{event.severity}</span>
                      </div>
                      <div className="mt-2.5 sm:mt-3 flex items-center gap-1.5 sm:gap-2 text-[9px] sm:text-[10px] font-bold uppercase tracking-tight text-slate-400">
                        <Clock size={10} sm:size={12} strokeWidth={2.5} />
                        {new Date(Number(event.createdAt)).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  </div>
                );
              }) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="mb-4 flex h-12 w-14 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 text-slate-200">
                    <Search size={24} strokeWidth={2} />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Empty period</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* NETWORK AUDIT */}
        <section className="flex flex-col rounded-2xl border border-slate-200/60 bg-white p-4 sm:p-5 shadow-sm overflow-hidden">
          <div className="mb-5 flex items-center justify-between border-b border-slate-50 pb-4">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <span className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg sm:rounded-xl border border-blue-100 bg-blue-50 text-blue-600 shadow-sm">
                <Globe2 size={16} sm:size={18} strokeWidth={2.5} />
              </span>
              <h4 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-slate-800 font-ui">Network History</h4>
            </div>
            <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Top {data.domains.rows.length}
            </span>
          </div>

          <div className="custom-scrollbar grid max-h-[400px] sm:max-h-[500px] gap-2.5 sm:gap-3 overflow-auto pr-1">
            {data.domains.rows.length ? data.domains.rows.map((domain) => {
              const Icon = CATEGORY_ICONS[domain.category] || Box;
              return (
                <div className="group flex items-center justify-between gap-3 sm:gap-4 rounded-xl border border-slate-50 bg-slate-50/50 p-3 sm:p-3.5 transition hover:border-slate-200 hover:bg-white hover:shadow-md" key={`${domain.domain}-${domain.process}`}>
                  <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:gap-3">
                    <span className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-white text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 group-hover:border-blue-100 transition-colors">
                      <Icon size={12} sm:size={14} strokeWidth={2.5} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <p className="truncate text-xs sm:text-sm font-bold text-slate-800 font-ui">{domain.domain}</p>
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[7px] sm:text-[8px] font-bold uppercase border ${
                          domain.category === "Web" ? "bg-blue-50 text-blue-600 border-blue-100" :
                          domain.category === "Development" ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                          domain.category === "System" ? "bg-slate-100 text-slate-500 border-slate-200" :
                          "bg-amber-50 text-amber-600 border-amber-100"
                        }`}>
                          {domain.category || "App"}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-tight text-slate-400">
                        <span>via</span>
                        <span className="text-slate-500 font-data truncate">{domain.process || "System"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="inline-flex rounded-lg border border-blue-100 bg-blue-50 px-2 sm:px-2.5 py-1 text-[9px] sm:text-[10px] font-bold text-blue-700 shadow-sm">
                      {domain.hits}
                    </span>
                  </div>
                </div>
              );
            }) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-12 w-14 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 text-slate-200">
                  <Activity size={24} strokeWidth={2} />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">No activity</p>
              </div>
            )}
          </div>
        </section>

        {/* SOFTWARE INVENTORY */}
        <section className="flex flex-col rounded-2xl border border-slate-200/60 bg-white p-4 sm:p-5 shadow-sm overflow-hidden">
          <div className="mb-5 flex items-center justify-between border-b border-slate-50 pb-4">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <span className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg sm:rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-600 shadow-sm">
                <Layers size={16} sm:size={18} strokeWidth={2.5} />
              </span>
              <h4 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-slate-800 font-ui">Inventory</h4>
            </div>
            <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[9px] sm:text-[10px] font-bold text-slate-500 border border-slate-100 uppercase tracking-widest">
              {data.software.inventory.length} APPS
            </span>
          </div>

          <div className="custom-scrollbar grid max-h-[400px] sm:max-h-[500px] gap-2.5 sm:gap-3 overflow-auto pr-1 min-w-0">
            {riskySoftware.length > 0 && (
              <div className="mb-3 space-y-2 min-w-0">
                <p className="px-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-rose-500 flex items-center gap-1.5">
                  <TriangleAlert size={12} /> Priority Review
                </p>
                {riskySoftware.map((software) => (
                  <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3 sm:p-3.5 shadow-sm min-w-0" key={software.key}>
                    <div className="flex items-start justify-between gap-2 sm:gap-3 min-w-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-bold text-rose-900 font-ui break-words leading-tight">{software.name}</p>
                        <p className="mt-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-wide text-rose-600/70 break-all leading-tight">
                          {software.publisher || "Unknown Vendor"} {software.version ? `• v${software.version}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 rounded bg-rose-600 px-1.5 py-0.5 text-[7px] sm:text-[8px] font-bold uppercase text-white shadow-sm self-start">RISKY</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid gap-2.5 sm:gap-3 min-w-0">
              {data.software.inventory.length ? (data.software.inventory || []).map((software) => {
                if (software.riskLevel !== "normal") return null;
                return (
                  <div className="group rounded-xl border border-slate-50 bg-slate-50/50 p-3 sm:p-3.5 transition hover:border-slate-200 hover:bg-white hover:shadow-md min-w-0" key={software.key}>
                    <div className="flex items-center justify-between gap-2 sm:gap-3 min-w-0">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs sm:text-sm font-bold text-slate-800 font-ui break-words leading-tight">{software.name}</p>
                        <p className="mt-1 truncate text-[9px] sm:text-[10px] font-bold uppercase tracking-wide text-slate-400 break-all leading-tight">
                          {software.publisher || "Unknown Vendor"} {software.version ? `• v${software.version}` : ""}
                        </p>
                      </div>
                      <ChevronRight size={12} sm:size={14} className="shrink-0 text-slate-200 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-400" />
                    </div>
                  </div>
                );
              }) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="mb-4 flex h-12 w-14 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 text-slate-200">
                    <Box size={24} strokeWidth={2} />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Empty</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* HEALTH & ANOMALIES */}
        <section className="flex flex-col rounded-2xl border border-slate-200/60 bg-white p-4 sm:p-5 shadow-sm overflow-hidden">
          <div className="mb-5 flex items-center justify-between border-b border-slate-50 pb-4">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <span className={`flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg sm:rounded-xl border shadow-sm ${data.anomalies.total > 0 ? "border-rose-100 bg-rose-50 text-rose-600" : "border-emerald-100 bg-emerald-50 text-emerald-600"}`}>
                <Zap size={16} sm:size={18} strokeWidth={2.5} />
              </span>
              <h4 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-slate-800 font-ui">Health Log</h4>
            </div>
            {data.anomalies.total === 0 && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] sm:text-[10px] font-bold text-emerald-600 border border-emerald-100">
                <ShieldCheck size={10} sm:size={12} strokeWidth={3} /> STABLE
              </span>
            )}
          </div>

          <div className="custom-scrollbar grid max-h-[400px] sm:max-h-[500px] gap-2.5 sm:gap-3 overflow-auto pr-1">
            {data.anomalies.rows.length ? data.anomalies.rows.map((alert) => (
              <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-3 sm:p-4 shadow-sm" key={alert.id}>
                <div className="flex items-start gap-2.5 sm:gap-3">
                  <TriangleAlert size={16} sm:size={18} className="shrink-0 text-rose-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-bold text-rose-900 font-ui break-words leading-tight">{alert.title}</p>
                    <p className="mt-1 text-[11px] sm:text-xs leading-relaxed text-rose-700/80">{alert.description}</p>
                    <p className="mt-2.5 sm:mt-3 text-[9px] sm:text-[10px] font-bold uppercase tracking-tight text-rose-400">
                      {new Date(Number(alert.createdAt)).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )) : (
              <div className="flex flex-col items-center justify-center py-12 sm:py-20 text-center">
                <div className="mb-4 sm:mb-6 flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 shadow-inner ring-4 sm:ring-8 ring-emerald-50/50">
                  <ShieldCheck size={40} sm:size={48} strokeWidth={1.5} />
                </div>
                <h5 className="text-xs sm:text-sm font-bold text-slate-800 font-ui uppercase tracking-wide">Verified</h5>
                <p className="mt-1.5 sm:mt-2 text-[10px] sm:text-xs font-medium text-slate-400 max-w-[200px] sm:max-w-[240px] leading-relaxed mx-auto">
                  No anomalies detected.
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 sm:mt-auto border-t border-slate-50 pt-4 sm:pt-5 flex items-start gap-2 sm:gap-3 px-1">
            <Info size={14} sm:size={16} className="text-blue-400 shrink-0 mt-0.5" />
            <p className="text-[9px] sm:text-[10px] font-medium leading-relaxed text-slate-400 italic">
              Health logs aggregate performance spikes and unexpected service terminations.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
