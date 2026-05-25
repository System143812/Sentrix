import { Filter, Search, X } from "lucide-react";

export function SearchFilterBar({
  query,
  onQueryChange,
  filters = [],
  count,
  placeholder = "Search",
  className = "",
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-3 rounded-xl p-3 sm:flex-row sm:items-center ${className}`}
    >
      <label className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          size={16}
        />
        <input
          className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-10 text-sm font-medium outline-none transition focus:border-slate-900 focus:bg-white focus:ring-4 focus:ring-slate-200/60"
          onChange={(event) => onQueryChange?.(event.target.value)}
          placeholder={placeholder}
          value={query}
        />
        {query ? (
          <button
            className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
            onClick={() => onQueryChange?.("")}
            type="button"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        ) : null}
      </label>

      <div className="flex flex-wrap items-center gap-2">
        {filters.map((filter) => (
          <label
            className="inline-flex h-11 min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-500 shadow-sm transition-colors hover:border-slate-300"
            key={filter.id}
          >
            <Filter className="shrink-0 text-slate-400" size={14} />
            <select
              className="min-w-0 bg-transparent outline-none text-slate-700"
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
          </label>
        ))}
        {count != null ? (
          <span
            className={`inline-flex h-11 items-center rounded-lg border px-3 text-xs font-semibold transition-colors ${
              count > 0
                ? "border-indigo-100 bg-indigo-50 text-indigo-600 shadow-sm shadow-indigo-100/50"
                : "border-slate-100 bg-slate-50 text-slate-500"
            }`}
          >
            {count} shown
          </span>
        ) : null}
      </div>
    </div>
  );
}
