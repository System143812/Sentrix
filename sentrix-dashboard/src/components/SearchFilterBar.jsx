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
    if (val === 0) return "text-slate-400";
    if (val < 10) return "text-blue-600 bg-blue-50/50";
    return "text-emerald-600 bg-emerald-50/50";
  };

  const getIndicatorStyles = (val) => {
    if (val === 0) return "bg-slate-300";
    if (val < 10) return "bg-blue-500";
    return "bg-emerald-500";
  };

  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-3 ${className}`}>
      {/* Search Input - Full width on mobile, flexible on desktop */}
      <div className="relative group w-full sm:flex-1 min-w-0">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-slate-900"
          size={16}
          strokeWidth={1.5}
        />
        <input
          className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-10 text-sm font-medium text-slate-700 outline-none transition-all duration-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 placeholder:text-slate-400 shadow-sm"
          onChange={(event) => onQueryChange?.(event.target.value)}
          placeholder={placeholder}
          value={query}
        />
        {query ? (
          <button
            className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-900"
            onClick={() => onQueryChange?.("")}
            type="button"
            aria-label="Clear search"
          >
            <X size={14} strokeWidth={2} />
          </button>
        ) : null}
      </div>

      {/* Filter and Results - Wraps on mobile, fixed side-cluster on desktop */}
      <div className="flex flex-1 sm:flex-none flex-wrap items-center gap-2 min-w-0">
        {filters.length > 0 && (
          <div className="flex items-center gap-2">
            {filters.map((filter) => (
              <div className="relative group w-32 sm:w-40 min-w-0" key={filter.id}>
                <select
                  className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-xs font-semibold text-slate-600 outline-none transition-all duration-200 hover:border-slate-300 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 cursor-pointer shadow-sm"
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
                <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <ChevronDown size={14} strokeWidth={1.5} />
                </div>
              </div>
            ))}
          </div>
        )}
        
        {count != null ? (
          <div
            className={`flex h-10 flex-1 sm:flex-none shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-[10px] font-semibold shadow-sm min-w-fit ${getCountStyles(count)}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${getIndicatorStyles(count)}`} />
            <span className="tabular-nums">{count}</span>
            <span className="opacity-60">Results</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
