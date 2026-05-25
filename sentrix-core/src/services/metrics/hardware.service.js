import pool from "../../lib/database.js";
import { withDeadlockRetry, toNumber, toJson } from "../../utils/db.utils.js";

function normalizeKey(value = "") {
  return String(value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

function buildPeripheralSnapshot(details = {}) {
  const peripherals = details.peripherals || {};
  const usbDevices = Array.isArray(details.usbDevices) ? details.usbDevices : [];
  const displays = Array.isArray(peripherals.displays) ? peripherals.displays : [];
  const networkAdapters = Array.isArray(details.specs?.networkAdapters) ? details.specs.networkAdapters : [];
  const items = [];

  for (const usb of usbDevices) {
    const identity = usb.id || `${usb.vendor || ""}-${usb.name || ""}-${usb.type || "USB"}`;
    items.push({
      key: `usb:${normalizeKey(identity)}`,
      name: usb.name || "USB Device",
      category: usb.type || "USB",
      vendor: usb.vendor || "Unknown",
      externalId: usb.id || null,
    });
  }

  for (const display of displays) {
    const identity = `${display.model || "display"}-${display.resolution || ""}`;
    items.push({
      key: `display:${normalizeKey(identity)}`,
      name: display.model || "Display",
      category: "Display",
      vendor: null,
      externalId: display.resolution || null,
    });
  }

  for (const adapter of networkAdapters.filter((item) => /usb|wireless|bluetooth/i.test(`${item.name} ${item.type}`))) {
    const identity = adapter.mac || adapter.name;
    items.push({
      key: `adapter:${normalizeKey(identity)}`,
      name: adapter.name || "Network Adapter",
      category: adapter.type || "Network Adapter",
      vendor: null,
      externalId: adapter.mac || null,
    });
  }

  for (const [key, label] of [
    ["mouse", "Mouse"],
    ["keyboard", "Keyboard"],
    ["webcam", "Webcam"],
    ["wifiDongle", "WiFi Dongle"],
    ["bluetoothDongle", "Bluetooth Dongle"],
    ["storage", "USB Storage"],
  ]) {
    if (peripherals[key]) {
      items.push({
        key: `class:${key}`,
        name: label,
        category: label,
        vendor: null,
        externalId: null,
      });
    }
  }

  return [...new Map(items.map((item) => [item.key, item])).values()];
}

async function savePeripheralTracking(connection, clientId, details, now) {
  const snapshot = buildPeripheralSnapshot(details);
  const snapshotByKey = new Map(snapshot.map((item) => [item.key, item]));
  const [existingRows] = await connection.query(
    "SELECT * FROM client_peripheral_inventory WHERE client_id = ?",
    [clientId],
  );
  const existingByKey = new Map(existingRows.map((row) => [row.peripheral_key, row]));

  for (const item of snapshot) {
    const existing = existingByKey.get(item.key);
    await connection.query(
      `
      INSERT INTO client_peripheral_inventory
        (client_id, peripheral_key, name, category, vendor, external_id, status, first_seen_at, last_seen_at, missing_since, missing_detected_offline, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'connected', ?, ?, NULL, 0, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        category = VALUES(category),
        vendor = VALUES(vendor),
        external_id = VALUES(external_id),
        status = 'connected',
        last_seen_at = VALUES(last_seen_at),
        missing_since = NULL,
        missing_detected_offline = 0,
        updated_at = VALUES(updated_at)
      `,
      [clientId, item.key, item.name, item.category, item.vendor, item.externalId, now, now, now],
    );

    if (!existing || existing.status === "missing") {
      await connection.query(
        `
        INSERT INTO client_peripheral_events
          (client_id, peripheral_key, name, category, vendor, event_type, observed_at, last_seen_at, details)
        VALUES (?, ?, ?, ?, ?, 'connected', ?, ?, ?)
        `,
        [clientId, item.key, item.name, item.category, item.vendor, now, now, toJson({ externalId: item.externalId })],
      );
    }
  }

  for (const row of existingRows) {
    if (snapshotByKey.has(row.peripheral_key) || row.status === "missing") continue;

    const missingOffline = Number(row.last_seen_at || 0) < now - 90_000;
    await connection.query(
      `
      UPDATE client_peripheral_inventory
      SET status = 'missing',
          missing_since = ?,
          missing_detected_offline = ?,
          updated_at = ?
      WHERE client_id = ? AND peripheral_key = ?
      `,
      [now, missingOffline ? 1 : 0, now, clientId, row.peripheral_key],
    );

    await connection.query(
      `
      INSERT INTO client_peripheral_events
        (client_id, peripheral_key, name, category, vendor, event_type, observed_at, last_seen_at, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        clientId,
        row.peripheral_key,
        row.name,
        row.category,
        row.vendor,
        missingOffline ? "missing_after_offline" : "disconnected",
        now,
        row.last_seen_at,
        toJson({ note: missingOffline ? "Detected missing after the agent came back online." : "Detected while agent was online." }),
      ],
    );
  }
}

export async function saveHardwareDetails(clientId, details = {}) {
  if (!details || typeof details !== "object") return;

  const specs = details.specs || {};
  const peripherals = details.peripherals || {};
  const now = Date.now();

  return withDeadlockRetry(async () => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Profiles and Peripherals are 1-to-1 with client_id, so UPSERT is perfect and safe.
      await connection.query(
        `
        INSERT INTO client_hardware_profiles
          (client_id, manufacturer, model, serial, bios, baseboard, cpu_model, cpu_cores, cpu_threads, total_memory_gb, memory_slots, updated_at)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          manufacturer = VALUES(manufacturer),
          model = VALUES(model),
          serial = VALUES(serial),
          bios = VALUES(bios),
          baseboard = VALUES(baseboard),
          cpu_model = VALUES(cpu_model),
          cpu_cores = VALUES(cpu_cores),
          cpu_threads = VALUES(cpu_threads),
          total_memory_gb = VALUES(total_memory_gb),
          memory_slots = VALUES(memory_slots),
          updated_at = VALUES(updated_at)
        `,
        [
          clientId,
          specs.manufacturer || null,
          specs.model || null,
          specs.serial || null,
          specs.bios || null,
          specs.baseboard || null,
          specs.cpu || null,
          toNumber(specs.cpuCores),
          toNumber(specs.cpuThreads),
          toNumber(specs.totalMemoryGb),
          toNumber(specs.memorySlots),
          now,
        ],
      );

      await connection.query(
        `
        INSERT INTO client_peripherals
          (client_id, mouse, keyboard, wifi_dongle, bluetooth_dongle, webcam, storage, updated_at)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          mouse = VALUES(mouse),
          keyboard = VALUES(keyboard),
          wifi_dongle = VALUES(wifi_dongle),
          bluetooth_dongle = VALUES(bluetooth_dongle),
          webcam = VALUES(webcam),
          storage = VALUES(storage),
          updated_at = VALUES(updated_at)
        `,
        [
          clientId,
          Boolean(peripherals.mouse),
          Boolean(peripherals.keyboard),
          Boolean(peripherals.wifiDongle),
          Boolean(peripherals.bluetoothDongle),
          Boolean(peripherals.webcam),
          Boolean(peripherals.storage),
          now,
        ],
      );

      // WRITE-ONLY INGESTION for child tables: Bulk Insert everything without DELETE.
      // This eliminates the source of deadlocks (Next-Key locks during DELETE).
      
      const disks = Array.isArray(specs.disks) ? specs.disks : [];
      if (disks.length > 0) {
        const values = disks.map(d => [clientId, d.name || null, d.type || null, toNumber(d.sizeGb), now]);
        await connection.query(`INSERT INTO client_hardware_disks (client_id, name, disk_type, size_gb, updated_at) VALUES ?`, [values]);
      }

      const adapters = Array.isArray(specs.networkAdapters) ? specs.networkAdapters : [];
      if (adapters.length > 0) {
        const values = adapters.map(a => [clientId, a.name || null, a.mac || null, a.ip4 || null, a.type || null, now]);
        await connection.query(`INSERT INTO client_network_adapters (client_id, name, mac, ip4, adapter_type, updated_at) VALUES ?`, [values]);
      }

      const usbDevices = Array.isArray(details.usbDevices) ? details.usbDevices : [];
      if (usbDevices.length > 0) {
        const values = usbDevices.map(u => [clientId, u.name || null, u.type || null, u.vendor || null, u.id || null, now]);
        await connection.query(`INSERT INTO client_usb_devices (client_id, name, device_type, vendor, external_id, updated_at) VALUES ?`, [values]);
      }

      const gpus = Array.isArray(peripherals.graphicsCards) ? peripherals.graphicsCards : [];
      if (gpus.length > 0) {
        const values = gpus.map(g => [clientId, g.model || null, g.vendor || null, toNumber(g.vram), now]);
        await connection.query(`INSERT INTO client_graphics_cards (client_id, model, vendor, vram_mb, updated_at) VALUES ?`, [values]);
      }

      const displays = Array.isArray(peripherals.displays) ? peripherals.displays : [];
      if (displays.length > 0) {
        const values = displays.map(d => [clientId, d.model || null, d.resolution || null, now]);
        await connection.query(`INSERT INTO client_displays (client_id, model, resolution, updated_at) VALUES ?`, [values]);
      }

      await savePeripheralTracking(connection, clientId, details, now);

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  });
}

export async function getClientPeripheralHistory(clientId) {
  const [inventoryRows] = await pool.query(
    `
    SELECT *
    FROM client_peripheral_inventory
    WHERE client_id = ?
    ORDER BY status DESC, name ASC
    `,
    [clientId],
  );
  const [eventRows] = await pool.query(
    `
    SELECT *
    FROM client_peripheral_events
    WHERE client_id = ?
    ORDER BY observed_at DESC
    LIMIT 100
    `,
    [clientId],
  );

  return {
    inventory: inventoryRows.map((row) => ({
      key: row.peripheral_key,
      name: row.name,
      category: row.category,
      vendor: row.vendor,
      externalId: row.external_id,
      status: row.status,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      missingSince: row.missing_since,
      missingDetectedOffline: Boolean(row.missing_detected_offline),
      updatedAt: row.updated_at,
    })),
    events: eventRows.map((row) => ({
      id: row.id,
      key: row.peripheral_key,
      name: row.name,
      category: row.category,
      vendor: row.vendor,
      eventType: row.event_type,
      observedAt: row.observed_at,
      lastSeenAt: row.last_seen_at,
      details: typeof row.details === "string" ? JSON.parse(row.details || "{}") : row.details,
    })),
  };
}

export async function getClientHardware(clientId) {
  const [[profile]] = await pool.query(`SELECT * FROM client_hardware_profiles WHERE client_id = ? LIMIT 1`, [clientId]);
  const [[peripherals]] = await pool.query(`SELECT * FROM client_peripherals WHERE client_id = ? LIMIT 1`, [clientId]);

  // Fetch only the LATEST snapshot for child tables to stay consistent with Write-Only ingestion.
  const [disks] = await pool.query(
    `SELECT * FROM client_hardware_disks WHERE client_id = ? AND updated_at = (SELECT MAX(updated_at) FROM client_hardware_disks WHERE client_id = ?)`,
    [clientId, clientId]
  );
  const [networkAdapters] = await pool.query(
    `SELECT * FROM client_network_adapters WHERE client_id = ? AND updated_at = (SELECT MAX(updated_at) FROM client_network_adapters WHERE client_id = ?)`,
    [clientId, clientId]
  );
  const [usbDevices] = await pool.query(
    `SELECT * FROM client_usb_devices WHERE client_id = ? AND updated_at = (SELECT MAX(updated_at) FROM client_usb_devices WHERE client_id = ?)`,
    [clientId, clientId]
  );
  const [graphicsCards] = await pool.query(
    `SELECT * FROM client_graphics_cards WHERE client_id = ? AND updated_at = (SELECT MAX(updated_at) FROM client_graphics_cards WHERE client_id = ?)`,
    [clientId, clientId]
  );
  const [displays] = await pool.query(
    `SELECT * FROM client_displays WHERE client_id = ? AND updated_at = (SELECT MAX(updated_at) FROM client_displays WHERE client_id = ?)`,
    [clientId, clientId]
  );

  return {
    profile: profile ? {
      manufacturer: profile.manufacturer,
      model: profile.model,
      serial: profile.serial,
      bios: profile.bios,
      baseboard: profile.baseboard,
      cpu: profile.cpu_model,
      cpuCores: profile.cpu_cores,
      cpuThreads: profile.cpu_threads,
      totalMemoryGb: profile.total_memory_gb,
      memorySlots: profile.memory_slots,
      updatedAt: profile.updated_at,
    } : null,
    peripherals: peripherals ? {
      mouse: Boolean(peripherals.mouse),
      keyboard: Boolean(peripherals.keyboard),
      wifiDongle: Boolean(peripherals.wifi_dongle),
      bluetoothDongle: Boolean(peripherals.bluetooth_dongle),
      webcam: Boolean(peripherals.webcam),
      storage: Boolean(peripherals.storage),
      updatedAt: peripherals.updated_at,
    } : null,
    disks: disks.map(d => ({ name: d.name, type: d.disk_type, sizeGb: d.size_gb })),
    networkAdapters: networkAdapters.map(a => ({ name: a.name, mac: a.mac, ip4: a.ip4, type: a.adapter_type })),
    usbDevices: usbDevices.map(u => ({ name: u.name, type: u.device_type, vendor: u.vendor, id: u.external_id })),
    graphicsCards: graphicsCards.map(g => ({ model: g.model, vendor: g.vendor, vram: g.vram_mb })),
    displays: displays.map(d => ({ model: d.model, resolution: d.resolution })),
  };
}
