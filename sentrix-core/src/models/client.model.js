export class Client {
  constructor(data = {}) {
    this.id = data.id;
    this.agentId = data.agentId ?? data.id;
    this.hostname = data.hostname ?? "Unknown";
    this.os = data.os ?? "Unknown";
    this.ip = data.ip ?? "Unknown";
    this.mac = data.mac ?? "Unknown";
    this.group = data.group ?? "Unassigned";
    this.status = "online";
    this.metrics = data.metrics ?? {
      schemaVersion: 2,
      system: {
        cpu: { usage: 0 },
        memory: { usage: 0 },
        disk: { usage: 0 },
        uptimeSeconds: 0,
      },
      network: { interface: "Unknown" },
      temperature: {
        cpu: { temperatureCelsius: null },
        gpu: { model: "Unknown", temperatureCelsius: null },
      },
    };
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
    this.lastSeenAt = Date.now();
  }
}
