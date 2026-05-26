
import 'dotenv/config';
import pool from './src/lib/database.js';

async function listTables() {
  try {
    const [rows] = await pool.query('SHOW TABLES');
    console.log("--- TABLES ---");
    console.log(JSON.stringify(rows, null, 2));
    
    const [count] = await pool.query('SELECT COUNT(*) as count FROM clients');
    console.log(`\nClient count: ${count[0].count}`);

    process.exit(0);
  } catch (err) {
    console.error("DB Error:", err);
    process.exit(1);
  }
}

listTables();
