/**
 * Cleans up and standardizes USB device names and metadata.
 */
export function simplifyUsbDevice(device) {
  const rawName = device.name || device.deviceName || "";
  const manufacturer = device.manufacturer || device.vendor || "";

  let name = rawName;
  if (manufacturer && rawName && !rawName.includes(manufacturer)) {
    name = `${manufacturer} ${rawName}`.trim();
  }

  return {
    name: name || device.id || device.deviceId || "USB Device",
    type: device.type || "USB",
    vendor: manufacturer || "Unknown",
    id: device.id || device.deviceId || "Unknown",
  };
}

/**
 * Transforms cryptic Windows driver strings and technical jargon into clean, human-readable peripheral names.
 */
export function humanizePeripheralName(rawName = "", manufacturer = "", className = "") {
  let name = rawName.trim();
  const lowerName = name.toLowerCase();

  // 1. Map generic Windows driver / HID terms to clean human-readable names
  if (lowerName.includes("consumer control device")) {
    return { name: "Keyboard Media & Shortcut Keys", manufacturer: manufacturer === "Microsoft" ? "Generic / OEM" : manufacturer };
  }
  if (lowerName.includes("system control device") || lowerName.includes("system controller")) {
    return { name: "System Power Controller", manufacturer: manufacturer === "Microsoft" ? "Generic / OEM" : manufacturer };
  }
  if (lowerName.includes("hid-compliant mouse") || lowerName.includes("compliant mouse") || (className.toLowerCase() === "mouse" && lowerName.includes("hid"))) {
    return { name: "Standard Optical Mouse", manufacturer: manufacturer === "Microsoft" ? "Generic / OEM" : manufacturer };
  }
  if (lowerName.includes("hid keyboard device") || lowerName.includes("hid-compliant keyboard") || (className.toLowerCase() === "keyboard" && lowerName.includes("hid"))) {
    return { name: "Standard Keyboard", manufacturer: manufacturer === "Microsoft" ? "Generic / OEM" : manufacturer };
  }
  if (lowerName.includes("bluetooth hid device")) {
    return { name: "Bluetooth Input Controller", manufacturer: manufacturer === "Microsoft" ? "Generic / OEM" : manufacturer };
  }
  if (lowerName.includes("hands-free ag")) {
    return { name: "Bluetooth Hands-Free Audio", manufacturer: manufacturer === "Microsoft" ? "Generic / OEM" : manufacturer };
  }
  if (lowerName.includes("stereo") && (lowerName.includes("audio") || className.toLowerCase() === "media" || className.toLowerCase() === "bluetooth")) {
    return { name: "Bluetooth Stereo Audio", manufacturer: manufacturer === "Microsoft" ? "Generic / OEM" : manufacturer };
  }

  // 2. Clean up common redundant prefixes
  let cleanName = name
    .replace(/^Microsoft\s+/i, "")
    .replace(/^HID-compliant\s+/i, "")
    .replace(/^Standard\s+/i, "")
    .trim();

  if (!cleanName) {
    cleanName = name || "Peripheral Device";
  }

  cleanName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);

  // 3. Fix misleading manufacturer (if manufacturer is Microsoft for generic classes)
  let cleanManufacturer = manufacturer;
  const isGenericClass = ["hidclass", "mouse", "keyboard", "system", "bluetooth"].includes(className.toLowerCase());
  if (cleanManufacturer.toLowerCase() === "microsoft" && isGenericClass && !lowerName.includes("surface") && !lowerName.includes("xbox")) {
    cleanManufacturer = "Generic / OEM";
  }

  return {
    name: cleanName,
    manufacturer: cleanManufacturer
  };
}

/**
 * Combines USB device properties into a single searchable string.
 */
function getUsbSearchText(device = {}) {
  return [
    device.name,
    device.type,
    device.vendor,
    device.id,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Checks if any keyword exists in a given text.
 */
function hasAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

/**
 * Categorizes a list of USB devices and graphics info into specific peripheral types (mouse, keyboard, etc.).
 */
export function classifyPeripherals(usbDevices = [], graphics = {}) {
  const searchTexts = usbDevices.map(getUsbSearchText);
  const types = usbDevices.map(d => (d.type || "").toLowerCase());

  return {
    mouse: types.includes("mouse") || searchTexts.some((text) =>
      hasAny(text, ["mouse", "pointing device", "trackball", "touchpad"]),
    ),
    keyboard: types.includes("keyboard") || searchTexts.some((text) =>
      hasAny(text, ["keyboard", "kbd", "keychron", "logitech receiver"]),
    ),
    wifiDongle: types.includes("net") || searchTexts.some((text) =>
      hasAny(text, [
        "wireless", "wi-fi", "wifi", "802.11", "wlan", "rtl8188", "rtl8192",
        "rtl8812", "rtl8814", "realtek 11n", "ac600", "ac1200",
        "wireless adapter", "wireless lan", "network adapter", "wifi adapter",
      ]),
    ),
    bluetoothDongle: types.includes("bluetooth") || searchTexts.some((text) =>
      hasAny(text, [
        "bluetooth", "bt adapter", "bt dongle", "bluetooth radio",
        "csr8510", "broadcom bluetooth",
      ]),
    ),
    webcam: types.includes("image") || types.includes("camera") || searchTexts.some((text) =>
      hasAny(text, ["camera", "webcam", "uvc", "imaging device"]),
    ),
    storage: types.includes("diskdrive") || searchTexts.some((text) =>
      hasAny(text, [
        "mass storage", "flash", "disk", "usb drive", "thumb drive",
        "storage", "card reader",
      ]),
    ),
    graphicsCards: (graphics.controllers || []).map((controller) => ({
      model: controller.model || "Unknown GPU",
      vendor: controller.vendor || "Unknown",
      vram: controller.vram || 0,
    })),
    displays: (graphics.displays || []).map((display) => ({
      model: display.model || "Unknown Display",
      resolution: display.resolutionX && display.resolutionY
        ? `${display.resolutionX}x${display.resolutionY}`
        : "Unknown",
    })),
  };
}
