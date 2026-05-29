import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "3306"),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "sentrix",
});

async function clearData() {
  console.log("\n--- 🧹 Sentrix Full Data Cleanup ---");
  console.log("This will remove all clients, metrics, hardware inventory, and system logs.");
  console.log("⚠️  User accounts and system settings will be preserved.\n");
  
  const tablesToTruncate = [
    "agent_deployment_records",
    "audit_logs",
    "client_activity_history",
    "client_displays",
    "client_dns_logs",
    "client_graphics_cards",
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
    "client_groups",
    "discovery_scan_results"
  ];

  const connection = await pool.getConnection();
  try {
    // Disable FK checks to allow truncation of parent/child tables in any order
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    
    for (const table of tablesToTruncate) {
      try {
        process.stdout.write(`Clearing ${table.padEnd(35)}... `);
        await connection.query(`TRUNCATE TABLE ${table}`);
        console.log("✅ OK");
      } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') {
          console.log("⏭️  Skipped (Table doesn't exist)");
        } else {
          console.log(`❌ Error: ${err.message}`);
        }
      }
    }

    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    console.log("\n✨ Cleanup complete! The operational database is fresh.");
    console.log("👤 Users table remains untouched.");
    console.log("⚙️  System settings remain untouched.");
  } catch (err) {
    console.error("\n💥 Critical Cleanup Failure:", err.message);
  } finally {
    connection.release();
    await pool.end();
    process.exit(0);
  }
}

clearData();
