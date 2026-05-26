/**
 * Clamps a number between a minimum and maximum value.
 */
export function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

/**
 * Calculates the average of an array of numeric values, ignoring NaNs and non-finite numbers.
 */
export function average(values = []) {
  const usableValues = values
    .map((value) => (value == null || value === "" ? NaN : Number(value)))
    .filter((value) => Number.isFinite(value));

  if (!usableValues.length) return 0;

  const total = usableValues.reduce((sum, value) => sum + value, 0);
  return Math.round(total / usableValues.length);
}

/**
 * Calculates a unified load percentage for a device based on CPU, RAM, and Disk usage.
 */
export function getDeviceLoad(client) {
  const metrics = client.metrics || {};
  return Math.round(
    (clamp(metrics.cpu) + clamp(metrics.ram) + clamp(metrics.disk)) / 3,
  );
}

/**
 * Identifies potential health or performance issues for a specific client.
 */
export function getDeviceIssues(client) {
  const metrics = client.metrics || {};
  const cpuTemperature =
    metrics.temperature?.cpu?.temperatureCelsius ?? metrics.cpuTemperature;
  const gpuTemperature =
    metrics.temperature?.gpu?.temperatureCelsius ?? metrics.gpuTemperature;
  const latencyMs = metrics.network?.latencyMs ?? metrics.latencyMs;
  const packetLoss = metrics.network?.packetLoss ?? metrics.packetLoss;
  const issues = [];

  if (client.status !== "online") issues.push("Offline");
  if (clamp(metrics.cpu) >= 85) issues.push("High CPU");
  if (clamp(metrics.ram) >= 85) issues.push("High RAM");
  if (clamp(metrics.disk) >= 90) issues.push("Disk pressure");
  if (Number(cpuTemperature) >= 85) issues.push("High CPU temperature");
  if (Number(gpuTemperature) >= 85) issues.push("High GPU temperature");
  if (Number(packetLoss) >= 5) issues.push("Packet loss");
  if (Number(latencyMs) >= 150) issues.push("High latency");

  return issues;
}

/**
 * Calculates a health score (0-100) based on resource usage and connectivity.
 */
export function getHealthScore(client) {
  const metrics = client.metrics || {};
  const statusPenalty = client.status === "online" ? 0 : 35;
  const cpuPenalty = Math.max(0, clamp(metrics.cpu) - 70) * 0.5;
  const ramPenalty = Math.max(0, clamp(metrics.ram) - 75) * 0.45;
  const diskPenalty = Math.max(0, clamp(metrics.disk) - 85) * 0.7;

  return clamp(
    Math.round(100 - statusPenalty - cpuPenalty - ramPenalty - diskPenalty),
  );
}
