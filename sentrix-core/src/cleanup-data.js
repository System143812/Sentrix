import mysql from "mysql2/promise";

// Using the credentials I found in your .env earlier
const pool = mysql.createPool({
  host: "localhost",
  port: 3306,
  user: "root",
  password: "9Slselc1o3ro.",
  database: "sentrix",
});

async function clearData() {
  console.log("--- Sentrix Data Cleanup ---");
  console.log("This will remove all clients, metrics, hardware history, and logs.");
  
  const tablesToTruncate = [
    "agent_deployment_records",
    "audit_logs",
    "client_activity_history",
    "client_displays",
    "client_dns_logs",
    "client_graphics_cards",
    "client_groups",
    "client_hardware_disks",
    "client_hardware_profiles",
    "client_metric_cpu_samples",
    "client_metric_disk_samples",
    "client_metric_memory_samples",
    "client_metric_network_samples",
    "client_metric_samples",
    "client_metric_system_samples",
    "client_metric_temperature_samples",
    "client_network_activity_logs",
    "client_network_adapters",
    "client_network_connections",
    "client_peripheral_events",
    "client_peripheral_inventory",
    "client_peripherals",
    "client_processes",
    "client_usb_devices",
    "clients",
    "discovery_scan_results",
    "dns_intelligence"
  ];

  const connection = await pool.getConnection();
  try {
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    
    for (const table of tablesToTruncate) {
      process.stdout.write(`Clearing ${table}... `);
      await connection.query(`TRUNCATE TABLE ${table}`);
      console.log("OK");
    }

    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    console.log("\nCleanup complete! Your database is now fresh (Users preserved).");
  } catch (err) {
    console.error("\nCleanup Failed:", err.message);
  } finally {
    connection.release();
    process.exit(0);
  }
}

clearData();
