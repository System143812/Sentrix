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

  return {
    mouse: searchTexts.some((text) =>
      hasAny(text, ["mouse", "pointing device", "trackball", "touchpad"]),
    ),
    keyboard: searchTexts.some((text) =>
      hasAny(text, ["keyboard", "kbd", "keychron", "logitech receiver"]),
    ),
    wifiDongle: searchTexts.some((text) =>
      hasAny(text, [
        "wireless", "wi-fi", "wifi", "802.11", "wlan", "rtl8188", "rtl8192", 
        "rtl8812", "rtl8814", "realtek 11n", "ac600", "ac1200", 
        "wireless adapter", "wireless lan", "network adapter", "wifi adapter",
      ]),
    ),
    bluetoothDongle: searchTexts.some((text) =>
      hasAny(text, [
        "bluetooth", "bt adapter", "bt dongle", "bluetooth radio", 
        "csr8510", "broadcom bluetooth",
      ]),
    ),
    webcam: searchTexts.some((text) =>
      hasAny(text, ["camera", "webcam", "uvc", "imaging device"]),
    ),
    storage: searchTexts.some((text) =>
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
