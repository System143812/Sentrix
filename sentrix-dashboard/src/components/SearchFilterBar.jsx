import { Filter, Search, X, ChevronDown } from "lucide-react";

/**
 * A professional, high-end search and filter bar.
 * Features dynamic result colors and responsive full-width mobile layout.
 */
export function SearchFilterBar({
  query,
  onQueryChange,
  filters = [],
  count,
  placeholder = "Search",
  className = "",
}) {
  // Dynamic color logic for the results badge
  const getCountStyles = (val) => {
    if (val === 0) return "border-slate-100 bg-slate-50 text-slate-400";
    if (val < 10) return "border-blue-100 bg-blue-50 text-blue-600 shadow-sm shadow-blue-100/50";
    return "border-emerald-100 bg-emerald-50 text-emerald-600 shadow-sm shadow-emerald-100/50";
  };

  const getIndicatorStyles = (val) => {
    if (val === 0) return "bg-slate-300";
    if (val < 10) return "bg-blue-400 animate-pulse";
    return "bg-emerald-400 animate-pulse";
  };

  return (
    <div
      className={`flex min-w-0 flex-col gap-4 rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur-md sm:flex-row sm:items-center ${className}`}
    >
      <label className="relative min-w-0 flex-1 group">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-slate-900"
          size={18}
          strokeWidth={2}
        />
        <input
          className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-11 pr-11 text-sm font-medium text-slate-700 outline-none transition-all duration-200 hover:border-slate-300 hover:bg-white focus:border-slate-900 focus:bg-white focus:ring-4 focus:ring-slate-900/5 placeholder:font-normal placeholder:text-slate-400"
          onChange={(event) => onQueryChange?.(event.target.value)}
          placeholder={placeholder}
          value={query}
        />
        {query ? (
          <button
            className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-900 active:scale-90"
            onClick={() => onQueryChange?.("")}
            type="button"
            aria-label="Clear search"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        ) : null}
      </label>

      <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
        {filters.map((filter) => (
          <div className="relative group flex-1 sm:flex-initial min-w-0" key={filter.id}>
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-hover:text-slate-900">
              <Filter size={14} strokeWidth={2.5} />
            </div>
            <select
              className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-10 text-xs font-bold uppercase tracking-widest text-slate-500 outline-none transition-all duration-200 hover:border-slate-300 hover:bg-white focus:border-slate-900 focus:bg-white focus:ring-4 focus:ring-slate-900/5 cursor-pointer"
              onChange={(event) => filter.onChange?.(event.target.value)}
              value={filter.value}
              title={filter.label}
            >
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-transform group-hover:translate-y-[-40%] group-hover:text-slate-600">
              <ChevronDown size={14} strokeWidth={2.5} />
            </div>
          </div>
        ))}
        
        {count != null ? (
          <span
            className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl border px-4 text-[10px] font-bold uppercase tracking-widest transition-all duration-300 sm:w-auto sm:justify-start ${getCountStyles(count)}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${getIndicatorStyles(count)}`} />
            {count} Results
          </span>
        ) : null}
      </div>
    </div>
  );
}
