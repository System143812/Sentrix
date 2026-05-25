CREATE TABLE IF NOT EXISTS system_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value JSON NOT NULL,
  updated_by CHAR(36) NULL,
  updated_at BIGINT NOT NULL,
  INDEX idx_system_settings_updated_at (updated_at)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor_id CHAR(36) NULL,
  actor_email VARCHAR(255),
  actor_role VARCHAR(50),
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(100),
  target_id VARCHAR(255),
  target_label VARCHAR(255),
  ip_address VARCHAR(45),
  mac_address VARCHAR(32),
  details JSON,
  created_at BIGINT NOT NULL,
  INDEX idx_audit_created_at (created_at),
  INDEX idx_audit_actor (actor_id, created_at),
  INDEX idx_audit_action (action, created_at)
);

ALTER TABLE discovery_scan_results
  ADD COLUMN agent_status ENUM('running', 'offline', 'none') NOT NULL DEFAULT 'none',
  ADD COLUMN registered_client_id CHAR(36) NULL,
  ADD COLUMN deployment_action VARCHAR(40) NOT NULL DEFAULT 'not_eligible',
  ADD COLUMN last_agent_seen_at BIGINT NULL;

CREATE TABLE IF NOT EXISTS client_peripheral_inventory (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  peripheral_key VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  category VARCHAR(100),
  vendor VARCHAR(255),
  external_id VARCHAR(255),
  status ENUM('connected', 'missing') NOT NULL DEFAULT 'connected',
  first_seen_at BIGINT NOT NULL,
  last_seen_at BIGINT NOT NULL,
  missing_since BIGINT NULL,
  missing_detected_offline TINYINT(1) NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL,
  UNIQUE INDEX idx_peripheral_identity (client_id, peripheral_key),
  INDEX idx_peripheral_client_status (client_id, status),
  CONSTRAINT fk_peripheral_inventory_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS client_peripheral_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  peripheral_key VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  category VARCHAR(100),
  vendor VARCHAR(255),
  event_type ENUM('connected', 'disconnected', 'missing_after_offline') NOT NULL,
  observed_at BIGINT NOT NULL,
  last_seen_at BIGINT NULL,
  details JSON,
  INDEX idx_peripheral_events_client_time (client_id, observed_at),
  CONSTRAINT fk_peripheral_events_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON DELETE CASCADE
);

INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
VALUES ('telemetry', JSON_OBJECT('intervalMs', 5000), NULL, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000)
ON DUPLICATE KEY UPDATE setting_key = setting_key;
