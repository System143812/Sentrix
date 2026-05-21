export function MetricPill({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2 transition-all hover:bg-white hover:border-slate-200">
      <Icon className="shrink-0 text-slate-400" size={13} strokeWidth={2.5} />
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 leading-none mb-0.5 font-ui">{label}</p>
        <p className="text-xs font-bold text-slate-700 leading-tight font-data truncate" title={String(value)}>
          {value}
        </p>
      </div>
    </div>
  );
}
