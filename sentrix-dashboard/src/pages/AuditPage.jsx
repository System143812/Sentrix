import { useEffect, useMemo, useState } from "react";
import { ClipboardList, RefreshCcw, LoaderCircle } from "lucide-react";
import { PageHeader } from "../components/PageHeader.jsx";
import { SearchFilterBar } from "../components/SearchFilterBar.jsx";
import { matchesSearch } from "../shared/utils.js";
import * as auditApi from "../services/auditApi.js";

function labelAction(action = "") {
  return action
    .replace(/^remote_/, "Remote ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AuditPage() {
  const [logs, setLogs] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const visibleLogs = useMemo(
    () => logs.filter((log) => matchesSearch(log, query, ["actorEmail", "actorRole", "action", "targetLabel", "ipAddress", "macAddress"])),
    [logs, query],
  );

  async function loadLogs() {
    setLoading(true);
    setError("");
    try {
      setLogs(await auditApi.getAuditLogs({ limit: 300 }));
    } catch (err) {
      setError(err.message || "Unable to load logs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ClipboardList}
        title="Logs and Audit History"
        subtitle="Review sign-ins, account changes, device actions, process control, and remote commands."
        backgroundImage="/settings_header.jpg"
        action={
          <button
            type="button"
            onClick={loadLogs}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-5 text-sm font-bold text-white shadow-xl backdrop-blur transition hover:bg-white/20 disabled:cursor-wait disabled:opacity-60"
            disabled={loading}
          >
            {loading ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : (
              <RefreshCcw size={16} />
            )}
            <span>{loading ? "Refreshing" : "Refresh"}</span>
          </button>
        }
      />

      <SearchFilterBar
        count={visibleLogs.length}
        onQueryChange={setQuery}
        placeholder="Search by user, action, target, IP, or MAC"
        query={query}
      />

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div> : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="hidden grid-cols-[1.1fr_1fr_1fr_110px_150px] gap-4 bg-slate-50 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 lg:grid">
          <div>Action</div>
          <div>User</div>
          <div>Target</div>
          <div>IP</div>
          <div>Time</div>
        </div>
        <div className="divide-y divide-slate-100">
          {visibleLogs.length ? visibleLogs.map((log) => (
            <article className="grid gap-3 px-5 py-4 text-sm text-slate-700 lg:grid-cols-[1.1fr_1fr_1fr_110px_150px] lg:items-center lg:gap-4" key={log.id}>
              <div className="min-w-0">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400 lg:hidden">Action</span>
                <p className="break-words font-semibold text-slate-900">{labelAction(log.action)}</p>
                <p className="mt-1 text-xs text-slate-500">{log.actorRole || "System"}</p>
              </div>
              <div className="min-w-0">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400 lg:hidden">User</span>
                <p className="break-words text-xs font-semibold text-slate-600">{log.actorEmail || "System"}</p>
              </div>
              <div className="min-w-0">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400 lg:hidden">Target</span>
                <p className="break-words text-xs font-semibold text-slate-600">{log.targetLabel || log.targetId || log.targetType || "System"}</p>
              </div>
              <div className="min-w-0">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400 lg:hidden">IP</span>
                <p className="break-words text-xs text-slate-500">{log.ipAddress || "Unknown"}</p>
              </div>
              <div className="min-w-0">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400 lg:hidden">Time</span>
                <p className="text-xs font-medium text-slate-500">{log.createdAt ? new Date(Number(log.createdAt)).toLocaleString() : "Unknown"}</p>
              </div>
            </article>
          )) : (
            <div className="p-8 text-center text-sm text-slate-500">{loading ? "Loading audit history..." : "No audit records found."}</div>
          )}
        </div>
      </div>
    </div>
  );
}
