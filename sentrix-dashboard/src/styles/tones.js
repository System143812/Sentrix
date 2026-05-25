export const ICON_TONES = {
  blue: "border-blue-100 bg-blue-50/50 text-blue-600",
  rose: "border-rose-100 bg-rose-50/50 text-rose-600",
  amber: "border-amber-100 bg-amber-50/50 text-amber-600",
  teal: "border-teal-100 bg-teal-50/50 text-teal-600",
  emerald: "border-emerald-100 bg-emerald-50/50 text-emerald-600",
  slate: "border-slate-200 bg-slate-50 text-slate-500",
  indigo: "border-indigo-100 bg-indigo-50/50 text-indigo-600",
};

export const STAT_CARD_TONES = {
  default: "border-slate-200 bg-white text-slate-700",
  green: "border-emerald-100 bg-emerald-50/30 text-emerald-700",
  red: "border-rose-100 bg-rose-50/30 text-rose-700",
};

export const STATUS_TONES = {
  emerald: "border-emerald-100 bg-emerald-50 text-emerald-600",
  amber: "border-amber-100 bg-amber-50 text-amber-600",
  red: "border-rose-100 bg-rose-50 text-rose-600",
};

export const DEVICE_STATUS_COLORS = {
  online: "border-emerald-100 bg-emerald-50/80 text-emerald-600 shadow-sm",
  offline: "border-rose-100 bg-rose-50/80 text-rose-600 shadow-sm",
};

export const HEATMAP_STATUS_STYLES = {
  emerald: "border-emerald-100 bg-emerald-50/40 text-emerald-700 hover:bg-emerald-50",
  amber: "border-amber-100 bg-amber-50/40 text-amber-700 hover:bg-amber-50",
  red: "border-rose-100 bg-rose-50/40 text-rose-700 hover:bg-rose-50",
};

export const ALERT_LEVEL_COLORS = {
  critical: "border-rose-200 bg-rose-50 text-rose-600 font-bold",
  warning: "border-amber-200 bg-amber-50 text-amber-600 font-bold",
  info: "border-blue-200 bg-blue-50 text-blue-600 font-bold",
};

export const PROGRESS_BAR_COLORS = {
  emerald: "bg-emerald-500/80",
  blue: "bg-blue-500/80",
  amber: "bg-amber-500/80",
  rose: "bg-rose-500/80",
  ocean: "bg-blue-600/80",
  teal: "bg-teal-500/80",
};

export function getStatusTone(score) {
  if (score >= 80) return "emerald";
  if (score >= 60) return "amber";
  return "red";
}

export function getStatusColor(status) {
  return status === "online"
    ? DEVICE_STATUS_COLORS.online
    : DEVICE_STATUS_COLORS.offline;
}
