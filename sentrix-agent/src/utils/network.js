import os from "os";

export function getPrimaryNetwork() {
  if (process.env.AGENT_IP_OVERRIDE) {
    return {
      ip: process.env.AGENT_IP_OVERRIDE,
      mac: "Override",
    };
  }

  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, records] of Object.entries(interfaces)) {
    for (const record of records || []) {
      if (record.family === "IPv4" && !record.internal) {
        const isVirtual = /virtual|vbox|vmware|docker|veth|vpn|sandbox/i.test(name);
        candidates.push({
          name,
          address: record.address,
          mac: record.mac,
          isVirtual,
          isCommonLan: record.address.startsWith("192.168.") || record.address.startsWith("10.")
        });
      }
    }
  }

  // Sort candidates by priority:
  // 1. Physical interfaces on a common LAN (e.g., Ethernet/Wi-Fi)
  // 2. Any other physical interface
  // 3. Virtual interfaces
  candidates.sort((a, b) => {
    if (a.isVirtual !== b.isVirtual) return a.isVirtual ? 1 : -1;
    if (a.isCommonLan !== b.isCommonLan) return a.isCommonLan ? -1 : 1;
    return 0;
  });

  if (candidates.length > 0) {
    return {
      ip: candidates[0].address,
      mac: candidates[0].mac,
    };
  }

  return {
    ip: "Unknown",
    mac: "Unknown",
  };
}
