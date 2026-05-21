-- Add missing columns to client_network_connections
ALTER TABLE client_network_connections ADD COLUMN domain VARCHAR(255) AFTER process_name;
ALTER TABLE client_network_connections ADD COLUMN connection_count INT DEFAULT 1 AFTER domain;

-- Ensure client_activity_history has the unique constraint for upserts
ALTER TABLE client_activity_history ADD UNIQUE INDEX idx_activity_unique (client_id, domain);
