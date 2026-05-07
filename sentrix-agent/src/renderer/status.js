const elements = {
  hostname: document.querySelector("#hostname"),
  connection: document.querySelector("#connection"),
  serverUrl: document.querySelector("#serverUrl"),
  ip: document.querySelector("#ip"),
  os: document.querySelector("#os"),
  cpu: document.querySelector("#cpu"),
  ram: document.querySelector("#ram"),
  disk: document.querySelector("#disk"),
  lastSent: document.querySelector("#lastSent"),
};

function formatPercent(value) {
  return `${Math.round(value || 0)}%`;
}

function renderStatus(status) {
  const profile = status.profile || {};
  const metrics = status.metrics || {};

  elements.hostname.textContent = profile.hostname || "Sentrix Agent";
  elements.connection.textContent = status.connection || "connecting";
  elements.connection.className = `status ${status.connection || ""}`;
  elements.serverUrl.textContent = status.serverUrl || "-";
  elements.ip.textContent = profile.ip || "-";
  elements.os.textContent = profile.os || "-";
  elements.cpu.textContent = formatPercent(metrics.cpu);
  elements.ram.textContent = formatPercent(metrics.ram);
  elements.disk.textContent = formatPercent(metrics.disk);

  if (status.lastSentAt) {
    elements.lastSent.textContent = `Last heartbeat: ${new Date(
      status.lastSentAt,
    ).toLocaleTimeString()}`;
  }
}

window.sentrixAgent.onStatus(renderStatus);
window.sentrixAgent.getStatus().then(renderStatus);
