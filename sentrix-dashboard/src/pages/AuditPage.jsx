import { useEffect, useMemo, useState, useCallback } from "react";
import { ClipboardList, RefreshCcw, LoaderCircle, ShieldAlert, X, User, Monitor, Globe, Clock, ShieldBan, CheckCircle2, Plus } from "lucide-react";
import { io } from "socket.io-client";
import { PageHeader } from "../components/PageHeader.jsx";
import { SearchFilterBar } from "../components/SearchFilterBar.jsx";
import { DateFilterBar } from "../components/DateFilterBar.jsx";
import { matchesSearch, labelAction } from "../shared/utils.js";
import * as auditApi from "../services/auditApi.js";
import { getApiUrl } from "../services/api.js";
import { Pagination } from "../components/Pagination.jsx";
import { usePaginationState } from "../hooks/usePaginationState.js";
import { BlurOverlay } from "../components/BlurOverlay.jsx";

const apiUrl = getApiUrl();

const getActionColor = (action = "") => {
  const a = action.toLowerCase();
  if (a.includes("block") || a.includes("delete") || a.includes("fail") || a.includes("stop") || a.includes("kill") || a.includes("revoke")) return "text-rose-600 bg-rose-50 border-rose-100";
  if (a.includes("update") || a.includes("edit") || a.includes("change") || a.includes("restart")) return "text-amber-600 bg-amber-50 border-amber-100";
  if (a.includes("login") || a.includes("start") || a.includes("deploy") || a.includes("create")) return "text-emerald-600 bg-emerald-50 border-emerald-100";
  return "text-indigo-600 bg-indigo-50 border-indigo-100";
};

export function AuditPage() {
  const [activeTab, setActiveTab] = useState("logs");
  const [logs, setLogs] = useState([]);
  const [authorityRecords, setAuthorityRecords] = useState([]);
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [pendingBlock, setPendingBlock] = useState(null);
  const [pendingRevoke, setPendingRevoke] = useState(null);
  const [isAddingWhitelist, setIsAddingWhitelist] = useState(false);
  const [newWhitelist, setNewWhitelist] = useState({ label: "", type: "ip", identifier: "" });
  const [reason, setReason] = useState("");
  const [unblockTarget, setUnblockTarget] = useState({ ip: true, mac: true });
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  // Sync unblock targets when modal opens
  useEffect(() => {
    if (pendingRevoke) {
      setUnblockTarget({
        ip: pendingRevoke.block_target === 'all' || pendingRevoke.block_target === 'ip',
        mac: pendingRevoke.block_target === 'all' || pendingRevoke.block_target === 'mac'
      });
    }
  }, [pendingRevoke]);

  const { currentPage, pageSize, setCurrentPage, setPageSize } = usePaginationState("audit", 5);

  const filteredLogs = useMemo(
    () => logs.filter((log) => matchesSearch(log, query, ["actorEmail", "actorRole", "action", "targetLabel", "ipAddress", "macAddress"])),
    [logs, query],
  );

  const filteredAuthority = useMemo(
    () => authorityRecords.filter((s) => matchesSearch(s, query, ["label", "identifier", "reason", "role", "subject_type", "ip_address", "mac_address"])),
    [authorityRecords, query],
  );

  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  const paginatedAuthority = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAuthority.slice(start, start + pageSize);
  }, [filteredAuthority, currentPage, pageSize]);

  async function loadLogs() {
    setLoading(true);
    setLogs([]); // Clear previous logs immediately to prevent leakage
    setError("");
    try {
      const data = await auditApi.getAuditLogs({
        limit: 300,
        startDate: startDate ? new Date(`${startDate}T00:00:00.000`).getTime() : "",
        endDate: endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : "",
      });
      setLogs(data);
    } catch (err) {
      setError(err.message || "Unable to load logs.");
    } finally {
      setLoading(false);
    }
  }

  async function loadAuthority() {
    if (activeTab === "logs") return;
    setLoading(true);
    setAuthorityRecords([]); // Clear records immediately to prevent leakage
    setError("");
    try {
      const category = activeTab === "whitelist" ? "whitelist" : (activeTab === "perimeter" ? "blacklist" : "rate_limit");
      const data = await auditApi.getAuthorityRecords(category);
      setAuthorityRecords(data);
    } catch (err) {
      setError(err.message || `Unable to load ${activeTab} data.`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === "logs") loadLogs();
    else loadAuthority();
  }, [activeTab]);

  async function confirmBlock() {
    if (!pendingBlock) return;
    if (!reason.trim()) {
      setError("Please provide a reason for blocking this identity.");
      return;
    }
    setProcessing(true);
    setError("");
    try {
      await auditApi.blockAuditLogSubject(pendingBlock.id, reason);
      setPendingBlock(null);
      setReason("");
      await loadLogs();
    } catch (err) {
      setError(err.message || "Unable to block this identity.");
    } finally {
      setProcessing(false);
    }
  }

  async function confirmRevoke() {
    if (!pendingRevoke) return;
    setProcessing(true);
    setError("");
    try {
      const target = (unblockTarget.ip && unblockTarget.mac) ? "all" : (unblockTarget.ip ? "ip" : "mac");
      await auditApi.revokeAuthority(pendingRevoke.id, reason, target);
      setPendingRevoke(null);
      setReason("");
      setUnblockTarget({ ip: true, mac: true });
      await loadAuthority();
    } catch (err) {
      setError(err.message || "Unable to revoke authority for this subject.");
    } finally {
      setProcessing(false);
    }
  }

  async function handleAddWhitelist() {
    if (!newWhitelist.label || !newWhitelist.identifier) return;
    setProcessing(true);
    setError("");
    try {
      await auditApi.addToWhitelist(newWhitelist);
      setIsAddingWhitelist(false);
      setNewWhitelist({ label: "", type: "ip", identifier: "" });
      await loadAuthority();
    } catch (err) {
      setError(err.message || "Unable to whitelist device.");
    } finally {
      setProcessing(false);
    }
  }

  // Reset to page 1 when query/tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [query, activeTab]);

  useEffect(() => {
    const socket = io(apiUrl, {
      withCredentials: true,
      query: { role: "dashboard" },
    });

    socket.on("audit:new", (newLog) => {
      setLogs((prev) => {
        // Prevent duplicates and only add if within current view range (if filtering by date)
        if (prev.some((l) => l.id === newLog.id)) return prev;
        
        // If we have date filters, check if new log fits
        if (startDate && newLog.createdAt < new Date(`${startDate}T00:00:00.000`).getTime()) return prev;
        if (endDate && newLog.createdAt > new Date(`${endDate}T23:59:59.999`).getTime()) return prev;

        return [newLog, ...prev].slice(0, 500); // Keep buffer manageable
      });
    });

    socket.on("authority:update", ({ category }) => {
      // Background refresh if current tab matches the category updated
      if (activeTab === "whitelist" && category === "whitelist") loadAuthority();
      if (activeTab === "ratelimit" && category === "rate_limit") loadAuthority();
      if (activeTab === "perimeter" && category === "blacklist") loadAuthority();
    });

    return () => {
      socket.disconnect();
    };
  }, [apiUrl, activeTab, startDate, endDate]);

  return (
    <div className="page-reveal space-y-6">
      {/* Whitelist Modal */}
      <BlurOverlay isOpen={isAddingWhitelist} onClose={() => setIsAddingWhitelist(false)} className="z-[80]" containerClassName="w-full max-w-lg">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-600">
              <Plus size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-bold text-slate-900">Authorize New Device</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Manually add a trusted IP or MAC address to the whitelist.
              </p>
            </div>
            <button className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900" onClick={() => setIsAddingWhitelist(false)} type="button">
              <X size={18} />
            </button>
          </div>
          
          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Display Label</label>
              <input
                className="w-full h-11 px-4 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:border-slate-900"
                placeholder="e.g. Admin Phone, Lab Printer"
                value={newWhitelist.label}
                onChange={(e) => setNewWhitelist({ ...newWhitelist, label: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Identifier Type</label>
                <select
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:border-slate-900 bg-white"
                  value={newWhitelist.type}
                  onChange={(e) => setNewWhitelist({ ...newWhitelist, type: e.target.value })}
                >
                  <option value="ip">IP Address</option>
                  <option value="mac">MAC Address</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Identifier Value</label>
                <input
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:border-slate-900"
                  placeholder={newWhitelist.type === 'ip' ? '192.168.1.1' : '00:11:22...'}
                  value={newWhitelist.identifier}
                  onChange={(e) => setNewWhitelist({ ...newWhitelist, identifier: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button className="btn-minimal h-10 px-4" onClick={() => setIsAddingWhitelist(false)} type="button">Cancel</button>
            <button 
              className="h-10 rounded-lg bg-slate-900 px-6 text-sm font-bold text-white shadow-lg hover:bg-black disabled:opacity-50" 
              onClick={handleAddWhitelist} 
              type="button" 
              disabled={!newWhitelist.label || !newWhitelist.identifier}
            >
              Add to Whitelist
            </button>
          </div>
        </div>
      </BlurOverlay>

      {/* Block Confirmation Modal */}
      <BlurOverlay isOpen={!!pendingBlock} onClose={() => setPendingBlock(null)} className="z-[80]" containerClassName="w-full max-w-lg">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-rose-100 bg-rose-50 text-rose-600">
              <ShieldBan size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-bold text-slate-900">Block this identity?</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                This will add the device to the <strong>Security Perimeter</strong> and permanently block all API access until manually unblocked.
              </p>
            </div>
            <button className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900" onClick={() => setPendingBlock(null)} type="button" disabled={processing}>
              <X size={18} />
            </button>
          </div>
          <textarea
            className="mt-5 min-h-24 w-full rounded-xl border border-slate-200 p-3 text-sm font-medium outline-none focus:border-slate-900"
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason for blocking (Required)"
            value={reason}
            disabled={processing}
          />
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button className="btn-minimal h-10 px-4" onClick={() => setPendingBlock(null)} type="button" disabled={processing}>Cancel</button>
            <button 
              className="relative overflow-hidden h-10 rounded-lg bg-rose-600 px-6 text-sm font-bold text-white shadow-lg shadow-rose-900/10 hover:bg-rose-700 disabled:opacity-70" 
              onClick={confirmBlock} 
              type="button" 
              disabled={!reason.trim() || processing}
            >
              <div className={`flex items-center justify-center gap-2 ${processing ? 'opacity-0' : 'opacity-100'}`}>
                <span>Block Identity</span>
              </div>
              {processing && (
                <div className="absolute inset-0 flex items-center justify-center bg-rose-600/50 backdrop-blur-[1px]">
                  <LoaderCircle className="animate-spin" size={18} />
                </div>
              )}
            </button>
          </div>
        </div>
      </BlurOverlay>

      {/* Revoke Modal */}
      <BlurOverlay isOpen={!!pendingRevoke} onClose={() => setPendingRevoke(null)} className="z-[80]" containerClassName="w-full max-w-lg">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
          <div className="flex items-start gap-4">
            <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl border ${activeTab === 'whitelist' ? 'border-rose-100 bg-rose-50 text-rose-600' : (activeTab === 'perimeter' ? 'border-rose-100 bg-rose-50 text-rose-600' : 'border-emerald-100 bg-emerald-50 text-emerald-600')}`}>
              {activeTab === 'whitelist' || activeTab === 'perimeter' ? <ShieldBan size={24} /> : <CheckCircle2 size={24} />}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-bold text-slate-900">
                {activeTab === 'whitelist' ? 'Revoke Trust?' : (activeTab === 'perimeter' ? 'Unblock Asset?' : 'Restore Access?')}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {activeTab === 'whitelist' ? (
                  <>Are you sure you want to remove <strong>{pendingRevoke?.label}</strong> from the trusted fleet?</>
                ) : activeTab === 'perimeter' ? (
                  <>Are you sure you want to unblock <strong>{pendingRevoke?.label}</strong> from the security perimeter?</>
                ) : (
                  <>Are you sure you want to restore access for <strong>{pendingRevoke?.label}</strong>?</>
                )}
              </p>
            </div>
            <button className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900" onClick={() => { setPendingRevoke(null); setUnblockTarget({ ip: true, mac: true }); }} type="button" disabled={processing}>
              <X size={18} />
            </button>
          </div>

          {/* Granular Unblock Controls */}
          {activeTab !== 'whitelist' && (pendingRevoke?.ip_address || pendingRevoke?.mac_address) && (
            <div className="mt-6 p-4 rounded-xl border border-slate-100 bg-slate-50/50 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Select Identity Targets to Restore</p>
              <div className="flex flex-wrap gap-4">
                {pendingRevoke?.ip_address && (
                  <label className={`flex items-center gap-2 cursor-pointer group ${pendingRevoke.block_target === 'mac' ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}>
                    <input 
                      type="checkbox" 
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                      checked={pendingRevoke.block_target === 'mac' ? false : unblockTarget.ip}
                      onChange={(e) => setUnblockTarget({ ...unblockTarget, ip: e.target.checked })}
                      disabled={processing || pendingRevoke.block_target === 'mac'}
                    />
                    <span className={`text-sm font-bold text-slate-700 group-hover:text-slate-900 ${pendingRevoke.block_target === 'mac' ? 'line-through' : ''}`}>
                      IP: {pendingRevoke.ip_address}
                    </span>
                  </label>
                )}
                {pendingRevoke?.mac_address && (
                  <label className={`flex items-center gap-2 cursor-pointer group ${pendingRevoke.block_target === 'ip' ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}>
                    <input 
                      type="checkbox" 
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                      checked={pendingRevoke.block_target === 'ip' ? false : unblockTarget.mac}
                      onChange={(e) => setUnblockTarget({ ...unblockTarget, mac: e.target.checked })}
                      disabled={processing || pendingRevoke.block_target === 'ip'}
                    />
                    <span className={`text-sm font-bold text-slate-700 group-hover:text-slate-900 ${pendingRevoke.block_target === 'ip' ? 'line-through' : ''}`}>
                      MAC: {pendingRevoke.mac_address}
                    </span>
                  </label>
                )}
              </div>
              <p className="text-[10px] italic text-slate-400">
                {pendingRevoke.block_target === 'all' && unblockTarget.ip && unblockTarget.mac ? "Full restoration: Device can reconnect immediately." : 
                 (unblockTarget.ip || pendingRevoke.block_target === 'mac') && (unblockTarget.mac || pendingRevoke.block_target === 'ip') ? "Full restoration: Restoring remaining identifier." :
                 unblockTarget.ip ? "Partial: IP will be restored, hardware remains blocked." :
                 unblockTarget.mac ? "Partial: Hardware will be restored, IP remains blocked." : 
                 "Select a target to continue."}
              </p>
            </div>
          )}

          <textarea
            className="mt-5 min-h-24 w-full rounded-xl border border-slate-200 p-3 text-sm font-medium outline-none focus:border-slate-900"
            onChange={(event) => setReason(event.target.value)}
            placeholder={`Reason for ${activeTab === 'whitelist' ? 'revoking' : (activeTab === 'perimeter' ? 'unblocking' : 'restoring')} (Required)`}
            value={reason}
            disabled={processing}
          />
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button className="btn-minimal h-10 px-4" onClick={() => { setPendingRevoke(null); setUnblockTarget({ ip: true, mac: true }); }} type="button" disabled={processing}>Cancel</button>
            <button 
              className={`relative overflow-hidden h-10 rounded-lg px-6 text-sm font-bold text-white shadow-lg disabled:opacity-70 ${(activeTab === 'whitelist' || activeTab === 'perimeter') ? 'bg-rose-600 shadow-rose-900/10 hover:bg-rose-700' : 'bg-emerald-600 shadow-emerald-900/10 hover:bg-emerald-700'}`} 
              onClick={confirmRevoke} 
              type="button" 
              disabled={!reason.trim() || processing || (!unblockTarget.ip && !unblockTarget.mac && activeTab !== 'whitelist')}
            >
              <div className={`flex items-center justify-center gap-2 ${processing ? 'opacity-0' : 'opacity-100'}`}>
                <span>
                  {activeTab === 'whitelist' ? 'Revoke Trust' : (activeTab === 'perimeter' ? 'Unblock Asset' : 'Restore Access')}
                </span>
              </div>
              {processing && (
                <div className={`absolute inset-0 flex items-center justify-center backdrop-blur-[1px] ${activeTab === 'whitelist' || activeTab === 'perimeter' ? 'bg-rose-600/50' : 'bg-emerald-600/50'}`}>
                  <LoaderCircle className="animate-spin" size={18} />
                </div>
              )}
            </button>
          </div>
        </div>
      </BlurOverlay>

      <PageHeader
        icon={ClipboardList}
        title="Authority & Audit Log"
        subtitle="Zero-Trust fleet oversight. Review access logs and manage trusted device authority."
        backgroundImage="/audit_header.jpg"
        action={
          <div className="flex gap-3">
            {activeTab === "whitelist" && (
              <button
                type="button"
                onClick={() => setIsAddingWhitelist(true)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-bold text-white shadow-xl transition hover:bg-emerald-700"
              >
                <Plus size={16} />
                <span>Add Device</span>
              </button>
            )}
            <button
              type="button"
              onClick={activeTab === "logs" ? loadLogs : loadAuthority}
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
          </div>
        }
      />

      {/* Premium Slate Tab Navigation - Responsive & Substantial */}
      <div className="relative flex items-center p-1 bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
        {/* Animated Active Pill Indicator */}
        <div 
          className="absolute h-[calc(100%-8px)] rounded-md bg-slate-900 transition-all duration-300 ease-in-out"
          style={{
            left: activeTab === 'logs' ? '4px' : 
                  activeTab === 'whitelist' ? 'calc(25% + 1px)' : 
                  activeTab === 'perimeter' ? 'calc(50% + 1px)' : 
                  'calc(75% + 1px)',
            width: 'calc(25% - 2px)',
          }}
        />

        {[
          { id: "logs", label: "Logs", icon: ClipboardList },
          { id: "whitelist", label: "Fleet", icon: CheckCircle2 },
          { id: "perimeter", label: "Security", icon: ShieldBan },
          { id: "ratelimit", label: "Throttled", icon: ShieldAlert }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative z-10 flex flex-1 items-center justify-center gap-2 h-9 px-3 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all duration-200 whitespace-nowrap ${
              activeTab === tab.id ? 'text-white' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <tab.icon size={14} strokeWidth={1.5} className="shrink-0" />
            <span className="hidden md:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      <SearchFilterBar
        count={activeTab === "logs" ? filteredLogs.length : filteredAuthority.length}
        onQueryChange={setQuery}
        placeholder={activeTab === "logs" ? "Search by user, action, target, IP, or MAC" : "Search by label, identifier, or reason"}
        query={query}
      />

      {activeTab === "logs" && (
        <DateFilterBar
          endDate={endDate}
          loading={loading}
          onApply={loadLogs}
          onEndDateChange={setEndDate}
          onStartDateChange={setStartDate}
          startDate={startDate}
        />
      )}

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div> : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md">
        {activeTab === "logs" ? (
          <>
            <div className="hidden grid-cols-[1.2fr_1.2fr_1.2fr_1.1fr_130px] gap-6 bg-slate-50/50 px-6 py-4 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 lg:grid border-b border-slate-100">
              <div>Log Activity</div>
              <div>Actor & Entity</div>
              <div>Asset Context</div>
              <div>Network Origin</div>
              <div className="text-right">Authority</div>
            </div>
            <div className="divide-y divide-slate-100">
              {paginatedLogs.length ? (
                paginatedLogs.map((log) => (
                  <article
                    className="group flex flex-col gap-6 p-6 transition-all hover:bg-slate-50/30 lg:grid lg:grid-cols-[1.2fr_1.2fr_1.2fr_1.1fr_130px] lg:items-center lg:gap-6"
                    key={`log-${log.id}`}
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
                        Authority
                      </span>
                      {log.isWhitelisted ? (
                        <div className="flex h-9 items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-widest text-emerald-600">
                          <CheckCircle2 size={14} strokeWidth={3} />
                          Authorized
                        </div>
                      ) : log.isThrottled ? (
                        <div className="flex h-9 items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-widest text-rose-600">
                          <ShieldBan size={14} strokeWidth={3} />
                          Hard Blocked
                        </div>
                      ) : (!log.macAddress && !log.actorEmail) ? (
                        <div className="flex h-9 items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          <ShieldBan size={14} strokeWidth={3} />
                          Unauthorized
                        </div>
                      ) : (
                        <button
                          className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-100 bg-rose-50 px-4 text-[10px] font-bold uppercase tracking-widest text-rose-600 shadow-sm shadow-rose-600/5 transition-all hover:bg-rose-100 hover:border-rose-200 active:scale-[0.97]"
                          onClick={() => { setPendingBlock(log); setReason(""); }}
                          type="button"
                        >
                          <ShieldBan size={14} strokeWidth={3} />
                          Unauthorized
                        </button>
                      )}
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
          </>
        ) : (
          <>
            <div className={`hidden gap-6 bg-slate-50/50 px-6 py-4 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 lg:grid border-b border-slate-100 ${
              activeTab === 'whitelist' ? 'grid-cols-[1.5fr_1fr_1.2fr_130px]' : 'grid-cols-[1.5fr_1fr_1.8fr_1.2fr_130px]'
            }`}>
              <div>Security Identity</div>
              <div>Category</div>
              {activeTab !== 'whitelist' && <div>{activeTab === 'perimeter' ? 'Block Reason' : 'Throttle Reason'}</div>}
              <div>{activeTab === 'whitelist' ? 'Authorized On' : (activeTab === 'perimeter' ? 'Blocked On' : 'Throttled On')}</div>
              <div className="text-right">Authority</div>
            </div>
            <div className="divide-y divide-slate-100">
              {paginatedAuthority.length ? (
                paginatedAuthority.map((subject) => (
                  <article
                    className={`group flex flex-col gap-6 p-6 transition-all hover:bg-slate-50/30 lg:grid lg:items-center lg:gap-6 ${
                      activeTab === 'whitelist' ? 'lg:grid-cols-[1.5fr_1fr_1.2fr_130px]' : 'lg:grid-cols-[1.5fr_1fr_1.8fr_1.2fr_130px]'
                    }`}
                    key={subject.id}
                  >
                    {/* 1. Identity */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors group-hover:bg-white ${
                          activeTab === 'whitelist' 
                            ? 'border-emerald-100 bg-emerald-50/50 text-emerald-600' 
                            : (activeTab === 'perimeter' ? 'border-rose-100 bg-rose-50/50 text-rose-600' : 'border-amber-100 bg-amber-50/50 text-amber-600')
                        }`}>
                          {subject.subject_type === 'user' ? <User size={18} /> : subject.subject_type === 'agent_id' ? <ShieldBan size={18} /> : <Monitor size={18} />}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-800">{subject.label}</p>
                          <div className="flex flex-col gap-0.5 mt-0.5">
                            {subject.ip_address && (
                              <p className={`font-data text-[10px] font-bold ${subject.block_target === 'mac' && activeTab !== 'whitelist' ? 'text-slate-300 line-through' : 'text-slate-500'}`}>
                                IP: {subject.ip_address}
                              </p>
                            )}
                            {subject.mac_address && (
                              <p className={`font-data text-[10px] font-bold ${subject.block_target === 'ip' && activeTab !== 'whitelist' ? 'text-slate-300 line-through' : 'text-slate-500'}`}>
                                MAC: {subject.mac_address}
                              </p>
                            )}
                            {!subject.ip_address && !subject.mac_address && (
                              <p className="font-data text-[10px] font-bold text-slate-400 truncate">{subject.identifier}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 2. Type */}
                    <div>
                      <span className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-400 lg:hidden">
                        Identity Category
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {activeTab !== 'whitelist' && subject.block_target === 'all' && subject.ip_address && subject.mac_address ? (
                          <>
                            <span className="inline-flex rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-600">IP</span>
                            <span className="inline-flex rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-600">MAC</span>
                          </>
                        ) : (
                          <span className="inline-flex rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-600">
                            {subject.block_target === 'all' ? subject.subject_type.replace('_', ' ') : subject.block_target}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 3. Context/Reason (Only for Perimeter/RateLimit) */}
                    {activeTab !== 'whitelist' && (
                      <div className="min-w-0">
                        <span className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-400 lg:hidden">
                          {activeTab === 'perimeter' ? 'Block Reason' : 'Throttle Reason'}
                        </span>
                        <p className="text-xs font-medium text-slate-600 line-clamp-2 italic leading-relaxed">
                          "{subject.reason || 'No reason provided'}"
                        </p>
                      </div>
                    )}

                    {/* 4. Date */}
                    <div>
                      <span className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-400 lg:hidden">
                        Event Timestamp
                      </span>
                      <div className="flex items-center gap-2 text-slate-500">
                        <Clock size={12} className="shrink-0 text-slate-300" />
                        <p className="text-xs font-medium tabular-nums">
                          {new Date(Number(subject.recorded_at)).toLocaleDateString(undefined, { 
                            year: 'numeric', 
                            month: 'short', 
                            day: 'numeric' 
                          })}
                        </p>
                      </div>
                    </div>

                    {/* 5. Authority Actions */}
                    <div className="flex items-center justify-between border-t border-slate-50 pt-5 lg:justify-end lg:border-0 lg:pt-0">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 lg:hidden">
                        Authority Controls
                      </span>
                      <button
                        className={`inline-flex h-9 items-center gap-2 rounded-lg border px-4 text-[10px] font-bold uppercase tracking-widest transition-all active:scale-[0.97] ${
                          (activeTab === 'whitelist' || activeTab === 'perimeter') 
                            ? 'border-rose-100 bg-rose-50 text-rose-600 shadow-sm shadow-rose-600/5 hover:bg-rose-100 hover:border-rose-200' 
                            : 'border-emerald-100 bg-emerald-50 text-emerald-600 shadow-sm shadow-emerald-600/5 hover:bg-emerald-100 hover:border-emerald-200'
                        }`}
                        onClick={() => { setPendingRevoke(subject); setReason(""); }}
                        type="button"
                      >
                        {(activeTab === 'whitelist' || activeTab === 'perimeter') ? (
                          <>
                            <ShieldBan size={14} strokeWidth={3} />
                            {(activeTab === 'whitelist' ? 'Revoke Trust' : 'Unblock Asset')}
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={14} strokeWidth={3} />
                            Restore Access
                          </>
                        )}
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="p-12 text-center">
                  <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${
                    activeTab === 'whitelist' ? 'bg-emerald-50 text-emerald-200' : (activeTab === 'perimeter' ? 'bg-rose-50 text-rose-200' : 'bg-amber-50 text-amber-200')
                  }`}>
                    {(activeTab === 'whitelist' || activeTab === 'perimeter') ? <ShieldBan size={28} /> : <CheckCircle2 size={28} />}
                  </div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                    {loading ? "Refreshing Security Cache..." : activeTab === 'whitelist' ? "Your Trusted Fleet is Empty" : (activeTab === 'perimeter' ? "No Manually Blocked Devices" : "No Throttled Subjects Found")}
                  </p>
                </div>
              )}
            </div>
          </>
        )}
        
        <Pagination
          currentPage={currentPage}
          totalItems={activeTab === "logs" ? filteredLogs.length : filteredAuthority.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
}
