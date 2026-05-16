// Default empty state objects used for initial loading states

export const EMPTY_DEVICE = {
  id: null,
  hostname: "",
  status: "offline",
  lastSeenAt: null,
  metrics: { cpu: 0, ram: 0, disk: 0 },
  load: 0,
  health: 0,
  issues: [],
};

export const EMPTY_DASHBOARD_DATA = {
  total: 0,
  online: 0,
  offline: 0,
  clients: [],
};

export const EMPTY_ANALYTICS = {
  range: { key: "24h", label: "Last 24 hours" },
  generatedAt: null,
  filters: { group: "all" },
  totals: { total: 0, online: 0, offline: 0 },
  averages: {
    cpu: 0,
    ram: 0,
    disk: 0,
    uptime: 0,
    load: 0,
    health: 0,
    cpuTemperature: null,
    gpuTemperature: null,
    uploadBytesPerSec: null,
    downloadBytesPerSec: null,
    latencyMs: null,
    packetLoss: null,
  },
  alerts: { total: 0, critical: 0, byType: [], active: [] },
  trends: {
    cpu: [],
    ram: [],
    disk: [],
    health: [],
    alerts: [],
    cpuTemperature: [],
    gpuTemperature: [],
    uploadBytesPerSec: [],
    downloadBytesPerSec: [],
    latencyMs: [],
    packetLoss: [],
  },
  groups: [],
  devices: { topLoad: [], outliers: [], recent: [], rows: [] },
  exportUrls: { csv: "" },
  dataQuality: {
    realMetrics: [],
    storedHistory: false,
    unavailableMetrics: [],
    notes: [],
  },
};

export const EMPTY_SNAPSHOT = {
  timestamp: null,
  completeScan: false,
  liveNetwork: [],
  registered: [],
  newDevices: [],
  offlineDevices: [],
};

export const EMPTY_GROUP = {
  id: null,
  name: "",
  count: 0,
  health: 0,
  load: 0,
  cpu: 0,
  ram: 0,
  disk: 0,
};
