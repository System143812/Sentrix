import { getLocalSubnet, readArpTable, getPrimaryInterfaceAddress } from "./src/services/discovery/scanner.js";
import { runDiscoveryScan, getDiscoverySnapshot } from "./src/services/discovery/index.js";

async function debugDiscovery() {
  console.log("--- Sentrix Discovery Debug ---");
  console.log("Primary Interface:", getPrimaryInterfaceAddress());
  const subnet = getLocalSubnet();
  console.log("Detected Subnet:", subnet);

  if (!subnet) {
    console.error("No subnet detected. Scanner will likely fail.");
  }

  console.log("\nARP Table Snapshot:");
  const arp = await readArpTable();
  console.log(arp);

  console.log("\nStarting Discovery Scan (this might take a minute)...");
  await runDiscoveryScan();

  const snapshot = getDiscoverySnapshot();
  console.log("\nScan Results Snapshot:");
  console.log("Status:", snapshot.status);
  console.log("Message:", snapshot.message);
  console.log("Devices Found:", snapshot.devices.length);

  if (snapshot.devices.length > 0) {
    console.log("\nDevice Sample:");
    console.table(snapshot.devices.slice(0, 5).map(d => ({
      IP: d.ip,
      Hostname: d.hostname,
      Vendor: d.vendor,
      Type: d.device_type,
      Status: d.agent_status
    })));
  }

  process.exit(0);
}

debugDiscovery().catch(err => {
  console.error("Discovery error:", err);
  process.exit(1);
});
