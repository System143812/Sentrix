import { getLocalSubnet, readArpTable, getPrimaryInterfaceAddress, pingHost, getHostnameForIp, getOpenPorts, findMacForIp } from "./src/services/discovery/scanner.js";
import { resolveVendor, detectDeviceType, getDeviceKind } from "./src/services/discovery/detector.js";

async function debugDiscovery() {
  console.log("--- Sentrix Discovery Scanner Debug (No DB) ---");
  
  // Manually override subnet for this environment as getLocalSubnet picked the wrong one
  const subnet = "192.168.1"; 
  console.log("Forced Subnet for Debug:", subnet);

  const ipAddresses = Array.from({ length: 5 }, (_, index) => `${subnet}.${index + 1}`);
  
  console.log("Pinging hosts...");
  await Promise.all(ipAddresses.map(ip => pingHost(ip)));

  const updatedArp = await readArpTable();
  
  const results = [];
  for (const ip of ipAddresses) {
    const mac = findMacForIp(updatedArp, ip);
    // Even if MAC is unknown, we can still report found IPs if ping was successful
    const isAlive = await pingHost(ip);
    
    if (mac === "Unknown" && !isAlive) continue;

    const [{ hostname, source }, openPorts] = await Promise.all([
      getHostnameForIp(ip),
      getOpenPorts(ip),
    ]);

    const vendor = resolveVendor(null, mac);
    const type = detectDeviceType(ip, mac, openPorts, hostname, vendor, source);
    
    results.push({
      IP: ip,
      MAC: mac,
      Hostname: hostname,
      Source: source,
      Vendor: vendor,
      Type: type,
      Ports: openPorts.join(",")
    });
  }

  console.log("\nScan Results:");
  if (results.length > 0) {
    console.table(results);
  } else {
    console.log("No devices found.");
  }

  process.exit(0);
}

debugDiscovery().catch(err => {
  console.error("Discovery error:", err);
  process.exit(1);
});
