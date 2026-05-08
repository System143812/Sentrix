export function TabNav({ tabs, activeTab, onSelect }) {
  return (
    <nav className="flex w-full min-w-0 snap-x items-center gap-1 overflow-x-auto rounded-lg border border-line bg-white p-1.5 shadow-sm lg:w-auto lg:flex-wrap lg:overflow-visible">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onSelect(tab)}
          className={`shrink-0 snap-start rounded-md px-4 py-2 text-sm font-semibold transition ${
            activeTab === tab
              ? "bg-ink text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100 hover:text-ink"
          }`}
        >
          {tab}
        </button>
      ))}
    </nav>
  );
}
