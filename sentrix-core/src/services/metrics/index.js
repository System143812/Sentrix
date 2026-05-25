export {
  normalizeMetrics,
  buildHistoryPoint,
} from "./normalizer.js";

export {
  getLatestClientProcesses,
  getLatestClientNetworkActivity,
  getClientActivityHistory,
  getGlobalTrendData,
} from "./repository.js";

export {
  saveHardwareDetails,
  getClientHardware,
  getClientPeripheralHistory,
} from "./hardware.service.js";

export {
  getClientMetricHistory,
} from "./history.service.js";

export {
  appendMetricsHistory,
  processIncomingMetrics,
} from "./metrics.service.js";
