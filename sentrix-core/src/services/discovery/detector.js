import {
  OUI_VENDORS,
  NETWORK_DEVICE_VENDORS,
  ROUTER_GATEWAY_HOSTS,
  PRINTER_PORTS,
  NETWORK_PORTS,
  WINDOWS_PORTS,
  MOBILE_PORTS,
} from "./constants.js";

export function getMacPrefix(mac = "") {
  return mac && mac !== "Unknown"
    ? mac.toUpperCase().replace(/[:-]/g, "").substring(0, 6)
    : "";
}

export function isLocallyAdministeredMac(mac = "") {
  const compact = mac.toUpperCase().replace(/[:-]/g, "");
  if (compact.length < 2) return false;

  const firstByte = Number.parseInt(compact.substring(0, 2), 16);
  return Number.isFinite(firstByte) && (firstByte & 2) === 2;
}

export function inferVendorFromMac(mac) {
  if (isLocallyAdministeredMac(mac)) {
    return "Private / randomized";
  }

  return OUI_VENDORS[getMacPrefix(mac)] || "Unknown";
}

export function resolveVendor(nmapVendor, mac) {
  if (nmapVendor && nmapVendor !== "Unknown") {
    return nmapVendor;
  }

  return inferVendorFromMac(mac);
}

export function isGatewayCandidate(ip, gatewayCandidates = new Set()) {
  const lastOctet = ip.split(".").at(-1);
  return gatewayCandidates.has(ip) || ROUTER_GATEWAY_HOSTS.has(lastOctet);
}

export function detectDeviceType(
  ip,
  mac,
  openPorts,
  hostname,
  vendor = "Unknown",
  hostnameSource = "unresolved",
  gatewayCandidates = new Set(),
) {
  const lowerHostname = hostname.toLowerCase();
  const lowerVendor = vendor.toLowerCase();
  const gateway = isGatewayCandidate(ip, gatewayCandidates);
  const networkVendor = NETWORK_DEVICE_VENDORS.some((name) =>
    lowerVendor.includes(name),
  );

  if (
    gateway ||
    openPorts.some((port) => NETWORK_PORTS.includes(port)) ||
    networkVendor ||
    lowerHostname.includes("router") ||
    lowerHostname.includes("gateway")
  ) {
    return "Network Device";
  }

  if (
    openPorts.some((port) => PRINTER_PORTS.includes(port)) ||
    lowerHostname.includes("printer") ||
    lowerVendor.includes("epson") ||
    lowerVendor.includes("canon") ||
    lowerVendor.includes("brother") ||
    lowerVendor.includes("xerox")
  ) {
    return "Printer";
  }

  if (openPorts.some((port) => WINDOWS_PORTS.includes(port))) {
    return "PC";
  }

  if (hostnameSource === "netbios") {
    return "PC";
  }

  if (openPorts.includes(22)) {
    return "Linux/Server";
  }

  if (openPorts.some((port) => MOBILE_PORTS.includes(port))) {
    return "Mobile";
  }

  if (
    lowerHostname.includes("iphone") ||
    lowerHostname.includes("ipad") ||
    lowerHostname.includes("android") ||
    lowerHostname.includes("phone")
  ) {
    return "Mobile";
  }

  if (
    lowerHostname.includes("laptop") ||
    lowerHostname.includes("notebook") ||
    lowerHostname.includes("macbook")
  ) {
    return "Laptop";
  }

  if (
    lowerHostname.includes("desktop") ||
    lowerHostname.includes("workstation") ||
    lowerHostname.includes("laptop") ||
    lowerHostname.includes("pc-") ||
    lowerHostname.startsWith("pc")
  ) {
    return "PC";
  }

  if (
    lowerVendor.includes("intel") ||
    lowerVendor.includes("realtek") ||
    lowerVendor.includes("dell") ||
    lowerVendor.includes("hewlett") ||
    lowerVendor.includes("hp") ||
    lowerVendor.includes("lenovo") ||
    lowerVendor.includes("microsoft") ||
    lowerVendor.includes("asustek") ||
    lowerVendor.includes("micro-star") ||
    lowerVendor.includes("gigabyte") ||
    lowerVendor.includes("vmware") ||
    lowerVendor.includes("virtualbox") ||
    lowerVendor.includes("parallels")
  ) {
    return "PC";
  }

  if (
    lowerVendor.includes("apple") ||
    lowerVendor.includes("samsung") ||
    lowerVendor.includes("xiaomi") ||
    lowerVendor.includes("oppo") ||
    lowerVendor.includes("vivo") ||
    lowerVendor.includes("huawei") ||
    lowerVendor.includes("private / randomized")
  ) {
    return "Mobile";
  }

  if (!mac || mac === "Unknown") return "Unknown";

  const macPrefix = getMacPrefix(mac);

  const mobileOUIs = [
    "001018", "00238C", "001217", "0080C6", "086C39", "0C8DEB", "185AED", "1C3647", "2426C0", "34363B", "38F9D3", "3C2EFF", "3CBAF8", "48A482", "4C87FB", "50E551", "509A4C", "60F81D", "68A86B", "705F43", "74C25D", "7C1007", "7C2658", "ACBC32", "A0D2B8", "AAABBC", "AABBCC", "BC0A45", "E01040", "FAFFFF", "001E46", "0021E9", "0054A4", "105C7E", "1C328D", "201E77", "2859A6", "2CC4D7", "34C38A", "440AF9", "5065F3", "60A10D", "68873E", "685BEC", "6CC2CB", "7042B5", "78DBBF", "7C1E52", "8CD21E", "98B0E9", "ACDC38", "BC4CC4", "C0F2FA", "D076F0", "F03F2E", "F4E9D4", "0020E0", "001083", "0010FA", "001E72", "002152", "002256", "001A3A", "001E8F"
  ];

  if (mobileOUIs.includes(macPrefix)) {
    return "Mobile";
  }

  return "PC";
}

export function getDeviceKind(deviceType, vendor, openPorts, gateway) {
  const lowerVendor = vendor.toLowerCase();

  if (deviceType === "Network Device") {
    if (gateway) {
      if (lowerVendor.includes("fiberhome")) return "Fiberhome router/gateway";
      if (lowerVendor.includes("tp-link")) return "TP-Link router/gateway";
      if (lowerVendor.includes("d-link")) return "D-Link router/gateway";
      if (lowerVendor.includes("cisco")) return "Cisco router/gateway";
      if (lowerVendor.includes("ubiquiti")) return "Ubiquiti router/gateway";
      if (lowerVendor.includes("mikrotik")) return "MikroTik router/gateway";
      if (lowerVendor.includes("huawei")) return "Huawei router/gateway";
      if (lowerVendor.includes("zte")) return "ZTE router/gateway";
      return "Router/gateway";
    }

    if (openPorts.includes(53)) return "DNS/network service";
    if (openPorts.includes(67) || openPorts.includes(68)) return "DHCP/network service";

    if (NETWORK_DEVICE_VENDORS.some((name) => lowerVendor.includes(name))) {
      return "Network device";
    }
    return "Network device";
  }

  if (deviceType === "Linux/Server") return "Linux/SSH device";
  if (deviceType === "Laptop") return "Laptop";
  if (deviceType === "PC") return "PC";
  if (deviceType === "Mobile") return "Mobile device";
  if (deviceType === "Printer") return "Printer";

  return "Unknown";
}

export function canDeployAgent(deviceType) {
  return ["PC", "Laptop"].includes(deviceType);
}
