-- sentrix-core MySQL schema

CREATE TABLE IF NOT EXISTS client_groups (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('network_admin', 'admin') NOT NULL DEFAULT 'admin',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id CHAR(36) PRIMARY KEY,
  agent_id CHAR(36),
  hostname VARCHAR(255) NOT NULL,
  ip VARCHAR(45),
  mac VARCHAR(17),
  os VARCHAR(255),
  device_type VARCHAR(100),
  client_group VARCHAR(255) NOT NULL DEFAULT 'Unassigned',
  status ENUM('online', 'offline', 'idle') NOT NULL DEFAULT 'offline',
  metrics JSON NOT NULL,
  details JSON NOT NULL,
  archived TINYINT(1) NOT NULL DEFAULT 0,
  hardware_fingerprint VARCHAR(64) NULL,
  provisioning_token VARCHAR(64) NULL,
  token_expires_at BIGINT NULL,
  agent_version VARCHAR(20) NULL,
  last_seen_at BIGINT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX idx_clients_fingerprint ON clients(hardware_fingerprint);
CREATE INDEX idx_clients_token ON clients(provisioning_token);

CREATE TABLE IF NOT EXISTS client_processes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  pid INT,
  name VARCHAR(255),
  user VARCHAR(255),
  cpu_percent DECIMAL(6,2),
  memory_mb DECIMAL(10,2),
  command TEXT,
  recorded_at BIGINT NOT NULL,
  INDEX idx_processes_client_time (client_id, recorded_at),
  CONSTRAINT fk_processes_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS client_dns_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  domain VARCHAR(255),
  resolved_address VARCHAR(255),
  recorded_at BIGINT NOT NULL,
  INDEX idx_dns_logs_client_time (client_id, recorded_at),
  UNIQUE INDEX idx_dns_log_identity (client_id, domain, resolved_address),
  CONSTRAINT fk_dns_logs_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS client_network_connections (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  protocol VARCHAR(10),
  local_address VARCHAR(45),
  local_port INT,
  remote_address VARCHAR(45),
  remote_port INT,
  state VARCHAR(50),
  process_name VARCHAR(255) NOT NULL DEFAULT '',
  domain VARCHAR(255) NOT NULL DEFAULT '',
  category VARCHAR(50) DEFAULT 'App',
  connection_count INT DEFAULT 1,
  recorded_at BIGINT NOT NULL,
  INDEX idx_connections_client_time (client_id, recorded_at),
  UNIQUE INDEX idx_sync_truth (client_id, domain, process_name),
  CONSTRAINT fk_connections_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS client_activity_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id VARCHAR(255) NOT NULL,
  domain VARCHAR(255) NOT NULL,
  process_name VARCHAR(255),
  category VARCHAR(50) DEFAULT 'App',
  full_domain TEXT,
  first_seen_at BIGINT NOT NULL,
  last_seen_at BIGINT NOT NULL,
  hit_count INT DEFAULT 1,
  INDEX idx_activity_client (client_id),
  INDEX idx_activity_time (last_seen_at),
  UNIQUE INDEX idx_activity_unique (client_id, domain),
  CONSTRAINT fk_activity_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS discovery_scan_results (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ip VARCHAR(45) NOT NULL,
  mac VARCHAR(17),
  hostname VARCHAR(255),
  vendor VARCHAR(255),
  device_type VARCHAR(100),
  device_kind VARCHAR(100),
  open_ports JSON,
  agent_status ENUM('running', 'offline', 'none') NOT NULL DEFAULT 'none',
  registered_client_id CHAR(36) NULL,
  deployment_action VARCHAR(40) NOT NULL DEFAULT 'not_eligible',
  last_agent_seen_at BIGINT NULL,
  last_scanned_at BIGINT NOT NULL,
  UNIQUE INDEX idx_discovery_ip (ip)
);

CREATE TABLE IF NOT EXISTS client_metric_samples (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  schema_version INT NOT NULL DEFAULT 1,
  recorded_at BIGINT NOT NULL,
  cpu_usage DECIMAL(6,2),
  ram_usage DECIMAL(6,2),
  disk_usage DECIMAL(6,2),
  uptime_seconds BIGINT,
  raw_metrics JSON,
  created_at BIGINT NOT NULL,
  INDEX idx_client_metric_samples_client_time (client_id, recorded_at),
  CONSTRAINT fk_metric_samples_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS client_metric_cpu_samples (
  sample_id BIGINT PRIMARY KEY,
  usage_percent DECIMAL(6,2),
  CONSTRAINT fk_cpu_samples_metric
    FOREIGN KEY (sample_id) REFERENCES client_metric_samples(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS client_metric_memory_samples (
  sample_id BIGINT PRIMARY KEY,
  usage_percent DECIMAL(6,2),
  total_bytes BIGINT,
  used_bytes BIGINT,
  available_bytes BIGINT,
  CONSTRAINT fk_memory_samples_metric
    FOREIGN KEY (sample_id) REFERENCES client_metric_samples(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS client_metric_disk_samples (
  sample_id BIGINT PRIMARY KEY,
  usage_percent DECIMAL(6,2),
  total_bytes BIGINT,
  used_bytes BIGINT,
  free_bytes BIGINT,
  mount VARCHAR(100),
  filesystem VARCHAR(100),
  CONSTRAINT fk_disk_samples_metric
    FOREIGN KEY (sample_id) REFERENCES client_metric_samples(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS client_metric_network_samples (
  sample_id BIGINT PRIMARY KEY,
  interface_name VARCHAR(255),
  upload_bytes_per_sec DECIMAL(14,2),
  download_bytes_per_sec DECIMAL(14,2),
  latency_ms DECIMAL(8,2),
  packet_loss DECIMAL(6,2),
  CONSTRAINT fk_network_samples_metric
    FOREIGN KEY (sample_id) REFERENCES client_metric_samples(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS client_metric_temperature_samples (
  sample_id BIGINT PRIMARY KEY,
  cpu_temperature_celsius DECIMAL(6,2),
  gpu_model VARCHAR(255),
  gpu_temperature_celsius DECIMAL(6,2),
  CONSTRAINT fk_temperature_samples_metric
    FOREIGN KEY (sample_id) REFERENCES client_metric_samples(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS client_metric_system_samples (
  sample_id BIGINT PRIMARY KEY,
  uptime_seconds BIGINT,
  os_platform VARCHAR(100),
  os_release VARCHAR(100),
  CONSTRAINT fk_system_samples_metric
    FOREIGN KEY (sample_id) REFERENCES client_metric_samples(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS client_hardware_profiles (
  client_id CHAR(36) PRIMARY KEY,
  manufacturer VARCHAR(255),
  model VARCHAR(255),
  serial VARCHAR(255),
  bios VARCHAR(255),
  baseboard VARCHAR(255),
  cpu_model VARCHAR(255),
  cpu_cores INT,
  cpu_threads INT,
  total_memory_gb DECIMAL(10,2),
  memory_slots INT,
  updated_at BIGINT NOT NULL,
  CONSTRAINT fk_hardware_profiles_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS client_peripherals (
  client_id CHAR(36) PRIMARY KEY,
  mouse TINYINT(1) NOT NULL DEFAULT 0,
  keyboard TINYINT(1) NOT NULL DEFAULT 0,
  wifi_dongle TINYINT(1) NOT NULL DEFAULT 0,
  bluetooth_dongle TINYINT(1) NOT NULL DEFAULT 0,
  webcam TINYINT(1) NOT NULL DEFAULT 0,
  storage TINYINT(1) NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL,
  CONSTRAINT fk_peripherals_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS client_hardware_disks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  name VARCHAR(255),
  disk_type VARCHAR(100),
  size_gb DECIMAL(12,2),
  updated_at BIGINT NOT NULL,
  INDEX idx_hardware_disks_client (client_id),
  CONSTRAINT fk_hardware_disks_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS client_network_adapters (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  name VARCHAR(255),
  mac VARCHAR(32),
  ip4 VARCHAR(45),
  adapter_type VARCHAR(100),
  updated_at BIGINT NOT NULL,
  INDEX idx_network_adapters_client (client_id),
  CONSTRAINT fk_network_adapters_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS client_usb_devices (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  name VARCHAR(255),
  device_type VARCHAR(100),
  vendor VARCHAR(255),
  external_id VARCHAR(255),
  updated_at BIGINT NOT NULL,
  INDEX idx_usb_devices_client (client_id),
  CONSTRAINT fk_usb_devices_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS client_graphics_cards (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  model VARCHAR(255),
  vendor VARCHAR(255),
  vram_mb INT,
  updated_at BIGINT NOT NULL,
  INDEX idx_graphics_cards_client (client_id),
  CONSTRAINT fk_graphics_cards_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS client_displays (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  model VARCHAR(255),
  resolution VARCHAR(100),
  updated_at BIGINT NOT NULL,
  INDEX idx_displays_client (client_id),
  CONSTRAINT fk_displays_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON DELETE CASCADE
);  

CREATE TABLE IF NOT EXISTS client_network_activity_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  event_type ENUM('dns', 'process', 'connection') NOT NULL,
  process_name VARCHAR(255),
  process_id INT,
  domain VARCHAR(255),
  remote_address VARCHAR(255),
  remote_port INT,
  protocol VARCHAR(50),
  observed_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  INDEX idx_activity_logs_client_time (client_id, observed_at),
  INDEX idx_activity_logs_event_type (event_type),
  CONSTRAINT fk_activity_logs_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON DELETE CASCADE
);

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

CREATE TABLE IF NOT EXISTS agent_deployment_records (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ip VARCHAR(45) NOT NULL,
  mac VARCHAR(32),
  hostname VARCHAR(255),
  status ENUM('requested', 'prepared', 'success', 'failed') NOT NULL DEFAULT 'requested',
  message TEXT,
  requested_by CHAR(36) NULL,
  requested_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE INDEX idx_agent_deployment_ip (ip),
  INDEX idx_agent_deployment_status (status, updated_at)
);

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
