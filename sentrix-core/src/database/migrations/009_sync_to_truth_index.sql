-- Migration: Sync-to-Truth Unique Index
-- Description: Enforces a strict logical unique index to prevent duplication and enable mirroring.

-- 1. Remove the previous activity-centric index
ALTER TABLE client_network_connections DROP INDEX idx_activity_identity;

-- 2. Make critical columns NOT NULL to ensure the index works reliably
-- domain contains 'localhost:port' or the resolved site name
-- process_name contains 'chrome' or 'mysqld'
ALTER TABLE client_network_connections 
MODIFY COLUMN domain VARCHAR(255) NOT NULL DEFAULT '',
MODIFY COLUMN process_name VARCHAR(255) NOT NULL DEFAULT '';

-- 3. Deep cleanup of any logical duplicates before applying index
DELETE FROM client_network_connections WHERE id NOT IN (
    SELECT id FROM (
        SELECT MIN(id) AS id
        FROM client_network_connections
        GROUP BY client_id, domain, process_name
    ) AS tmp
);

-- 4. Create the Absolute Truth unique index
-- This matches exactly how the Agent identifies a unique activity.
ALTER TABLE client_network_connections 
ADD UNIQUE INDEX idx_sync_truth (client_id, domain, process_name);
