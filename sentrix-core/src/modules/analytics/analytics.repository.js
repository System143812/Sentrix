import pool from "../../lib/database.js";

export const AnalyticsRepository = {
  async findPeripheralInventory() {
    const [rows] = await pool.query("SELECT * FROM client_peripheral_inventory");
    return rows;
  },

  async findHardwareProfiles() {
    const [rows] = await pool.query("SELECT * FROM client_hardware_profiles");
    return rows;
  },
};
