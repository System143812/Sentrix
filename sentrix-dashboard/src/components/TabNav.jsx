function NavTooltip({ label }) {
  return (
    <span className="pointer-events-none absolute left-1/2 top-12 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-lg group-hover:block group-focus-within:block">
      {label}
    </span>
  );
}

export function TabNav({ tabs, activeTab, onSelect }) {
  return (
    <nav className="flex w-full min-w-0 snap-x items-center gap-1 overflow-x-auto rounded-lg border border-line bg-white p-1.5 shadow-sm lg:w-auto lg:flex-wrap lg:overflow-visible">
      {tabs.map((tab) => {
        const Icon = tab.icon;

        return (
          <div className="group relative shrink-0 snap-start" key={tab.id}>
            <button
              type="button"
              onClick={() => onSelect(tab.id)}
              title={tab.label}
              aria-label={tab.label}
              className={`grid h-10 w-10 place-items-center rounded-md text-sm font-semibold transition ${
                activeTab === tab.id
                  ? "bg-ink text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-ink"
              }`}
            >
              <Icon size={18} />
            </button>
            <NavTooltip label={tab.label} />
          </div>
        );
      })}
    </nav>
  );
}
