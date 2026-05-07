export function TabNav({ tabs, activeTab, onSelect }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-white p-1.5 shadow-sm">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onSelect(tab)}
          className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
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
