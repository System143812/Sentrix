// Formatting Functions

export function formatUptime(seconds = 0) {
  const totalSeconds = Math.floor(Number(seconds) || 0);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h`;
  }

  return `${Math.floor((totalSeconds % 3600) / 60)}m`;
}

export function formatUptimeVerbose(seconds = 0) {
  const totalSeconds = Math.floor(Number(seconds) || 0);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (days > 0) {
    return `${days} ${days === 1 ? "day" : "days"} ${hours} ${hours === 1 ? "hour" : "hours"}`;
  }

  if (hours > 0) {
    return `${hours} ${hours === 1 ? "hour" : "hours"} ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }

  if (minutes > 0) {
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ${secs} ${secs === 1 ? "second" : "seconds"}`;
  }

  return `${secs} ${secs === 1 ? "second" : "seconds"}`;
}

export function formatTimeAgo(timestamp) {
  if (!timestamp) return "No heartbeat";

  const minutes = Math.max(0, Math.floor((Date.now() - Number(timestamp)) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatBool(value) {
  if (value === true) return "Detected";
  if (value === false) return "Not detected";
  return "Unknown";
}

// Calculation Functions

export function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

export function getLastSeenAt(device) {
  return device.lastSeenAt ?? device.last_seen_at;
}

export function getDeviceLoad(device) {
  if (Number.isFinite(Number(device.load))) {
    return Number(device.load);
  }

  const metrics = device.metrics || {};
  return Math.round(
    (clamp(metrics.cpu) + clamp(metrics.ram) + clamp(metrics.disk)) / 3,
  );
}

export function getHealthScore(device) {
  if (Number.isFinite(Number(device.health))) {
    return Number(device.health);
  }

  const load = getDeviceLoad(device);
  const statusPenalty = device.status === "online" ? 0 : 34;

  return clamp(Math.round(100 - load * 0.32 - statusPenalty));
}

export function getDeviceIssues(device) {
  if (Array.isArray(device.issues)) {
    return device.issues;
  }

  const metrics = device.metrics || {};
  const issues = [];

  if (device.status !== "online") issues.push("Offline");
  if (clamp(metrics.cpu) >= 85) issues.push("High CPU");
  if (clamp(metrics.ram) >= 85) issues.push("High RAM");
  if (clamp(metrics.disk) >= 90) issues.push("Disk pressure");

  return issues;
}

// SVG Path Functions

export function buildSmoothSvgPath(coordinates, step) {
  return coordinates
    .map((point, index) => {
      if (index === 0) return `M ${point.x} ${point.y}`;

      const previous = coordinates[index - 1];
      const controlOffset = step * 0.42;
      return `C ${previous.x + controlOffset} ${previous.y}, ${
        point.x - controlOffset
      } ${point.y}, ${point.x} ${point.y}`;
    })
    .join(" ");
}
