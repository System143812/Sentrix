ALTER TABLE clients
ADD COLUMN hardware_fingerprint VARCHAR(64) NULL AFTER archived,
ADD COLUMN provisioning_token VARCHAR(64) NULL AFTER hardware_fingerprint,
ADD COLUMN token_expires_at BIGINT NULL AFTER provisioning_token;

CREATE INDEX idx_clients_fingerprint ON clients(hardware_fingerprint);
CREATE INDEX idx_clients_token ON clients(provisioning_token);
