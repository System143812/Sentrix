import { Search, X, ChevronDown } from "lucide-react";

/**
 * A professional, high-end search and filter bar.
 * Features dynamic result colors and integrated results count badge inside the search input.
 */
export function SearchFilterBar({
  query,
  onQueryChange,
  filters = [],
  count,
  placeholder = "Search",
  className = "",
  actionButton,
}) {
  // Dynamic color logic for the results badge
  const getCountStyles = (val) => {
    if (val === 0) return "text-slate-400 bg-slate-50";
    if (val < 10) return "text-blue-600 bg-blue-50/80";
    return "text-emerald-600 bg-emerald-50/80";
  };

  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-3 ${className}`}>
      {/* Search Input with Integrated Results Count and Clear Button */}
      <div className="relative group w-full sm:flex-1 sm:min-w-[280px] min-w-0">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-slate-900 z-10"
          size={16}
          strokeWidth={1.5}
        />
        <input
          className={`h-10 w-full rounded-md border border-slate-200 bg-white pl-10 text-sm font-medium text-slate-700 outline-none transition-all duration-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 placeholder:text-slate-400 shadow-sm ${
            query && count != null ? 'pr-24 sm:pr-28' : query ? 'pr-12' : count != null ? 'pr-16 sm:pr-20' : 'pr-4'
          }`}
          onChange={(event) => onQueryChange?.(event.target.value)}
          placeholder={placeholder}
          value={query}
        />

        {/* Right Action Cluster: Clear button + Results Badge */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {query ? (
            <button
              className="grid h-7 w-7 place-items-center rounded text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-900"
              onClick={() => onQueryChange?.("")}
              type="button"
              aria-label="Clear search"
              title="Clear search"
            >
              <X size={14} strokeWidth={2} />
            </button>
          ) : null}

          {count != null ? (
            <div
              className={`flex h-6 items-center justify-center gap-1.5 rounded px-2 text-[10px] font-bold shadow-2xs ${getCountStyles(
                count,
              )}`}
              title={`${count} results found`}
            >
              <span className="tabular-nums">{count}</span>
              <span className="opacity-60 hidden sm:inline">Results</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Filter Dropdowns & Action Button - Side-cluster on desktop */}
      {(filters.length > 0 || actionButton) && (
        <div className="flex w-full sm:w-auto sm:flex-none flex-wrap items-center gap-2 min-w-0">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {filters.map((filter) => (
              <div className="relative group w-full sm:flex-1 min-w-0" key={filter.id}>
                <select
                  className="h-10 w-full appearance-none rounded-md border border-slate-200 bg-white pl-3 pr-8 text-xs font-semibold text-slate-600 outline-none transition-all duration-200 hover:border-slate-300 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 cursor-pointer shadow-sm"
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
            {actionButton}
          </div>
        </div>
      )}
    </div>
  );
}
