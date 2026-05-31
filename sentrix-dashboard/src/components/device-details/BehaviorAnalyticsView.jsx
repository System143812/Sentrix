import { useState, useEffect } from "react";
import { DateFilterBar } from "../DateFilterBar.jsx";
import { DetailItem } from "./SpecificationView.jsx";
import * as clientApi from "../../services/clientApi.js";

function dateToMs(value, endOfDay = false) {
  if (!value) return "";
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(date.getTime()) ? "" : String(date.getTime());
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
    const [events, domains, software, health, anomalies] = await Promise.all([
      clientApi.getClientEvents(device.id, params).catch(() => []),
      clientApi.getClientDomains(device.id, params).catch(() => ({ rows: [], total: 0 })),
      clientApi.getClientSoftware(device.id, params).catch(() => ({ inventory: [], events: [] })),
      clientApi.getClientHealth(device.id, params).catch(() => ({ snapshots: [], uptimeLogs: [] })),
      clientApi.getClientAnomalies(device.id, params).catch(() => ({ rows: [], total: 0 })),
    ]);

    setData({ events, domains, software, health, anomalies });
    setLoading(false);
  }

  useEffect(() => {
    loadBehaviorData();
  }, [device.id]);

  const riskySoftware = (data.software.inventory || []).filter((item) => item.riskLevel !== "normal");

  return (
    <div className="grid gap-5">
      <DateFilterBar
        endDate={endDate}
        loading={loading}
        onApply={loadBehaviorData}
        onEndDateChange={setEndDate}
        onStartDateChange={setStartDate}
        startDate={startDate}
      />

      <div className="grid gap-4 xl:grid-cols-4">
        <DetailItem label="Tracked Domains" value={data.domains.total} />
        <DetailItem label="Installed Apps" value={data.software.inventory?.length || 0} />
        <DetailItem label="Anomalies" value={data.anomalies.total} />
        <DetailItem label="Uptime" value={data.health.uptimePercent == null ? "Learning" : `${data.health.uptimePercent}%`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200/60 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="text-sm font-bold uppercase tracking-widest text-slate-800">Historical Timeline</h4>
            <span className="text-[10px] font-bold text-slate-400">{data.events.length} Events</span>
          </div>
          <div className="custom-scrollbar grid max-h-80 gap-3 overflow-auto pr-1">
            {data.events.length ? data.events.map((event) => (
              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3" key={event.id}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-bold text-slate-800">{event.title}</p>
                  <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${
                    event.severity === "critical" ? "border-rose-100 bg-rose-50 text-rose-600" : event.severity === "warning" ? "border-amber-100 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-500"
                  }`}>{event.severity}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{event.description}</p>
                <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">{new Date(Number(event.createdAt)).toLocaleString()}</p>
              </div>
            )) : <p className="py-8 text-center text-xs font-bold uppercase tracking-widest text-slate-300">No timeline events yet.</p>}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200/60 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="text-sm font-bold uppercase tracking-widest text-slate-800">Network Intelligence</h4>
            <span className="text-[10px] font-bold text-slate-400">Showing {data.domains.rows.length} of {data.domains.total}</span>
          </div>
          <div className="custom-scrollbar grid max-h-80 gap-3 overflow-auto pr-1">
            {data.domains.rows.length ? data.domains.rows.map((domain) => (
              <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/60 p-3" key={`${domain.domain}-${domain.process}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-bold text-slate-800">{domain.domain}</p>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase border ${
                      domain.category === "Web" ? "bg-blue-50 text-blue-600 border-blue-100" :
                      domain.category === "Development" ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                      domain.category === "System" ? "bg-slate-100 text-slate-500 border-slate-200" :
                      "bg-amber-50 text-amber-600 border-amber-100"
                    }`}>
                      {domain.category || "App"}
                    </span>
                  </div>
                  <p className="truncate text-xs text-slate-500 mt-0.5">{domain.process || "System"}</p>
                </div>
                <span className="shrink-0 rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">{domain.hits} hits</span>
              </div>
            )) : <p className="py-8 text-center text-xs font-bold uppercase tracking-widest text-slate-300">No network intelligence gathered yet.</p>}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200/60 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="text-sm font-bold uppercase tracking-widest text-slate-800">Software Inventory</h4>
            <span className="text-[10px] font-bold text-slate-400">{data.software.inventory.length} Apps</span>
          </div>
          <div className="custom-scrollbar grid max-h-80 gap-3 overflow-auto pr-1">
            {riskySoftware.length ? riskySoftware.map((software) => (
              <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3" key={software.key}>
                <p className="text-sm font-bold text-slate-800">{software.name}</p>
                <p className="text-xs text-amber-700">{software.publisher || "Unknown publisher"} {software.version ? `- ${software.version}` : ""}</p>
              </div>
            )) : (data.software.inventory || []).map((software) => (
              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3" key={software.key}>
                <p className="text-sm font-bold text-slate-800">{software.name}</p>
                <p className="text-xs text-slate-500">{software.publisher || "Unknown publisher"} {software.version ? `- ${software.version}` : ""}</p>
              </div>
            ))}
            {!data.software.inventory?.length ? <p className="py-8 text-center text-xs font-bold uppercase tracking-widest text-slate-300">No inventory received yet.</p> : null}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200/60 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="text-sm font-bold uppercase tracking-widest text-slate-800">Health and Anomalies</h4>
            <span className="text-[10px] font-bold text-slate-400">Showing {data.anomalies.rows.length} of {data.anomalies.total}</span>
          </div>
          <div className="custom-scrollbar grid max-h-80 gap-3 overflow-auto pr-1">
            {data.anomalies.rows.length ? data.anomalies.rows.map((alert) => (
              <div className="rounded-lg border border-rose-100 bg-rose-50/40 p-3" key={alert.id}>
                <p className="text-sm font-bold text-slate-800">{alert.title}</p>
                <p className="text-xs text-rose-700">{alert.description}</p>
              </div>
            )) : <p className="rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-xs font-bold uppercase tracking-widest text-emerald-700">No active anomalies in stored history.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
