export class Client {
  constructor(id, name, cpu, ram) {
    this.id = id ?? "Unknown";
    this.name = name ?? "Unknown";
    this.cpu = cpu ?? 0;
    this.ram = ram ?? 0;
    this.createdAt = Date.now();
  }
}
