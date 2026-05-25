import { Filter, Search, X } from "lucide-react";

export function matchesSearch(item, query, fields = []) {
  const normalizedQuery = String(query || "")
    .trim()
    .toLowerCase();
  if (!normalizedQuery) return true;

  const values = fields.length
    ? fields.map((field) =>
        typeof field === "function" ? field(item) : item?.[field],
      )
    : Object.values(item || {});

  return values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value) => value != null)
    .some((value) => String(value).toLowerCase().includes(normalizedQuery));
}

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
          className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-10 text-sm font-medium outline-none transition focus:border-slate-900 focus:bg-white focus:ring-4 focus:ring-slate-100"
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
            className="inline-flex h-11 min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-500 shadow-sm"
            key={filter.id}
          >
            <Filter size={14} />
            <select
              className="min-w-0 bg-transparent outline-none"
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
          <span className="inline-flex h-11 items-center rounded-lg border border-slate-100 bg-slate-50 px-3 text-xs font-bold text-slate-500">
            {count} shown
          </span>
        ) : null}
      </div>
    </div>
  );
}
