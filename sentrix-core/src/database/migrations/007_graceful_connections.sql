-- Migration: Graceful Connection Persistence
-- Description: Adds a unique constraint to allow "touching" connections instead of wiping them, resolving dashboard flickering.

-- 1. Remove any potential duplicates first to avoid index failure
DELETE FROM client_network_connections WHERE id NOT IN (
    SELECT id FROM (
        SELECT MIN(id) AS id
        FROM client_network_connections
        GROUP BY client_id, remote_address, remote_port, local_port, protocol
    ) AS tmp
);

-- 2. Add the composite unique index
ALTER TABLE client_network_connections 
ADD UNIQUE INDEX idx_conn_persistence (client_id, remote_address, remote_port, local_port, protocol);
