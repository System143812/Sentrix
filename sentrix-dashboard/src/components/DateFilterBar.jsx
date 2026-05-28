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
      className={`relative flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur-md sm:flex-row sm:items-end sm:justify-between sm:gap-6 ${className}`}
    >
      <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
        <label className="flex flex-1 flex-col gap-2">
          <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <CalendarDays size={14} className="text-slate-300" />
            Start Date
          </span>
          <div className="group relative">
            <input
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 text-sm font-semibold text-slate-700 outline-none transition-all duration-200 hover:border-slate-300 hover:bg-white focus:border-slate-900 focus:bg-white focus:ring-4 focus:ring-slate-900/5"
              onChange={(event) => onStartDateChange?.(event.target.value)}
              type="date"
              value={startDate}
              max="9999-12-31"
            />
          </div>
        </label>

        <div className="hidden pt-6 text-slate-300 sm:block">
          <ArrowRight size={16} strokeWidth={3} />
        </div>

        <label className="flex flex-1 flex-col gap-2">
          <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <CalendarDays size={14} className="text-slate-300" />
            End Date
          </span>
          <div className="group relative">
            <input
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 text-sm font-semibold text-slate-700 outline-none transition-all duration-200 hover:border-slate-300 hover:bg-white focus:border-slate-900 focus:bg-white focus:ring-4 focus:ring-slate-900/5"
              onChange={(event) => onEndDateChange?.(event.target.value)}
              type="date"
              value={endDate}
              max="9999-12-31"
            />
          </div>
        </label>
      </div>

      <button
        className={`group relative flex h-11 items-center justify-center gap-2 rounded-xl px-6 text-xs font-bold uppercase tracking-widest transition-all duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto ${
          loading
            ? "bg-slate-100 text-slate-400 border border-slate-200"
            : "bg-slate-900 text-white shadow-lg shadow-slate-900/10 hover:bg-slate-800 hover:shadow-slate-900/20"
        }`}
        disabled={loading}
        onClick={onApply}
        type="button"
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Filter size={16} className="transition-transform group-hover:rotate-12" />
        )}
        <span>{loading ? "Processing..." : "Apply Filter"}</span>
      </button>
    </div>
  );
}
