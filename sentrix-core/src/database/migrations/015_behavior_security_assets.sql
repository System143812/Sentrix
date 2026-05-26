-- Migration: Behavior, security, asset inventory, and peripheral lifecycle controls

ALTER TABLE client_peripheral_inventory
  MODIFY COLUMN status ENUM('connected', 'missing', 'resolved', 'archived') NOT NULL DEFAULT 'connected',
  ADD COLUMN resolved_at BIGINT NULL,
  ADD COLUMN archived_at BIGINT NULL,
  ADD COLUMN lifecycle_note TEXT NULL;

ALTER TABLE client_peripheral_events
  MODIFY COLUMN event_type ENUM('connected', 'disconnected', 'missing_after_offline', 'resolved', 'archived', 'recovered') NOT NULL;

CREATE TABLE IF NOT EXISTS event_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_id CHAR(36) NULL,
  event_type VARCHAR(80) NOT NULL,
  severity ENUM('info', 'warning', 'critical') NOT NULL DEFAULT 'info',
  title VARCHAR(255) NOT NULL,
  description TEXT,
  metadata JSON,
  created_at BIGINT NOT NULL,
  INDEX idx_event_log_device_time (device_id, created_at),
  INDEX idx_event_log_type_time (event_type, created_at),
  CONSTRAINT fk_event_log_client
    FOREIGN KEY (device_id) REFERENCES clients(id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS client_domain_summaries (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  domain VARCHAR(255) NOT NULL,
  process_name VARCHAR(255) NOT NULL DEFAULT '',
  category VARCHAR(80) NOT NULL DEFAULT 'uncategorized',
  hits BIGINT NOT NULL DEFAULT 0,
  bandwidth_bytes BIGINT NOT NULL DEFAULT 0,
  first_seen_at BIGINT NOT NULL,
  last_seen_at BIGINT NOT NULL,
  UNIQUE INDEX idx_domain_summary_identity (client_id, domain, process_name),
  INDEX idx_domain_summary_time (client_id, last_seen_at),
  CONSTRAINT fk_domain_summaries_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS client_software_inventory (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  software_key VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  version VARCHAR(120),
  publisher VARCHAR(255),
  install_date VARCHAR(80),
  status ENUM('installed', 'removed') NOT NULL DEFAULT 'installed',
  risk_level ENUM('normal', 'warning', 'blocked') NOT NULL DEFAULT 'normal',
  first_seen_at BIGINT NOT NULL,
  last_seen_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE INDEX idx_software_identity (client_id, software_key),
  INDEX idx_software_status (client_id, status, updated_at),
  CONSTRAINT fk_software_inventory_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS client_software_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  software_key VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  version VARCHAR(120),
  publisher VARCHAR(255),
  event_type ENUM('installed', 'updated', 'removed', 'flagged') NOT NULL,
  observed_at BIGINT NOT NULL,
  details JSON,
  INDEX idx_software_events_client_time (client_id, observed_at),
  CONSTRAINT fk_software_events_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS anomaly_alerts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  alert_type VARCHAR(80) NOT NULL,
  severity ENUM('info', 'warning', 'critical') NOT NULL DEFAULT 'warning',
  title VARCHAR(255) NOT NULL,
  description TEXT,
  metric_value DECIMAL(14,2),
  baseline_value DECIMAL(14,2),
  metadata JSON,
  created_at BIGINT NOT NULL,
  resolved_at BIGINT NULL,
  INDEX idx_anomaly_client_time (client_id, created_at),
  INDEX idx_anomaly_type_time (alert_type, created_at),
  CONSTRAINT fk_anomaly_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS device_health_snapshots (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  status VARCHAR(40) NOT NULL,
  uptime_seconds BIGINT,
  cpu_usage DECIMAL(6,2),
  ram_usage DECIMAL(6,2),
  disk_usage DECIMAL(6,2),
  latency_ms DECIMAL(8,2),
  packet_loss DECIMAL(6,2),
  stability_score DECIMAL(6,2),
  recorded_at BIGINT NOT NULL,
  INDEX idx_health_client_time (client_id, recorded_at),
  CONSTRAINT fk_health_snapshots_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS uptime_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  status ENUM('online', 'offline') NOT NULL,
  started_at BIGINT NOT NULL,
  ended_at BIGINT NULL,
  duration_ms BIGINT NULL,
  INDEX idx_uptime_client_time (client_id, started_at),
  CONSTRAINT fk_uptime_logs_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS blocked_subjects (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  subject_type ENUM('mac', 'user') NOT NULL,
  identifier VARCHAR(255) NOT NULL,
  label VARCHAR(255),
  role VARCHAR(50),
  reason TEXT,
  source_log_id BIGINT NULL,
  blocked_by CHAR(36) NULL,
  blocked_at BIGINT NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE INDEX idx_blocked_subject_identity (subject_type, identifier),
  INDEX idx_blocked_subject_active (active, blocked_at)
);
