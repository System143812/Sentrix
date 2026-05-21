/**
 * Execute a database operation with retry logic for deadlocks.
 */
export async function withDeadlockRetry(operation, maxRetries = 3, delayMs = 100) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      // MySQL Deadlock error code
      if (error.code === 'ER_LOCK_DEADLOCK' && attempt < maxRetries) {
        console.warn(`[DB] Deadlock detected. Retrying attempt ${attempt + 1}/${maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
}

/**
 * Safely convert a value to a number or return a fallback.
 */
export function toNumber(value, fallback = null) {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/**
 * Safely stringify a value for JSON storage.
 */
export function toJson(value) {
  return JSON.stringify(value ?? null);
}

/**
 * Safely parse a JSON string with a fallback.
 */
export function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
