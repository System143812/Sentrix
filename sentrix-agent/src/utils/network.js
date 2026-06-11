import os from "os";
import { execSync } from "child_process";

export function getPrimaryNetwork() {
  if (process.env.AGENT_IP_OVERRIDE) {
    return {
      ip: process.env.AGENT_IP_OVERRIDE,
      mac: "Override",
    };
  }

  const interfaces = os.networkInterfaces();
  
  // --- Strategy: Gateway-Aware Selection ---
  // We look for the interface that has the default gateway (internet/router access).
  let gatewayInterfaceIp = null;
  try {
    if (process.platform === "win32") {
      const routeOutput = execSync('route print 0.0.0.0', { encoding: 'utf8' });
      // Look for the line: 0.0.0.0 0.0.0.0 [Gateway] [InterfaceIP]
      const match = routeOutput.match(/0\.0\.0\.0\s+0\.0\.0\.0\s+\d+\.\d+\.\d+\.\d+\s+(\d+\.\d+\.\d+\.\d+)/);
      if (match && match[1]) {
        gatewayInterfaceIp = match[1];
      }
    }
  } catch (err) {
    // Fallback if route command fails
  }

  const candidates = [];
  for (const [name, records] of Object.entries(interfaces)) {
    for (const record of records || []) {
      if (record.family === "IPv4" && !record.internal) {
        const isVirtual = /virtual|vbox|vmware|docker|veth|vpn|sandbox/i.test(name);
        
        // Check if this is exactly the gateway interface
        if (gatewayInterfaceIp === record.address) {
          return {
            ip: record.address,
            mac: record.mac,
          };
        }

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

  // --- Fallback sorting if no gateway match found ---
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
