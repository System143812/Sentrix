export const ICON_TONES = {
  blue: "border-blue-100 bg-blue-50 text-blue-700",
  rose: "border-rose-100 bg-rose-50 text-rose-700",
  amber: "border-amber-100 bg-amber-50 text-amber-700",
  teal: "border-teal-100 bg-teal-50 text-teal-700",
  emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
  slate: "border-slate-200 bg-slate-50 text-slate-700",
};

export const STAT_CARD_TONES = {
  default: "border-blue-100 bg-blue-50 text-blue-700",
  green: "border-emerald-100 bg-emerald-50 text-emerald-700",
  red: "border-red-100 bg-red-50 text-red-700",
};

export const STATUS_TONES = {
  emerald: "text-emerald-600",
  amber: "text-amber-600",
  red: "text-red-600",
};

export const DEVICE_STATUS_COLORS = {
  online: "border-emerald-200 bg-emerald-50 text-emerald-700",
  offline: "border-red-200 bg-red-50 text-red-700",
};

export const HEATMAP_STATUS_STYLES = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  red: "border-red-200 bg-red-50 text-red-800",
};

export const ALERT_LEVEL_COLORS = {
  critical: "border-red-200 bg-red-50 text-red-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
};

export const PROGRESS_BAR_COLORS = {
  emerald: "bg-emerald-500",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  ocean: "bg-ocean",
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
