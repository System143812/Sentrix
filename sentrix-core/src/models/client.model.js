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
      cpu: 0,
      ram: 0,
      disk: 0,
      uptime: 0,
    };
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
    this.lastSeenAt = Date.now();
  }
}
