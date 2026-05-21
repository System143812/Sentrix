-- Migration: Fix Activity Duplication
-- Description: Redesigns the unique index to match the Agent's grouping logic, preventing duplicate activity rows.

-- 1. Remove the old, overly-specific index
ALTER TABLE client_network_connections DROP INDEX idx_conn_persistence;

-- 2. Clean up any existing logical duplicates that would block the new index
DELETE FROM client_network_connections WHERE id NOT IN (
    SELECT id FROM (
        SELECT MIN(id) AS id
        FROM client_network_connections
        GROUP BY client_id, remote_address, remote_port, process_name
    ) AS tmp
);

-- 3. Create the new Activity-Centric unique index
-- We group by Client, Destination IP, Destination Port, and the Process owning it.
ALTER TABLE client_network_connections 
ADD UNIQUE INDEX idx_activity_identity (client_id, remote_address, remote_port, process_name);
