import pool from "../../lib/database.js";
import { withDeadlockRetry, toNumber } from "../../utils/db.utils.js";

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

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  });
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
