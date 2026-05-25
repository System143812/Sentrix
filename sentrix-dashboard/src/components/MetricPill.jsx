export function MetricPill({ icon: Icon, label, value }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2.5 rounded-lg border border-slate-200/60 bg-slate-50/70 px-2.5 py-2 text-xs transition hover:border-slate-200 hover:bg-white">
      <Icon className="shrink-0 text-slate-400" size={14} strokeWidth={2.2} />
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <strong className="ml-auto min-w-0 truncate font-semibold text-slate-800" title={String(value)}>
        {value}
      </strong>
    </span>
  );
}
