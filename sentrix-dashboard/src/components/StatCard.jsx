const tones = {
  default: "border-blue-100 bg-blue-50 text-blue-700",
  green: "border-emerald-100 bg-emerald-50 text-emerald-700",
  red: "border-red-100 bg-red-50 text-red-700",
};

export function StatCard({ icon: Icon, label, value = 0, tone = "default" }) {
  return (
    <article className="rounded-lg border border-line bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <span className={`rounded-md border p-2 ${tones[tone]}`}>
          <Icon size={18} />
        </span>
      </div>
      <strong className="mt-3 block text-3xl">{value}</strong>
    </article>
  );
}
