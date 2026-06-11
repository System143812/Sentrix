import pool from './src/lib/database.js';

async function cleanup() {
  try {
    console.log('--- Database Deduplication Cleanup ---');
    
    // Find all active clients
    const [rows] = await pool.query(
      'SELECT id, hostname, ip, mac, last_seen_at FROM clients WHERE archived = 0 ORDER BY last_seen_at DESC'
    );

    if (rows.length === 0) {
      console.log('No active clients found.');
      return;
    }

    const seenMacs = new Set();
    const toArchive = [];

    for (const row of rows) {
      const mac = row.mac ? row.mac.toUpperCase() : null;
      
      // If we have already seen this MAC (and it's not null/unknown), archive this one
      if (mac && mac !== 'UNKNOWN' && seenMacs.has(mac)) {
        console.log(`Duplicate found: ${row.hostname} (${row.ip}) [${row.mac}] - ID: ${row.id}`);
        toArchive.push(row.id);
      } else if (mac && mac !== 'UNKNOWN') {
        seenMacs.add(mac);
      }
    }

    if (toArchive.length > 0) {
      console.log(`Archiving ${toArchive.length} duplicate records...`);
      await pool.query('UPDATE clients SET archived = 1, status = "offline" WHERE id IN (?)', [toArchive]);
      console.log('Cleanup successful.');
    } else {
      console.log('No duplicates found based on MAC address.');
    }

  } catch (error) {
    console.error('Cleanup failed:', error.message);
  } finally {
    process.exit(0);
  }
}

cleanup();
