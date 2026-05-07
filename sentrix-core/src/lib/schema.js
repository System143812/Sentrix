import pool from "./database.js";

export async function ensureDatabaseSchema() {
  const [[clientsTable]] = await pool.query(`SHOW TABLES LIKE 'clients'`);

  if (!clientsTable) {
    return;
  }

  const [deviceTypeColumn] = await pool.query(
    `SHOW COLUMNS FROM clients LIKE 'device_type'`,
  );

  if (deviceTypeColumn.length === 0) {
    await pool.query(
      `ALTER TABLE clients ADD COLUMN device_type VARCHAR(100) NOT NULL DEFAULT 'computer' AFTER os`,
    );
  }

  const [metricsColumn] = await pool.query(
    `SHOW COLUMNS FROM clients LIKE 'metrics'`,
  );

  if (metricsColumn.length === 0) {
    await pool.query(
      `ALTER TABLE clients ADD COLUMN metrics JSON NOT NULL AFTER status`,
    );
  }

  const [detailsColumn] = await pool.query(
    `SHOW COLUMNS FROM clients LIKE 'details'`,
  );

  if (detailsColumn.length === 0) {
    await pool.query(
      `ALTER TABLE clients ADD COLUMN details JSON NOT NULL AFTER metrics`,
    );
  }

  const [historyColumn] = await pool.query(
    `SHOW COLUMNS FROM clients LIKE 'history'`,
  );

  if (historyColumn.length === 0) {
    await pool.query(
      `ALTER TABLE clients ADD COLUMN history JSON NOT NULL AFTER details`,
    );
  }
}
