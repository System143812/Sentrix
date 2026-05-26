
import 'dotenv/config';
import pool from './sentrix-core/src/lib/database.js';

async function checkDb() {
  const agentId = '8c560a3d-2ceb-4047-a297-a4c54a3eea19';
  try {
    // Set environment variables for the pool to find
    process.env.DB_HOST = process.env.DB_HOST || 'localhost';
    const [rows] = await pool.query('SELECT id, hostname, status, archived, last_seen_at FROM clients WHERE id = ?', [agentId]);
    console.log("--- AGENT IN DATABASE ---");
    if (rows.length === 0) {
      console.log("Agent NOT found in database.");
    } else {
      console.log(JSON.stringify(rows[0], null, 2));
    }
    
    const [all] = await pool.query('SELECT id, hostname, status FROM clients');
    console.log("\n--- ALL CLIENTS ---");
    console.log(JSON.stringify(all, null, 2));

    process.exit(0);
  } catch (err) {
    console.error("DB Error:", err);
    process.exit(1);
  }
}

checkDb();
