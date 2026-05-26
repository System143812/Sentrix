import { useEffect, useMemo, useState } from "react";
import { ClipboardList, RefreshCcw, LoaderCircle, ShieldAlert, X } from "lucide-react";
import { PageHeader } from "../components/PageHeader.jsx";
import { SearchFilterBar } from "../components/SearchFilterBar.jsx";
import { matchesSearch } from "../shared/utils.js";
import * as auditApi from "../services/auditApi.js";
import { Pagination } from "../components/Pagination.jsx";
import { usePaginationState } from "../hooks/usePaginationState.js";

function labelAction(action = "") {
  return action
    .replace(/^remote_/, "Remote ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AuditPage() {
  const [logs, setLogs] = useState([]);
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [pendingBlock, setPendingBlock] = useState(null);
  const [blockReason, setBlockReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { currentPage, pageSize, setCurrentPage, setPageSize } = usePaginationState("audit", 5);

  const filteredLogs = useMemo(
    () => logs.filter((log) => matchesSearch(log, query, ["actorEmail", "actorRole", "action", "targetLabel", "ipAddress", "macAddress"])),
    [logs, query],
  );

  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  async function loadLogs() {
    setLoading(true);
    setError("");
    try {
      setLogs(await auditApi.getAuditLogs({
        limit: 300,
        startDate: startDate ? new Date(`${startDate}T00:00:00.000`).getTime() : "",
        endDate: endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : "",
      }));
    } catch (err) {
      setError(err.message || "Unable to load logs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
  }, []);

  async function confirmBlock() {
    if (!pendingBlock) return;
    setLoading(true);
    setError("");
    try {
      await auditApi.blockAuditLogSubject(pendingBlock.id, blockReason);
      setPendingBlock(null);
      setBlockReason("");
      await loadLogs();
    } catch (err) {
      setError(err.message || "Unable to block this subject.");
    } finally {
      setLoading(false);
    }
  }

  // Reset to page 1 when query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [query]);

  return (
    <div className="space-y-6">
      {pendingBlock ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/55 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-rose-100 bg-rose-50 text-rose-600">
                <ShieldAlert size={24} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-slate-900">Block this subject?</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {pendingBlock.registeredUserRole
                    ? `This log belongs to a registered ${pendingBlock.registeredUserRole.replace("_", " ").toUpperCase()} account. Are you sure you want to block this user?`
                    : `Are you sure you want to block ${pendingBlock.macAddress || pendingBlock.actorEmail || "this user/MAC address"}?`}
                </p>
                <p className="mt-2 text-xs font-semibold text-slate-400">
                  Blocked access returns only "Failed" to avoid exposing block status.
                </p>
              </div>
              <button className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900" onClick={() => setPendingBlock(null)} type="button">
                <X size={18} />
              </button>
            </div>
            <textarea
              className="mt-5 min-h-24 w-full rounded-xl border border-slate-200 p-3 text-sm font-medium outline-none focus:border-slate-900"
              onChange={(event) => setBlockReason(event.target.value)}
              placeholder="Reason for blocking"
              value={blockReason}
            />
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button className="btn-minimal h-10 px-4" onClick={() => setPendingBlock(null)} type="button">Cancel</button>
              <button className="h-10 rounded-lg bg-rose-600 px-4 text-sm font-bold text-white shadow-lg shadow-rose-900/10 hover:bg-rose-700" onClick={confirmBlock} type="button">Block</button>
            </div>
          </div>
        </div>
      ) : null}

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
        count={filteredLogs.length}
        onQueryChange={setQuery}
        placeholder="Search by user, action, target, IP, or MAC"
        query={query}
      />

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-slate-500">
          From
          <input className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold normal-case tracking-normal text-slate-700 outline-none focus:border-slate-900" onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} />
        </label>
        <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-slate-500">
          To
          <input className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold normal-case tracking-normal text-slate-700 outline-none focus:border-slate-900" onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} />
        </label>
        <button className="btn-minimal h-10 px-4" disabled={loading} onClick={loadLogs} type="button">
          Apply date filter
        </button>
      </div>

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div> : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="hidden grid-cols-[1.1fr_1fr_1fr_110px_140px_80px] gap-4 bg-slate-50 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 lg:grid">
          <div>Action</div>
          <div>User</div>
          <div>Target</div>
          <div>IP</div>
          <div>MAC</div>
          <div>Time</div>
        </div>
        <div className="divide-y divide-slate-100">
          {paginatedLogs.length ? paginatedLogs.map((log) => (
            <article className="grid gap-3 px-5 py-4 text-sm text-slate-700 lg:grid-cols-[1.1fr_1fr_1fr_110px_140px_80px] lg:items-center lg:gap-4" key={log.id}>
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
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400 lg:hidden">MAC</span>
                <p className="break-words text-xs text-slate-500">{log.macAddress || "Unknown"}</p>
              </div>
              <div className="min-w-0">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400 lg:hidden">Time</span>
                <p className="text-xs font-medium text-slate-500">{log.createdAt ? new Date(Number(log.createdAt)).toLocaleString() : "Unknown"}</p>
                <button
                  className="mt-2 rounded-md border border-rose-100 bg-rose-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={log.blocked || (!log.macAddress && !log.actorEmail)}
                  onClick={() => setPendingBlock(log)}
                  type="button"
                >
                  {log.blocked ? "Blocked" : "Block"}
                </button>
              </div>
            </article>
          )) : (
            <div className="p-8 text-center text-sm text-slate-500">{loading ? "Loading audit history..." : "No audit records found."}</div>
          )}
        </div>
        
        <Pagination
          currentPage={currentPage}
          totalItems={filteredLogs.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
}
