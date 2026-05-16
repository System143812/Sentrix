import { AlertTriangle, CheckCircle2, Wifi } from "lucide-react";
import { DEVICE_STATUS_COLORS } from "../styles/tones.js";

// Badge for displaying device status (online/offline) or alert status
export function StatusBadge({ status, alert, showIcon = true, size = "md" }) {
  const sizeClasses = {
    sm: "px-2 py-1 text-xs",
    md: "px-2 py-1 text-xs",
    lg: "px-3 py-2 text-sm",
  };

  const iconSize = {
    sm: 12,
    md: 13,
    lg: 15,
  };

  if (alert) {
    const alertStyles = {
      critical: "border-red-200 bg-red-50/80 text-red-700",
      warning: "border-amber-200 bg-amber-50/80 text-amber-700",
      normal: "border-emerald-200 bg-emerald-50/80 text-emerald-700",
    };

    const alertIcons = {
      critical: AlertTriangle,
      warning: AlertTriangle,
      normal: CheckCircle2,
    };

    const Icon = alertIcons[alert] || CheckCircle2;

    return (
      <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border font-bold backdrop-blur ${sizeClasses[size]} ${alertStyles[alert] || alertStyles.normal}`}>
        {showIcon && <Icon size={iconSize[size]} />}
        {alert === "critical" && "Critical"}
        {alert === "warning" && "Review"}
        {alert === "normal" && "Normal"}
      </span>
    );
  }

  if (status) {
    const statusStyle = DEVICE_STATUS_COLORS[status] || DEVICE_STATUS_COLORS.offline;
    const Icon = status === "online" ? Wifi : AlertTriangle;

    return (
      <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border font-bold capitalize backdrop-blur ${sizeClasses[size]} ${statusStyle}`}>
        {showIcon && <Icon size={iconSize[size]} />}
        {status}
      </span>
    );
  }

  return null;
}
