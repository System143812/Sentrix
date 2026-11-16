import { useState, useEffect, useMemo } from "react";
import {
  History,
  Globe2,
  Box,
  ShieldCheck,
  Clock,
  Activity,
  Search,
  Code2,
  Cloud
} from "lucide-react";
import { DateFilterBar } from "../DateFilterBar.jsx";
import { DetailLoader, DetailRefreshOverlay } from "../DetailLoader.jsx";
import * as clientApi from "../../services/clientApi.js";
import { ActivityMonitor } from "./NetworkActivityView.jsx";

export function BehaviorAnalyticsView({ device }) {
  const [data, setData] = useState({
    events: [],
    domains: { rows: [], total: 0 },
    software: { inventory: [], events: [] },
    health: { snapshots: [], uptimeLogs: [] },
  });
  const [networkActivity, setNetworkActivity] = useState({ connections: [], history: [] });
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  function dateToMs(value, endOfDay = false) {
    if (!value) return "";
    const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
    return Number.isNaN(date.getTime()) ? "" : String(date.getTime());
  }

  async function loadBehaviorData() {
    setLoading(true);
    const params = {
      startDate: dateToMs(startDate),
      endDate: dateToMs(endDate, true),
    };
    try {
      const [events, domains, health, actData, histData] = await Promise.all([
        clientApi.getClientEvents(device.id, params).catch(() => []),
        clientApi.getClientDomains(device.id, params).catch(() => ({ rows: [], total: 0 })),
        clientApi.getClientHealth(device.id, params).catch(() => ({ snapshots: [], uptimeLogs: [] })),
        clientApi.getClientNetworkActivity(device.id).catch(() => ({ connections: [] })),
        clientApi.getClientActivityHistory(device.id).catch(() => []),
      ]);

      setData({ events, domains, health });
      setNetworkActivity({
        connections: actData?.activeConnections || actData?.connections || [],
        history: histData || [],
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBehaviorData();
  }, [device.id]);

  if (loading && !data.events.length) {
    return (
      <DetailLoader
        title="Synchronizing History & Web Access"
        subtitle="Aggregating student activity history and web policy controls..."
      />
    );
  }

  return (
    <div className="relative grid gap-4 min-w-0 sm:gap-5">
      {/* Loading Overlay for refreshes */}
      {loading && data.events.length > 0 && (
        <DetailRefreshOverlay
          title="Synchronizing Data"
          subtitle="Updating web activity and events..."
        />
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

      <div className="grid gap-4 lg:gap-5 xl:grid-cols-12">
        {/* HISTORICAL TIMELINE */}
        <section className="flex flex-col rounded-lg border border-slate-200/60 bg-white p-4 sm:p-5 shadow-sm overflow-hidden xl:col-span-4">
          <div className="mb-5 flex items-center justify-between border-b border-slate-50 pb-4">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <span className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-600 shadow-sm">
                <History size={16} sm:size={18} strokeWidth={2.5} />
              </span>
              <h4 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-slate-800 font-ui">Timeline</h4>
            </div>
            <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[9px] sm:text-[10px] font-bold text-slate-500 border border-slate-100">
              {data.events.length} EVENTS
            </span>
          </div>

          <div className="custom-scrollbar relative max-h-[500px] overflow-auto pr-1">
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

                    <div className="group rounded-lg border border-slate-100 bg-slate-50/30 p-3 sm:p-3.5 transition hover:border-slate-200 hover:bg-white hover:shadow-sm">
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
                  <div className="mb-4 flex h-12 w-14 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-200">
                    <Search size={24} strokeWidth={2} />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Empty period</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* NETWORK INTELLIGENCE & HISTORY */}
        <div className="min-w-0 xl:col-span-8">
          <ActivityMonitor
            connections={networkActivity.connections}
            history={[
              ...(networkActivity.history || []),
              ...((data.domains && data.domains.rows) || [])
            ]}
          />
        </div>
      </div>
    </div>
  );
}
