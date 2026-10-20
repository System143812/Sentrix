import crypto from "crypto";

export function isE2ETracingEnabled() {
  return process.env.SENTRIX_E2E_TRACING === "true" || process.env.SENTRIX_E2E_TRACING === "1";
}

export function generateTraceId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
}

export function traceLog(traceId, source, stage, details = {}) {
  if (!isE2ETracingEnabled()) return;
  const timestamp = new Date().toISOString();
  const detailStr = Object.keys(details).length ? ` | ${JSON.stringify(details)}` : "";
  console.log(`[E2E-TRACE] [${timestamp}] [Trace:${traceId}] [${source}] ${stage}${detailStr}`);
}
