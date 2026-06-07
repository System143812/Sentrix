import {
  Globe2,
  CircleHelp,
  History,
  CircleStop,
  Cpu,
  ShieldAlert,
  Cloud,
  Terminal,
  Box,
  Code2,
  ShieldCheck,
  Search,
  RadioTower,
} from "lucide-react";
import { useLayoutEffect, useRef, useEffect, useMemo, useState } from "react";
import { SearchFilterBar } from "../SearchFilterBar.jsx";
import { useTelemetryInterval } from "../../hooks/useTelemetryInterval.js";
import { DetailLoader, DetailRefreshOverlay } from "../DetailLoader.jsx";
import * as clientApi from "../../services/clientApi.js";
import { matchesSearch } from "../../shared/utils.js";
import { ProcessEndConfirmDialog } from "./shared/Dialogs.jsx";

const CATEGORY_ICONS = {
  Web: Globe2,
  Development: Code2,
  Cloud: Cloud,
  System: ShieldCheck,
  App: Box,
};

const ProcessList = ({ list, title, icon: Icon, actionLoading, selectedProcesses, onToggle }) => {
  const listRef = useRef(null);
  const scrollPos = useRef(0);

  useLayoutEffect(() => {
    if (listRef.current) listRef.current.scrollTop = scrollPos.current;
  });

  const handleScroll = (e) => {
    scrollPos.current = e.target.scrollTop;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h5 className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 font-ui">
        <Icon size={12} strokeWidth={2.5} />
        {title} ({list.length})
      </h5>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200/60 bg-white shadow-sm">
        <div className="hidden grid-cols-[44px_1fr_80px_100px_100px] gap-4 border-b border-slate-100 bg-slate-50/50 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 font-ui lg:grid">
          <div />
          <div>Process Name</div>
          <div className="text-right">CPU Load</div>
          <div className="text-right">Memory</div>
          <div className="text-center">Status</div>
        </div>

        <div 
          className="max-h-96 divide-y divide-slate-100 overflow-auto custom-scrollbar xl:min-h-0 xl:flex-1"
          onScroll={handleScroll}
          ref={listRef}
        >
          {list.length > 0 ? list.map((process) => {
            const ended = process.status === "Ended";
            const uniqueId = `proc-${process.pid}-${process.name}`;

            return (
              <label
                className={`flex flex-col gap-3 px-4 py-3.5 transition lg:grid lg:grid-cols-[44px_1fr_80px_100px_100px] lg:items-center lg:gap-4 ${
                  ended ? "bg-slate-50/50 text-slate-400" : "text-slate-700 hover:bg-slate-50/50"
                } cursor-pointer`}
                key={uniqueId}
              >
                <div className="flex items-center gap-3 lg:justify-center lg:gap-0">
                  <input
                    checked={selectedProcesses.includes(uniqueId)}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    disabled={ended || actionLoading}
                    onChange={() => onToggle(uniqueId)}
                    type="checkbox"
                  />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 lg:hidden">Select Process</span>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900 leading-tight font-ui">
                    {process.name}
                  </p>
                  <p className="truncate text-[10px] text-slate-500 mt-1 font-data">
                    {process.windowTitle || `PID ${process.pid} - ${process.user}`}
                  </p>
                </div>

                <div className="flex items-center justify-between lg:block lg:text-right">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 lg:hidden">CPU Usage</span>
                  <span className="text-xs font-bold font-data tabular-nums text-slate-700">
                    {process.cpu}%
                  </span>
                </div>

                <div className="flex items-center justify-between lg:block lg:text-right">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 lg:hidden">Memory</span>
                  <span className="text-xs font-bold font-data tabular-nums text-slate-700">
                    {process.memoryMb} MB
                  </span>
                </div>

                <div className="flex items-center justify-between lg:justify-center">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 lg:hidden">Status</span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight border ${
                      ended
                        ? "bg-slate-100 border-slate-200 text-slate-400"
                        : "bg-emerald-50 border-emerald-100 text-emerald-600"
                    }`}
                  >
                    {process.status}
                  </span>
                </div>
              </label>
            );
          }) : (
            <div className="py-12 text-center text-[10px] font-bold uppercase tracking-widest text-slate-300 font-ui">No processes detected.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export function ProcessMonitor({ processes, actionLoading, actionMessage, selectedProcesses, onToggle, onEnd }) {
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("cpu");
  const visibleProcesses = useMemo(() => {
    const searched = processes.filter((process) =>
      matchesSearch(process, query, ["name", "user", "pid", "windowTitle", "status"]),
    );

    return [...searched].sort((first, second) => {
      if (sortBy === "name") return String(first.name || "").localeCompare(String(second.name || ""));
      if (sortBy === "memory") return Number(second.memoryMb || 0) - Number(first.memoryMb || 0);
      return Number(second.cpu || 0) - Number(first.cpu || 0);
    });
  }, [processes, query, sortBy]);

  return (
    <section className="flex h-full max-h-[640px] min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200/60 bg-white p-4 sm:p-6 shadow-sm">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-slate-50 pb-5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-rose-100 bg-rose-50 text-rose-600 shadow-sm">
            <CircleStop size={18} strokeWidth={2.5} />
          </span>
          <h4 className="text-sm font-bold uppercase tracking-widest text-slate-800 font-ui">
            Process Monitor
          </h4>
        </div>
        <button
          className={`inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-xs font-bold uppercase tracking-wider transition disabled:cursor-not-allowed disabled:opacity-50 ${
            actionLoading 
              ? "bg-slate-100 text-slate-500 border-slate-200" 
              : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 active:scale-95"
          }`}
          disabled={selectedProcesses.length === 0 || actionLoading}
          onClick={onEnd}
          type="button"
        >
          <CircleStop className={actionLoading ? "animate-spin" : ""} size={16} strokeWidth={2.5} />
          {actionLoading ? "Ending..." : `End ${selectedProcesses.length || ""} selected`}
        </button>
      </div>

      {actionMessage.text && (
        <div className={`mb-5 flex items-center gap-3 rounded-lg border px-4 py-3 text-xs font-bold shadow-sm ${
          actionMessage.type === "error" ? "bg-rose-50 border-rose-200 text-rose-700" :
          actionMessage.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
          "bg-blue-50 border-blue-200 text-blue-700"
        }`}>
          <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            actionMessage.type === "error" ? "bg-rose-500" :
            actionMessage.type === "success" ? "bg-emerald-500" :
            "bg-blue-500"
          } animate-pulse`} />
          {actionMessage.text}
        </div>
      )}

      <SearchFilterBar
        className="mb-5 !border-slate-200 !bg-slate-50/50"
        count={visibleProcesses.length}
        filters={[
          {
            id: "sort",
            label: "Sort",
            value: sortBy,
            onChange: setSortBy,
            options: [
              { value: "cpu", label: "CPU usage" },
              { value: "memory", label: "Memory usage" },
              { value: "name", label: "Alphabetical" },
            ],
          },
        ]}
        onQueryChange={setQuery}
        placeholder="Search active processes"
        query={query}
      />

      <div className="grid min-h-0 flex-1 gap-6">
        <ProcessList 
          icon={Cpu} 
          list={visibleProcesses}
          title="Process Stream" 
          actionLoading={actionLoading}
          selectedProcesses={selectedProcesses}
          onToggle={onToggle}
        />
      </div>
    </section>
  );
}

export function ActivityMonitor({ connections, history, error }) {
  const [showHistory, setShowHistory] = useState(false);
  const [query, setQuery] = useState("");
  const activeDomains = new Set(connections.map(c => c.domain));
  const filteredHistory = history.filter(h => !activeDomains.has(h.domain));
  const visibleItems = useMemo(() => {
    const source = showHistory ? filteredHistory : connections;
    return source.filter((item) =>
      matchesSearch(item, query, ["domain", "peerAddress", "process", "organization", "serviceLabel"]),
    );
  }, [connections, filteredHistory, query, showHistory]);
  
  const activeListRef = useRef(null);
  const historyListRef = useRef(null);
  const scrollPos = useRef({ active: 0, history: 0 });

  useLayoutEffect(() => {
    if (activeListRef.current) activeListRef.current.scrollTop = scrollPos.current.active;
    if (historyListRef.current) historyListRef.current.scrollTop = scrollPos.current.history;
  });

  const handleScroll = (type) => (e) => {
    scrollPos.current[type] = e.target.scrollTop;
  };

  return (
    <section className="flex flex-col h-full max-h-[640px] overflow-hidden rounded-lg border border-slate-200/60 bg-white p-4 sm:p-6 shadow-sm">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-600 shadow-sm">
            <RadioTower size={18} strokeWidth={2.5} />
          </span>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold uppercase tracking-widest text-slate-800 font-ui">
              Network Intelligence
            </h4>
            <div className="group relative">
              <CircleHelp size={14} strokeWidth={2.5} className="cursor-help text-slate-300 hover:text-slate-500 transition-colors" />
              <div className="pointer-events-none absolute top-full left-1/2 z-20 mt-3 hidden w-64 -translate-x-1/2 rounded-lg bg-slate-900 p-4 text-[11px] font-medium leading-relaxed text-white shadow-sm group-hover:block">
                <p className="font-bold text-blue-400 mb-1">Network Intelligence</p>
                Tracks real-time and historical network interactions. It maps outbound connections to hostnames (DNS) and identifies which applications (processes) are communicating with external services.
                <div className="absolute bottom-full left-1/2 -ml-1.5 border-[6px] border-transparent border-b-slate-900" />
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex w-24 items-center p-1 rounded-lg border border-slate-200 overflow-hidden shadow-sm">
          {/* Animated Active Pill Indicator */}
          <div 
            className="absolute h-[calc(100%-8px)] w-9 rounded-md bg-slate-900 transition-all duration-300 ease-in-out shadow-sm"
            style={{
              left: showHistory ? 'calc(50% + 4px)' : '8px',
              width: 'calc(50% - 12px)',
            }}
          />
          <button
            onClick={() => setShowHistory(false)}
            className={`relative z-10 flex flex-1 h-9 items-center justify-center rounded-md transition-colors duration-300 ${!showHistory ? "text-white" : "text-slate-400 hover:text-slate-800"}`}
            title="Show active sites and connections"
            type="button"
          >
            <Globe2 size={16} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => setShowHistory(true)}
            className={`relative z-10 flex flex-1 h-9 items-center justify-center rounded-md transition-colors duration-300 ${showHistory ? "text-white" : "text-slate-400 hover:text-slate-800"}`}
            title="Show recent activity history"
            type="button"
          >
            <History size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <SearchFilterBar
        className="mb-5 !border-slate-200 !bg-slate-50/50"
        count={visibleItems.length}
        onQueryChange={setQuery}
        placeholder={showHistory ? "Search recent activity" : "Search active sites"}
        query={query}
      />

      {error && (
        <div className="mb-5 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-600">
          {error}
        </div>
      )}

      <div className="flex flex-1 flex-col min-h-0">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 font-ui px-1">
          {showHistory ? "Recent Activity History" : "Active Sites & Connections"}
        </p>
        <div 
          className={`custom-scrollbar grid gap-3 overflow-auto pr-1 flex-1 transition-opacity duration-300 ${visibleItems.length === 0 ? "opacity-50" : "opacity-100"}`}
          style={{ minHeight: '300px' }}
          onScroll={handleScroll(showHistory ? "history" : "active")}
          ref={showHistory ? historyListRef : activeListRef}
          key={showHistory ? "history-list" : "active-list"}
        >
          {!showHistory && visibleItems.length > 0 ? visibleItems.map((item) => {
            const Icon = CATEGORY_ICONS[item.category] || Box;
            return (
              <div
                className="group min-w-0 rounded-lg border border-slate-200/60 bg-white p-3 shadow-sm transition hover:border-slate-300 hover:shadow-sm"
                key={item.id ? `conn-${item.id}` : `conn-${item.process}-${item.domain}-${item.peerAddress}-${item.peerPort}`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-400 group-hover:bg-white group-hover:text-slate-600 group-hover:border-slate-200 transition-colors">
                      <Icon size={14} strokeWidth={2.5} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`truncate text-sm font-bold font-ui ${item.domain?.includes('localhost') ? 'text-blue-600' : 'text-slate-900'}`}>
                          {item.domain || item.peerAddress}
                        </p>
                        {item.isCloud && (
                          <span className="rounded bg-blue-50 px-1 py-0.5 text-[7px] font-bold text-blue-600 uppercase border border-blue-100">Cloud</span>
                        )}
                      </div>
                      {item.organization && item.organization !== item.domain && (
                        <p className="mt-0.5 truncate text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                          {item.organization}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5 sm:flex-col sm:items-end">
                    {item.count > 1 && (
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 uppercase">
                        {item.count} hits
                      </span>
                    )}
                    <span className="rounded-md border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600 uppercase">
                      Live
                    </span>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 border-t border-slate-50 pt-2 ml-11">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Via</span>
                    <span className="text-[11px] font-bold text-slate-700 font-data truncate">{item.process}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-ui">Port</span>
                    <span className="text-[11px] font-bold text-slate-600 font-data tabular-nums">{item.peerPort}</span>
                  </div>
                </div>
              </div>
            );
          }) : !showHistory ? (
            <div className="flex h-full items-center justify-center py-12">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300 font-ui">No active activity detected.</p>
            </div>
          ) : null}
          {showHistory && visibleItems.length > 0 ? visibleItems.map((item) => {
            const Icon = CATEGORY_ICONS[item.category] || Box;
            return (
              <div
                className="group min-w-0 rounded-lg border border-slate-200/60 bg-white p-3 shadow-sm transition hover:border-slate-300 hover:shadow-sm opacity-90"
                key={`hist-${item.domain}-${item.process}`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-400 group-hover:bg-white group-hover:text-slate-600 group-hover:border-slate-200 transition-colors">
                      <Icon size={14} strokeWidth={2.5} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-700 font-ui">
                        {item.domain}
                      </p>
                      <p className="mt-0.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">{item.category || 'App'}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter font-data">
                      {new Date(item.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {item.hitCount > 1 && (
                      <span className="text-[9px] font-bold text-slate-300 uppercase">{item.hitCount} total hits</span>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 border-t border-slate-50 pt-2 ml-11">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Via</span>
                    <span className="text-[11px] font-bold text-slate-600 font-data truncate">{item.process}</span>
                  </div>
                </div>
              </div>
            );
          }) : showHistory ? (
            <div className="flex h-full items-center justify-center py-12">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300 font-ui">No history archived yet.</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function NetworkActivityView({ device }) {
  const [processes, setProcesses] = useState([]);
  const [history, setHistory] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState({ text: "", type: "" });
  
  const [selectedProcesses, setSelectedProcesses] = useState([]);
  const [endedProcesses, setEndedProcesses] = useState([]);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const refreshIntervalMs = useTelemetryInterval();

  useEffect(() => {
    let active = true;
    let timer = null;

    async function fetchData() {
      try {
        const [procData, activityData, historyData] = await Promise.all([
          clientApi.getClientProcesses(device.id),
          clientApi.getClientNetworkActivity(device.id),
          clientApi.getClientActivityHistory(device.id),
        ]);

        if (!active) return;

        setProcesses(procData || []);
        setHistory(historyData || []);
        setConnections(activityData?.activeConnections || activityData?.connections || []);
        setLoading(false);
        setError("");
      } catch (err) {
        if (!active) return;
        setError("Failed to load real-time network activity.");
        setLoading(false);
      }
    }

    fetchData();
    timer = setInterval(fetchData, refreshIntervalMs);

    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [device.id, refreshIntervalMs]);

  const displayedProcesses = processes.map((p) => ({
    pid: p.pid,
    name: p.name,
    user: p.user,
    cpu: p.cpu,
    memoryMb: p.memoryMb,
    windowTitle: p.windowTitle,
    status: endedProcesses.includes(p.pid) ? "Ended" : "Running",
  }));

  function toggleProcess(processId) {
    setSelectedProcesses((current) =>
      current.includes(processId)
        ? current.filter((id) => id !== processId)
        : [...current, processId],
    );
  }

  async function endSelectedProcesses() {
    if (selectedProcesses.length === 0) return;

    setActionLoading(true);
    setActionMessage({ text: "Ending processes...", type: "info" });

    const pidsToKill = selectedProcesses.map(id => {
      const match = id.match(/proc-(\d+)-/);
      return match ? parseInt(match[1], 10) : null;
    }).filter(Boolean);

    const results = [];

    for (const pid of pidsToKill) {
      try {
        const result = await clientApi.killClientProcess(device.id, pid);
        if (result.success) {
          setEndedProcesses(prev => [...prev, pid]);
          results.push({ pid, success: true });
        }
      } catch (err) {
        results.push({ pid, success: false, message: err.message });
      }
    }

    const failed = results.filter(r => !r.success);
    if (failed.length > 0) {
      setActionMessage({ text: failed[0].message, type: "error" });
    } else {
      setActionMessage({ text: "Processes ended successfully.", type: "success" });
    }

    setSelectedProcesses([]);
    setActionLoading(false);
    
    const delay = failed.length > 0 ? 15000 : 5000;
    setTimeout(() => setActionMessage({ text: "", type: "" }), delay);
  }

  if (loading && processes.length === 0) {
    return (
      <DetailLoader 
        title="Establishing Real-time Stream"
        subtitle="Connecting to the agent telemetry bridge and synchronizing active process metrics..."
      />
    );
  }

  return (
    <div className="relative grid min-w-0 items-start gap-6 lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      {/* Loading Overlay for refreshes */}
      {loading && processes.length > 0 && (
        <DetailRefreshOverlay 
          title="Refreshing Stream"
          subtitle="Syncing active process & network data..."
        />
      )}

      <ProcessEndConfirmDialog
        count={confirmEnd ? selectedProcesses.length : 0}
        loading={actionLoading}
        onCancel={() => setConfirmEnd(false)}
        onConfirm={async () => {
          await endSelectedProcesses();
          setConfirmEnd(false);
        }}
      />
      <ActivityMonitor 
        connections={connections}
        error={error}
        history={history}
      />
      <ProcessMonitor 
        actionLoading={actionLoading}
        actionMessage={actionMessage}
        onEnd={() => setConfirmEnd(true)}
        onToggle={toggleProcess}
        processes={displayedProcesses}
        selectedProcesses={selectedProcesses}
      />
    </div>
  );
}
