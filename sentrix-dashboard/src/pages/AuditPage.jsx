import { useEffect, useMemo, useState } from "react";
import { ClipboardList, RefreshCcw, LoaderCircle, ShieldAlert, X, User, Monitor, Globe, Clock, ShieldBan, CheckCircle2 } from "lucide-react";
import { PageHeader } from "../components/PageHeader.jsx";
import { SearchFilterBar } from "../components/SearchFilterBar.jsx";
import { DateFilterBar } from "../components/DateFilterBar.jsx";
import { matchesSearch, labelAction } from "../shared/utils.js";
import * as auditApi from "../services/auditApi.js";
import { Pagination } from "../components/Pagination.jsx";
import { usePaginationState } from "../hooks/usePaginationState.js";

const getActionColor = (action = "") => {
  const a = action.toLowerCase();
  if (a.includes("block") || a.includes("delete") || a.includes("fail") || a.includes("stop") || a.includes("kill")) return "text-rose-600 bg-rose-50 border-rose-100";
  if (a.includes("update") || a.includes("edit") || a.includes("change") || a.includes("restart")) return "text-amber-600 bg-amber-50 border-amber-100";
  if (a.includes("login") || a.includes("start") || a.includes("deploy") || a.includes("create")) return "text-emerald-600 bg-emerald-50 border-emerald-100";
  return "text-indigo-600 bg-indigo-50 border-indigo-100";
};

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
    <div className="page-reveal space-y-6">
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
        backgroundImage="/audit_header.jpg"
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

      <DateFilterBar
        endDate={endDate}
        loading={loading}
        onApply={loadLogs}
        onEndDateChange={setEndDate}
        onStartDateChange={setStartDate}
        startDate={startDate}
      />

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div> : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md">
        <div className="hidden grid-cols-[1.2fr_1.2fr_1.2fr_1.1fr_130px] gap-6 bg-slate-50/50 px-6 py-4 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 lg:grid border-b border-slate-100">
          <div>Log Activity</div>
          <div>Actor & Entity</div>
          <div>Asset Context</div>
          <div>Network Origin</div>
          <div className="text-right">Management</div>
        </div>
        <div className="divide-y divide-slate-100">
          {paginatedLogs.length ? (
            paginatedLogs.map((log) => (
              <article
                className="group flex flex-col gap-6 p-6 transition-all hover:bg-slate-50/30 lg:grid lg:grid-cols-[1.2fr_1.2fr_1.2fr_1.1fr_130px] lg:items-center lg:gap-6"
                key={log.id}
              >
                {/* 1. Action & Timestamp */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 lg:mb-1.5">
                    <span
                      className={`inline-flex shrink-0 rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${getActionColor(
                        log.action
                      )}`}
                    >
                      {labelAction(log.action)}
                    </span>
                    {log.blocked && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-rose-500">
                        <ShieldBan size={10} strokeWidth={3} />
                        Blocked
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-slate-500 lg:mt-0">
                    <Clock size={12} className="shrink-0 text-slate-300" />
                    <p className="text-xs font-medium tabular-nums">
                      {log.createdAt ? new Date(Number(log.createdAt)).toLocaleString() : "Unknown"}
                    </p>
                  </div>
                </div>

                {/* 2. User/Actor Info */}
                <div className="min-w-0">
                  <span className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-400 lg:hidden">
                    Actor
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-slate-400 transition-colors group-hover:border-slate-200 group-hover:bg-white group-hover:text-slate-600">
                      <User size={18} strokeWidth={2} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-800">
                        {log.actorEmail || "System Engine"}
                      </p>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {log.actorRole || "Automated"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 3. Target/Asset Info */}
                <div className="min-w-0">
                  <span className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-400 lg:hidden">
                    Target Asset
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-slate-400 transition-colors group-hover:border-slate-200 group-hover:bg-white group-hover:text-slate-600">
                      <Monitor size={18} strokeWidth={2} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-800">
                        {log.targetLabel || log.targetId || "System"}
                      </p>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {log.targetType || "Service"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 4. Network Info */}
                <div className="min-w-0">
                  <span className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-400 lg:hidden">
                    Network Context
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-slate-400 transition-colors group-hover:border-slate-200 group-hover:bg-white group-hover:text-slate-600">
                      <Globe size={18} strokeWidth={2} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-data text-xs font-bold text-slate-700">
                        {log.ipAddress || "Internal"}
                      </p>
                      <p className="mt-0.5 font-data text-[10px] font-bold text-slate-400">
                        {log.macAddress || "No MAC Recorded"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 5. Actions */}
                <div className="flex items-center justify-between border-t border-slate-50 pt-5 lg:justify-end lg:border-0 lg:pt-0">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 lg:hidden">
                    Audit Controls
                  </span>
                  <button
                    className={`inline-flex h-9 items-center gap-2 rounded-lg border px-4 text-[10px] font-bold uppercase tracking-widest transition-all active:scale-[0.97] ${
                      log.blocked
                        ? "border-emerald-100 bg-emerald-50 text-emerald-600 shadow-sm shadow-emerald-600/5 cursor-default"
                        : "border-rose-100 bg-rose-50 text-rose-600 shadow-sm shadow-rose-600/5 hover:bg-rose-100 hover:border-rose-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    }`}
                    disabled={log.blocked || (!log.macAddress && !log.actorEmail)}
                    onClick={() => setPendingBlock(log)}
                    type="button"
                  >
                    {log.blocked ? (
                      <>
                        <CheckCircle2 size={14} strokeWidth={3} />
                        Blocked
                      </>
                    ) : (
                      <>
                        <ShieldBan size={14} strokeWidth={3} />
                        Block
                      </>
                    )}
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="p-12 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-300">
                <ClipboardList size={24} />
              </div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                {loading ? "Decrypting Logs..." : "Zero Audit Entries"}
              </p>
            </div>
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
