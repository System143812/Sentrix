export function toNumber(value, fallback = null, digits = 0) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  if (digits <= 0) {
    return Math.round(numericValue);
  }

  const factor = 10 ** digits;
  return Math.round(numericValue * factor) / factor;
}

export function toPercent(used, total) {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) {
    return null;
  }

  return toNumber((used / total) * 100);
}

export function safeString(value, fallback = "Unknown") {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmedValue = value.trim();
  return trimmedValue || fallback;
}

export async function collectSafely(collector, fallbackValue) {
  try {
    return await collector();
  } catch {
    return fallbackValue;
  }
}
