import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pool from "./database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.resolve(__dirname, "../database/migrations");

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getExecutedMigrations() {
  const [rows] = await pool.query(
    "SELECT name FROM _migrations ORDER BY id ASC",
  );
  return rows.map((row) => row.name);
}

async function recordMigration(name) {
  await pool.query("INSERT INTO _migrations (name) VALUES (?)", [name]);
}

export async function ensureDatabaseSchema() {
  try {
    await ensureMigrationsTable();

    const executed = await getExecutedMigrations();
    const files = await fs.readdir(MIGRATIONS_DIR);

    const migrationFiles = files.filter((file) => file.endsWith(".sql")).sort();

    let appliedCount = 0;

    for (const file of migrationFiles) {
      if (!executed.includes(file)) {
        console.log(`[DB] Applying migration: ${file}...`);

        const filePath = path.join(MIGRATIONS_DIR, file);
        const sql = await fs.readFile(filePath, "utf-8");

        const statements = sql
          .split(";")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        for (const statement of statements) {
          await pool.query(statement);
        }

        await recordMigration(file);
        console.log(`[DB] Migration ${file} applied successfully.`);
        appliedCount++;
      }
    }

    if (appliedCount > 0) {
      console.log(
        `[DB] Migration process complete. ${appliedCount} new migrations applied.`,
      );
    } else {
      console.log("[DB] Database is up to date.");
    }
  } catch (error) {
    console.error("[DB] Migration failed:", error);
    throw error;
  }
}
