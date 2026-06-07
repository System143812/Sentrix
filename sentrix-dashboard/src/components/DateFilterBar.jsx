import { CalendarDays, Filter, Loader2 } from "lucide-react";

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
      className={`relative flex flex-wrap items-center gap-3 ${className}`}
    >
      <div className="flex flex-[3] min-w-[280px] items-center rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
        <label className="flex flex-1 items-center h-10 px-3 group min-w-0">
          <span className="flex items-center gap-2 text-xs font-semibold tracking-tight text-slate-400 whitespace-nowrap">
            <CalendarDays
              size={14}
              strokeWidth={1.5}
              className="hidden text-slate-300 transition-colors group-focus-within:text-slate-900 shrink-0 sm:inline-block"
            />
            <span>From</span>
          </span>
          <input
            className="w-full bg-transparent px-2 text-xs font-semibold text-slate-700 outline-none tabular-nums min-w-0"
            onChange={(event) => onStartDateChange?.(event.target.value)}
            type="date"
            value={startDate}
            max="9999-12-31"
          />
        </label>

        <div className="h-4 w-px bg-slate-200 shrink-0" />

        <label className="flex flex-1 items-center h-10 px-3 group min-w-0">
          <span className="flex items-center gap-2 text-xs font-semibold tracking-tight text-slate-400 whitespace-nowrap">
            <CalendarDays
              size={14}
              strokeWidth={1.5}
              className="hidden text-slate-300 transition-colors group-focus-within:text-slate-900 shrink-0 sm:inline-block"
            />
            <span>To</span>
          </span>
          <input
            className="w-full bg-transparent px-2 text-xs font-semibold text-slate-700 outline-none tabular-nums min-w-0"
            onChange={(event) => onEndDateChange?.(event.target.value)}
            type="date"
            value={endDate}
            max="9999-12-31"
          />
        </label>
      </div>

      <button
        className={`group relative flex h-10 flex-1 sm:flex-none min-w-[140px] items-center justify-center gap-2 rounded-lg px-6 text-xs font-semibold tracking-tight transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 shadow-sm ${
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
        <span>{loading ? "Applying..." : "Apply Filter"}</span>
      </button>
    </div>
  );
}
