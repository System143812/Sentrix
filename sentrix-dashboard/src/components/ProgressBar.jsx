import { PROGRESS_BAR_COLORS } from "../styles/tones.js";

export function ProgressBar({
  value = 0,
  max = 100,
  color = "emerald",
  height = "h-3",
  showLabel = false,
  label = "",
  className = "",
}) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const colorClass = PROGRESS_BAR_COLORS[color] || PROGRESS_BAR_COLORS.emerald;

  return (
    <div className={className}>
      {showLabel && label && (
        <p className="mb-1 text-xs font-semibold text-slate-500">{label}</p>
      )}
      <div className={`w-full overflow-hidden rounded-full bg-slate-100 ${height}`}>
        <div className={`h-full rounded-full transition-all duration-300 ${colorClass}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
