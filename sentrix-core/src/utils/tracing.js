import crypto from "crypto";

export function isServerTracingEnabled() {
  return process.env.SENTRIX_E2E_TRACING === "true" || process.env.SENTRIX_E2E_TRACING === "1";
}

export function serverTraceLog(traceId, stage, details = {}) {
  if (!isServerTracingEnabled() && !traceId) return;
  const timestamp = new Date().toISOString();
  const tid = traceId || "no-trace-id";
  const detailStr = Object.keys(details).length ? ` | ${JSON.stringify(details)}` : "";
  console.log(`[E2E-TRACE-CORE] [${timestamp}] [Trace:${tid}] ${stage}${detailStr}`);
}
