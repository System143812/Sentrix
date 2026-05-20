const $ = (selector) => document.querySelector(selector);

const elements = {
  hostname: $("#hostname"),
  heroSubtitle: $("#heroSubtitle"),
  connection: $("#connection"),
  connectionWrap: $("#connectionWrap"),
  agentInitial: $("#agentInitial"),
  agentId: $("#agentId"),
  serverUrl: $("#serverUrl"),
  ip: $("#ip"),
  os: $("#os"),
  cpu: $("#cpu"),
  ram: $("#ram"),
  disk: $("#disk"),
  diskDetail: $("#diskDetail"),
  tempCpu: $("#tempCpu"),
  tempGpu: $("#tempGpu"),
  latency: $("#latency"),
  packetLoss: $("#packetLoss"),
  uptime: $("#uptime"),
  lastSent: $("#lastSent"),
  clock: $("#clock"),
  cpuDetail: $("#cpuDetail"),
  memoryDetail: $("#memoryDetail"),
  focusLabel: $("#focusLabel"),
  focusValue: $("#focusValue"),
  focusDetail: $("#focusDetail"),
  networkPrimary: $("#networkPrimary"),
  networkSecondary: $("#networkSecondary"),
  download: $("#download"),
  upload: $("#upload"),
  networkInterface: $("#networkInterface"),
  peripheralSummary: $("#peripheralSummary"),
  displayList: $("#displayList"),
  peripheralCapsules: $("#peripheralCapsules"),
  hardwareList: $("#hardwareList"),
  diskList: $("#diskList"),
  usbList: $("#usbList"),
  adapterList: $("#adapterList"),
  networkPrimaryInterface: $("#networkPrimaryInterface"),
  downloadLarge: $("#downloadLarge"),
  uploadLarge: $("#uploadLarge"),
  latencyLarge: $("#latencyLarge"),
  cpuPerformanceValue: $("#cpuPerformanceValue"),
  ramPerformanceValue: $("#ramPerformanceValue"),
  tempPerformanceValue: $("#tempPerformanceValue"),
  diskPerformanceValue: $("#diskPerformanceValue"),
  cpuPerformanceDetail: $("#cpuPerformanceDetail"),
  ramPerformanceDetail: $("#ramPerformanceDetail"),
  tempPerformanceDetail: $("#tempPerformanceDetail"),
  diskPerformanceDetail: $("#diskPerformanceDetail"),
  diskRing: $("#diskRing"),
  tempRing: $("#tempRing"),
  copyAgentId: $("#copyAgentId"),
  copyAddress: $("#copyAddress"),
  cpuSparkline: $("#cpuSparkline"),
  ramSparkline: $("#ramSparkline"),
  focusSparkline: $("#focusSparkline"),
  networkSparkline: $("#networkSparkline"),
  cpuPerformanceSparkline: $("#cpuPerformanceSparkline"),
  ramPerformanceSparkline: $("#ramPerformanceSparkline"),
  tempPerformanceSparkline: $("#tempPerformanceSparkline"),
  diskPerformanceSparkline: $("#diskPerformanceSparkline"),
};

const state = {
  status: {},
  activeView: "overview",
  focusMode: "cpu",
  networkMode: "download",
  history: {
    cpu: [],
    ram: [],
    disk: [],
    download: [],
    upload: [],
    latency: [],
    temp: [],
  },
  lastSampleKey: null,
};

const chartPalette = {
  cpu: { line: "#c5ef5b", fill: "rgba(197, 239, 91, 0.16)" },
  ram: { line: "#ffab63", fill: "rgba(255, 171, 99, 0.16)" },
  disk: { line: "#ffd56a", fill: "rgba(255, 213, 106, 0.16)" },
  download: { line: "#77b7ff", fill: "rgba(119, 183, 255, 0.16)" },
  upload: { line: "#9f88ff", fill: "rgba(159, 136, 255, 0.18)" },
  latency: { line: "#ff7bd5", fill: "rgba(255, 123, 213, 0.16)" },
  temp: { line: "#ffdf7b", fill: "rgba(255, 223, 123, 0.16)" },
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function formatPercent(value) {
  return `${Math.round(toNumber(value))}%`;
}

function formatTemperature(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? `${Math.round(numeric)} C` : "-- C";
}

function formatBytes(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(numeric) / Math.log(1024)), units.length - 1);
  const scaled = numeric / 1024 ** index;
  const decimals = scaled >= 100 || index === 0 ? 0 : 1;
  return `${scaled.toFixed(decimals)} ${units[index]}`;
}

function formatSpeed(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? `${formatBytes(numeric)}/s` : "0 KB/s";
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(toNumber(totalSeconds)));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function formatRelativeTime(value) {
  if (!value) {
    return "Waiting...";
  }

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return "Waiting...";
  }

  const diffSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));

  if (diffSeconds < 5) {
    return "Just now";
  }

  if (diffSeconds < 60) {
    return `${diffSeconds}s ago`;
  }

  const minutes = Math.floor(diffSeconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function renderSparkline(element, values, palette) {
  if (!element) {
    return;
  }

  const list = Array.isArray(values) ? values.filter((value) => Number.isFinite(value)) : [];

  if (list.length === 0) {
    element.innerHTML = "";
    return;
  }

  const width = 100;
  const height = 36;
  const max = Math.max(...list, 1);
  const min = Math.min(...list, 0);
  const spread = Math.max(max - min, 1);
  const points = list
    .map((value, index) => {
      const x = list.length === 1 ? width : (index / (list.length - 1)) * width;
      const y = height - ((value - min) / spread) * (height - 4) - 2;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const area = `0,${height} ${points} ${width},${height}`;

  element.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <polygon fill="${palette.fill}" points="${area}"></polygon>
      <polyline
        fill="none"
        stroke="${palette.line}"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        points="${points}"
      ></polyline>
    </svg>
  `;
}

function pushHistory(status) {
  const metrics = status.metrics || {};
  const network = metrics.network || {};
  const temperature = metrics.temperature || {};
  const sampleKey = `${metrics.timestamp || status.lastSentAt || "none"}:${status.connection || ""}`;

  if (sampleKey === state.lastSampleKey) {
    return;
  }

  state.lastSampleKey = sampleKey;

  const entries = {
    cpu: toNumber(metrics.cpu, NaN),
    ram: toNumber(metrics.ram, NaN),
    disk: toNumber(metrics.disk, NaN),
    download: toNumber(network.downloadBytesPerSec, NaN),
    upload: toNumber(network.uploadBytesPerSec, NaN),
    latency: toNumber(network.latencyMs, NaN),
    temp: toNumber(temperature.cpu?.temperatureCelsius, NaN),
  };

  for (const [key, value] of Object.entries(entries)) {
    if (!Number.isFinite(value)) {
      continue;
    }

    state.history[key].push(value);

    if (state.history[key].length > 40) {
      state.history[key].shift();
    }
  }
}

function setGauge(element, value) {
  if (!element) {
    return;
  }

  element.style.setProperty("--value", clamp(toNumber(value), 0, 100));
}

function setActiveButtons(selector, activeValue, attributeName) {
  document.querySelectorAll(selector).forEach((button) => {
    button.classList.toggle("active", button.dataset[attributeName] === activeValue);
  });
}

function renderList(element, items) {
  element.innerHTML = items.length > 0
    ? items.join("")
    : '<li><strong>No data yet</strong><span>Waiting for the next device details snapshot.</span></li>';
}

function flashButton(button, text) {
  if (!button) {
    return;
  }

  const original = button.dataset.originalLabel || button.textContent;
  button.dataset.originalLabel = original;
  button.textContent = text;
  window.setTimeout(() => {
    button.textContent = original;
  }, 1200);
}

function bindInteractions() {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeView = button.dataset.view;
      setActiveButtons(".nav-button", state.activeView, "view");
      document.querySelectorAll(".view").forEach((panel) => {
        panel.classList.toggle("active", panel.dataset.panel === state.activeView);
      });
    });
  });

  document.querySelectorAll("[data-focus]").forEach((button) => {
    button.addEventListener("click", () => {
      state.focusMode = button.dataset.focus;
      setActiveButtons("[data-focus]", state.focusMode, "focus");
      render();
    });
  });

  document.querySelectorAll("[data-network-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.networkMode = button.dataset.networkMode;
      setActiveButtons("[data-network-mode]", state.networkMode, "networkMode");
      render();
    });
  });

  elements.copyAgentId?.addEventListener("click", async () => {
    const agentId = state.status.profile?.agentId;

    if (!agentId) {
      return;
    }

    await window.sentrixAgent.copyText(agentId);
    flashButton(elements.copyAgentId, "Copied");
  });

  elements.copyAddress?.addEventListener("click", async () => {
    const ipAddress = state.status.profile?.ip;

    if (!ipAddress) {
      return;
    }

    await window.sentrixAgent.copyText(ipAddress);
    flashButton(elements.copyAddress, "Copied");
  });
}

function renderPeripherals(peripherals = {}) {
  const capsuleConfig = [
    ["Mouse", peripherals.mouse],
    ["Keyboard", peripherals.keyboard],
    ["Wi-Fi", peripherals.wifiDongle],
    ["Bluetooth", peripherals.bluetoothDongle],
    ["Webcam", peripherals.webcam],
    ["USB storage", peripherals.storage],
  ];

  const activeCount = capsuleConfig.filter(([, active]) => Boolean(active)).length;
  elements.peripheralSummary.textContent = `${activeCount} active`;
  elements.peripheralCapsules.innerHTML = capsuleConfig
    .map(([label, active]) => `
      <span class="capsule ${active ? "active" : ""}">
        ${escapeHtml(label)}
      </span>
    `)
    .join("");

  const displays = Array.isArray(peripherals.displays) ? peripherals.displays : [];
  renderList(
    elements.displayList,
    displays.map((display) => `
      <li>
        <strong>${escapeHtml(display.model || "Display")}</strong>
        <span>${escapeHtml(display.resolution || "Unknown resolution")}</span>
      </li>
    `),
  );
}

function renderHardware(details = {}) {
  const specs = details.specs || {};
  const graphicsCards = Array.isArray(details.peripherals?.graphicsCards)
    ? details.peripherals.graphicsCards
    : [];

  elements.hardwareList.innerHTML = [
    ["Manufacturer", specs.manufacturer || "Unknown"],
    ["Model", specs.model || "Unknown"],
    ["Serial", specs.serial || "Unknown"],
    ["BIOS", specs.bios || "Unknown"],
    ["Baseboard", specs.baseboard || "Unknown"],
    ["CPU", specs.cpu || "Unknown"],
    ["Memory", specs.totalMemoryGb ? `${specs.totalMemoryGb} GB across ${specs.memorySlots || 0} slots` : "Unknown"],
    ["Graphics", graphicsCards.length > 0 ? graphicsCards.map((card) => card.model).join(", ") : "Unknown"],
  ]
    .map(([label, value]) => `
      <div>
        <dt>${escapeHtml(label)}</dt>
        <dd>${escapeHtml(value)}</dd>
      </div>
    `)
    .join("");

  renderList(
    elements.diskList,
    (specs.disks || []).map((disk) => `
      <li>
        <strong>${escapeHtml(disk.name || "Disk")}</strong>
        <span>${escapeHtml(disk.type || "Unknown")} | ${escapeHtml(String(disk.sizeGb || 0))} GB</span>
      </li>
    `),
  );

  renderList(
    elements.usbList,
    (details.usbDevices || []).slice(0, 10).map((device) => `
      <li>
        <strong>${escapeHtml(device.name || "USB device")}</strong>
        <span>${escapeHtml(device.vendor || "Unknown")} | ${escapeHtml(device.type || "USB")}</span>
      </li>
    `),
  );

  renderList(
    elements.adapterList,
    (specs.networkAdapters || []).map((adapter) => `
      <li>
        <strong>${escapeHtml(adapter.name || "Network Adapter")}</strong>
        <span>${escapeHtml(adapter.type || "Unknown")} | ${escapeHtml(adapter.ip4 || "Unknown")} | ${escapeHtml(adapter.mac || "Unknown")}</span>
      </li>
    `),
  );
}

function renderFocusCard(metrics = {}) {
  const memory = metrics.system?.memory || {};
  const network = metrics.network || {};
  let label = "CPU load";
  let value = formatPercent(metrics.cpu);
  let detail = "Realtime processor usage";
  let history = state.history.cpu;
  let palette = chartPalette.cpu;

  if (state.focusMode === "memory") {
    label = "Memory load";
    value = formatPercent(metrics.ram);
    detail = `${formatBytes(memory.usedBytes)} used of ${formatBytes(memory.totalBytes)}`;
    history = state.history.ram;
    palette = chartPalette.ram;
  }

  if (state.focusMode === "network") {
    const totalTraffic = toNumber(network.downloadBytesPerSec) + toNumber(network.uploadBytesPerSec);
    label = "Network flow";
    value = formatSpeed(totalTraffic);
    detail = `Down ${formatSpeed(network.downloadBytesPerSec)} | Up ${formatSpeed(network.uploadBytesPerSec)}`;
    history = state.history.download;
    palette = chartPalette.download;
  }

  elements.focusLabel.textContent = label;
  elements.focusValue.textContent = value;
  elements.focusDetail.textContent = detail;
  renderSparkline(elements.focusSparkline, history, palette);
}

function renderNetworkPanel(metrics = {}) {
  const network = metrics.network || {};
  const modeMap = {
    download: {
      value: formatSpeed(network.downloadBytesPerSec),
      description: "Incoming traffic from the active network adapter",
      history: state.history.download,
      palette: chartPalette.download,
    },
    upload: {
      value: formatSpeed(network.uploadBytesPerSec),
      description: "Outgoing traffic currently leaving this machine",
      history: state.history.upload,
      palette: chartPalette.upload,
    },
    latency: {
      value: Number.isFinite(Number(network.latencyMs)) ? `${Math.round(Number(network.latencyMs))} ms` : "-- ms",
      description: "Round-trip ping time from the configured probe target",
      history: state.history.latency,
      palette: chartPalette.latency,
    },
  };
  const activeMode = modeMap[state.networkMode] || modeMap.download;

  elements.networkPrimary.textContent = activeMode.value;
  elements.networkSecondary.textContent = activeMode.description;
  elements.download.textContent = formatSpeed(network.downloadBytesPerSec);
  elements.upload.textContent = formatSpeed(network.uploadBytesPerSec);
  elements.networkInterface.textContent = network.interface || "Unknown";
  elements.networkPrimaryInterface.textContent = network.interface || "Unknown";
  elements.downloadLarge.textContent = formatSpeed(network.downloadBytesPerSec);
  elements.uploadLarge.textContent = formatSpeed(network.uploadBytesPerSec);
  elements.latencyLarge.textContent = Number.isFinite(Number(network.latencyMs))
    ? `${Math.round(Number(network.latencyMs))} ms`
    : "-- ms";

  renderSparkline(elements.networkSparkline, activeMode.history, activeMode.palette);
}

function renderPerformance(metrics = {}) {
  const memory = metrics.system?.memory || {};
  const disk = metrics.system?.disk || {};
  const temperature = metrics.temperature || {};

  elements.cpuPerformanceValue.textContent = formatPercent(metrics.cpu);
  elements.cpuPerformanceDetail.textContent = `Latest utilization sample from currentLoad()`;
  elements.ramPerformanceValue.textContent = formatPercent(metrics.ram);
  elements.ramPerformanceDetail.textContent = `${formatBytes(memory.availableBytes)} available of ${formatBytes(memory.totalBytes)}`;
  elements.tempPerformanceValue.textContent = formatTemperature(temperature.cpu?.temperatureCelsius);
  elements.tempPerformanceDetail.textContent = `GPU ${formatTemperature(temperature.gpu?.temperatureCelsius)} | ${temperature.gpu?.model || "Unknown GPU"}`;
  elements.diskPerformanceValue.textContent = formatPercent(metrics.disk);
  elements.diskPerformanceDetail.textContent = `${formatBytes(disk.freeBytes)} free on ${disk.mount || "system drive"}`;

  renderSparkline(elements.cpuPerformanceSparkline, state.history.cpu, chartPalette.cpu);
  renderSparkline(elements.ramPerformanceSparkline, state.history.ram, chartPalette.ram);
  renderSparkline(elements.tempPerformanceSparkline, state.history.temp, chartPalette.temp);
  renderSparkline(elements.diskPerformanceSparkline, state.history.disk, chartPalette.disk);
}

function renderClock() {
  elements.clock.textContent = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  elements.lastSent.textContent = state.status.lastSentAt
    ? `${formatRelativeTime(state.status.lastSentAt)}`
    : "Waiting...";
}

function render() {
  const status = state.status || {};
  const profile = status.profile || {};
  const details = status.details || profile.details || {};
  const metrics = status.metrics || {};
  const memory = metrics.system?.memory || {};
  const disk = metrics.system?.disk || {};
  const network = metrics.network || {};
  const temperature = metrics.temperature || {};
  const graphicsCards = Array.isArray(details.peripherals?.graphicsCards)
    ? details.peripherals.graphicsCards
    : [];

  elements.hostname.textContent = profile.hostname || "Sentrix Agent";
  elements.heroSubtitle.textContent = [
    details.specs?.manufacturer,
    details.specs?.model,
  ]
    .filter(Boolean)
    .join(" | ") || "Live metrics and hardware inventory for this device.";
  elements.connection.textContent = status.connection || "connecting";
  elements.connectionWrap.className = `status-chip ${status.connection || ""}`;
  elements.agentInitial.textContent = (profile.hostname || "A").slice(0, 1).toUpperCase();

  elements.agentId.textContent = profile.agentId || "-";
  elements.serverUrl.textContent = status.serverUrl || "-";
  elements.ip.textContent = profile.ip || "-";
  elements.os.textContent = profile.os || "-";
  elements.uptime.textContent = formatDuration(metrics.uptime);
  elements.latency.textContent = Number.isFinite(Number(network.latencyMs))
    ? `${Math.round(Number(network.latencyMs))} ms`
    : "-- ms";
  elements.packetLoss.textContent = Number.isFinite(Number(network.packetLoss))
    ? `${Math.round(Number(network.packetLoss))}%`
    : "--%";

  elements.cpu.textContent = formatPercent(metrics.cpu);
  elements.ram.textContent = formatPercent(metrics.ram);
  elements.disk.textContent = formatPercent(metrics.disk);
  elements.cpuDetail.textContent = details.specs?.cpu
    ? `${details.specs.cpu} | ${details.specs.cpuCores || 0} cores`
    : "Realtime processor usage";
  elements.memoryDetail.textContent = `${formatBytes(memory.usedBytes)} used of ${formatBytes(memory.totalBytes)}`;
  elements.diskDetail.textContent = `${formatBytes(disk.freeBytes)} free on ${disk.mount || "system drive"}`;

  elements.tempCpu.textContent = formatTemperature(temperature.cpu?.temperatureCelsius);
  elements.tempGpu.textContent = `GPU ${formatTemperature(temperature.gpu?.temperatureCelsius)}${
    graphicsCards[0]?.model ? ` | ${graphicsCards[0].model}` : ""
  }`;

  setGauge(elements.diskRing, metrics.disk);
  setGauge(elements.tempRing, Number.isFinite(Number(temperature.cpu?.temperatureCelsius))
    ? clamp((Number(temperature.cpu.temperatureCelsius) / 100) * 100, 0, 100)
    : 0);

  renderSparkline(elements.cpuSparkline, state.history.cpu, chartPalette.cpu);
  renderSparkline(elements.ramSparkline, state.history.ram, chartPalette.ram);
  renderFocusCard(metrics);
  renderNetworkPanel(metrics);
  renderPeripherals(details.peripherals || {});
  renderHardware(details);
  renderPerformance(metrics);
}

bindInteractions();
window.setInterval(renderClock, 1000);
renderClock();

window.sentrixAgent.onStatus((status) => {
  state.status = status;
  pushHistory(status);
  renderClock();
  render();
});

window.sentrixAgent.getStatus().then((status) => {
  state.status = status;
  pushHistory(status);
  renderClock();
  render();
});
