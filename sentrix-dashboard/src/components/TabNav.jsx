function NavTooltip({ label }) {
  return (
    <span className="pointer-events-none absolute left-1/2 top-12 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-slate-100 bg-slate-900 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white shadow-xl group-hover:block transition-all animate-in fade-in slide-in-from-top-1">
      {label}
      <div className="absolute bottom-full left-1/2 -ml-1 border-4 border-transparent border-b-slate-900" />
    </span>
  );
}

export function TabNav({ tabs, activeTab, onSelect }) {
  return (
    <nav className="flex w-full min-w-0 snap-x items-center gap-1.5 overflow-x-auto rounded-xl border border-slate-200/60 bg-white p-1.5 shadow-sm lg:w-auto lg:flex-wrap lg:overflow-visible font-ui">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;

        return (
          <div className="group relative shrink-0 snap-start" key={tab.id}>
            <button
              type="button"
              onClick={() => onSelect(tab.id)}
              title={tab.label}
              aria-label={tab.label}
              className={`grid h-10 w-10 place-items-center rounded-lg transition-all active:scale-[0.9] ${
                active
                  ? "bg-slate-900 text-white shadow-lg shadow-slate-900/20 scale-105"
                  : "text-slate-400 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Icon size={18} strokeWidth={active ? 2.5 : 2} />
            </button>
            <NavTooltip label={tab.label} />
          </div>
        );
      })}
    </nav>
  );
}
