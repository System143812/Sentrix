import { CalendarDays, Filter, Loader2, ArrowRight } from "lucide-react";

/**
 * A professional date range filter bar following the Sentrix brand identity (Slate-900).
 * 
 * @param {string} startDate - YYYY-MM-DD format
 * @param {string} endDate - YYYY-MM-DD format
 * @param {function} onStartDateChange
 * @param {function} onEndDateChange
 * @param {function} onApply
 * @param {boolean} loading
 * @param {string} className
 */
export function DateFilterBar({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onApply,
  loading = false,
  className = "",
}) {
  return (
    <div
      className={`relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <div className="flex flex-1 items-center rounded-lg border border-slate-200 bg-white overflow-hidden">
        <label className="flex flex-1 items-center h-10 px-3 group">
          <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">
            <CalendarDays size={14} strokeWidth={1.5} className="text-slate-300 transition-colors group-focus-within:text-slate-900" />
            From
          </span>
          <input
            className="w-full bg-transparent px-2 text-xs font-bold text-slate-700 outline-none tabular-nums"
            onChange={(event) => onStartDateChange?.(event.target.value)}
            type="date"
            value={startDate}
            max="9999-12-31"
          />
        </label>

        <div className="h-4 w-px bg-slate-200 shrink-0" />

        <label className="flex flex-1 items-center h-10 px-3 group">
          <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">
            <CalendarDays size={14} strokeWidth={1.5} className="text-slate-300 transition-colors group-focus-within:text-slate-900" />
            To
          </span>
          <input
            className="w-full bg-transparent px-2 text-xs font-bold text-slate-700 outline-none tabular-nums"
            onChange={(event) => onEndDateChange?.(event.target.value)}
            type="date"
            value={endDate}
            max="9999-12-31"
          />
        </label>
      </div>

      <button
        className={`group relative flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-6 text-[10px] font-bold uppercase tracking-widest transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto ${
          loading
            ? "bg-slate-100 text-slate-400 border border-slate-200"
            : "bg-slate-900 text-white hover:bg-black"
        }`}
        disabled={loading}
        onClick={onApply}
        type="button"
      >
        {loading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Filter size={14} strokeWidth={1.5} />
        )}
        <span>{loading ? "Processing..." : "Filter Range"}</span>
      </button>
    </div>
  );
}
