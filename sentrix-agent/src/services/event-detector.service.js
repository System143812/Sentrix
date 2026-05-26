const previousState = {
  processes: new Map(),
  usbDevices: new Map(),
  networkOnline: null,
};

function processKey(process = {}) {
  return `${process.pid}:${process.name || "unknown"}`;
}

function usbKey(device = {}) {
  return device.deviceId || device.id || `${device.name || "USB"}:${device.manufacturer || device.vendor || ""}`;
}

function makeEvent(eventType, severity, title, description, metadata = {}) {
  return {
    eventType,
    severity,
    title,
    description,
    metadata,
    createdAt: Date.now(),
  };
}

export function detectDeviceEvents(metrics = {}, details = {}) {
  const events = [];
  const processes = Array.isArray(metrics.processes) ? metrics.processes : [];
  const usbDevices = Array.isArray(details.usbDevices) ? details.usbDevices : [];
  const nextProcesses = new Map(processes.map((process) => [processKey(process), process]));
  const nextUsb = new Map(usbDevices.map((device) => [usbKey(device), device]));

  if (previousState.processes.size > 0) {
    for (const [key, process] of nextProcesses) {
      if (!previousState.processes.has(key)) {
        events.push(makeEvent(
          "process_started",
          "info",
          `${process.name || "Process"} started`,
          `PID ${process.pid || "unknown"} was observed running.`,
          { pid: process.pid, name: process.name, user: process.user },
        ));
      }
    }

    for (const [key, process] of previousState.processes) {
      if (!nextProcesses.has(key)) {
        events.push(makeEvent(
          "process_stopped",
          "info",
          `${process.name || "Process"} stopped`,
          `PID ${process.pid || "unknown"} is no longer running.`,
          { pid: process.pid, name: process.name, user: process.user },
        ));
      }
    }
  }

  if (previousState.usbDevices.size > 0) {
    for (const [key, device] of nextUsb) {
      if (!previousState.usbDevices.has(key)) {
        events.push(makeEvent(
          "usb_inserted",
          "warning",
          `USB inserted: ${device.name || "USB device"}`,
          device.manufacturer || device.vendor || "USB device connected.",
          { key, device },
        ));
      }
    }

    for (const [key, device] of previousState.usbDevices) {
      if (!nextUsb.has(key)) {
        events.push(makeEvent(
          "usb_removed",
          "warning",
          `USB removed: ${device.name || "USB device"}`,
          device.manufacturer || device.vendor || "USB device removed.",
          { key, device },
        ));
      }
    }
  }

  const cpu = Number(metrics.system?.cpu?.usage ?? metrics.cpu);
  const ram = Number(metrics.system?.memory?.usage ?? metrics.ram);
  if (Number.isFinite(cpu) && cpu >= 90) {
    events.push(makeEvent("cpu_spike", "critical", "CPU spike detected", `CPU reached ${Math.round(cpu)}%.`, { cpu }));
  }
  if (Number.isFinite(ram) && ram >= 90) {
    events.push(makeEvent("memory_spike", "warning", "Memory spike detected", `Memory reached ${Math.round(ram)}%.`, { ram }));
  }

  const latency = metrics.network?.latencyMs;
  const networkOnline = latency != null;
  if (previousState.networkOnline === true && networkOnline === false) {
    events.push(makeEvent("network_disconnect", "warning", "Network latency probe failed", "The agent could not measure network latency.", { latency }));
  }
  if (previousState.networkOnline === false && networkOnline === true) {
    events.push(makeEvent("network_recovered", "info", "Network latency probe recovered", `Latency is ${latency} ms.`, { latency }));
  }

  previousState.processes = nextProcesses;
  previousState.usbDevices = nextUsb;
  previousState.networkOnline = networkOnline;

  return events.slice(0, 100);
}

export function buildDomainSummaries(metrics = {}) {
  const connections = metrics.networkActivity?.activeConnections || [];
  const grouped = new Map();

  for (const connection of connections) {
    const domain = connection.domain || connection.peerAddress;
    if (!domain) continue;
    const process = connection.process || "System";
    const key = `${domain}|${process}`;
    const current = grouped.get(key) || {
      domain,
      process,
      hits: 0,
      bandwidthBytes: 0,
    };
    current.hits += Number(connection.count || 1);
    grouped.set(key, current);
  }

  return [...grouped.values()];
}
