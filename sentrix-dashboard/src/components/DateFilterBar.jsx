import { CalendarDays } from "lucide-react";

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
      className={`grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end ${className}`}
    >
      <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-slate-500">
        <span className="flex items-center gap-1.5">
          <CalendarDays size={12} className="text-slate-400" />
          From
        </span>
        <input
          className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold normal-case tracking-normal text-slate-700 outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-100"
          onChange={(event) => onStartDateChange?.(event.target.value)}
          type="date"
          value={startDate}
        />
      </label>
      <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-slate-500">
        <span className="flex items-center gap-1.5">
          <CalendarDays size={12} className="text-slate-400" />
          To
        </span>
        <input
          className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold normal-case tracking-normal text-slate-700 outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-100"
          onChange={(event) => onEndDateChange?.(event.target.value)}
          type="date"
          value={endDate}
        />
      </label>
      <button
        className="btn-minimal h-10 px-4 transition-all active:scale-95"
        disabled={loading}
        onClick={onApply}
        type="button"
      >
        Apply filter
      </button>
    </div>
  );
}
