export function MetricPill({ icon: Icon, label, value }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 rounded-md border border-line bg-slate-50 px-2.5 py-2 text-xs">
      <Icon className="shrink-0 text-slate-500" size={14} />
      <span className="shrink-0 text-slate-500">{label}</span>
      <strong className="ml-auto min-w-0 truncate text-ink" title={String(value)}>
        {value}
      </strong>
    </span>
  );
}
