ALTER TABLE clients
ADD COLUMN agent_version VARCHAR(20) NULL AFTER token_expires_at;
