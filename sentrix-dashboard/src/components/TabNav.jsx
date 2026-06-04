function NavTooltip({ label }) {
  return (
    <span className="pointer-events-none absolute left-1/2 top-12 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-[10px] font-semibold tracking-tight text-white shadow-sm lg:group-hover:block lg:group-focus-within:block">
      {label}
      <span className="absolute bottom-full left-1/2 -ml-1 border-4 border-transparent border-b-slate-900" />
    </span>
  );
}

export function TabNav({ tabs, activeTab, onSelect }) {
  const totalTabs = tabs.length;
  const activeIndex = tabs.findIndex(t => t.id === activeTab);

  return (
    <nav className="relative flex w-full max-w-sm snap-x items-center p-1 rounded-lg border border-slate-200 overflow-hidden lg:flex-wrap lg:overflow-visible">
      {/* Animated Active Pill Indicator */}
      <div 
        className="absolute h-[calc(100%-8px)] rounded-md bg-slate-900 transition-all duration-300 ease-in-out shadow-sm"
        style={{
          left: `calc(8px + ${activeIndex} * (100% - 8px) / ${totalTabs})`,
          width: `calc((100% - 8px) / ${totalTabs} - 8px)`,
        }}
      />

      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;

        return (
          <div className="relative group flex-1 shrink-0 snap-start" key={tab.id}>
            <button
              type="button"
              onClick={(event) => {
                onSelect(tab.id);
                event.currentTarget.blur();
              }}
              title={tab.label}
              aria-label={tab.label}
              className={`relative z-10 grid h-9 w-full place-items-center rounded-md transition-all duration-200 ${
                active ? "text-white" : "text-slate-400 hover:text-slate-900"
              }`}
            >
              <Icon size={18} strokeWidth={1.5} />
            </button>
            <NavTooltip label={tab.label} />
          </div>
        );
      })}
    </nav>
  );
}
