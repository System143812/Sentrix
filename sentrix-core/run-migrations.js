
import 'dotenv/config';
import { ensureDatabaseSchema } from './src/lib/schema.js';

async function runMigrations() {
  try {
    await ensureDatabaseSchema();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

runMigrations();
