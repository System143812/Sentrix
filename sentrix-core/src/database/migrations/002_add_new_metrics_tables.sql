-- Migration: 002_add_new_metrics_tables
-- Description: Add specialized tables for processes, DNS, and network connections. Persist discovery results.

ALTER TABLE clients DROP COLUMN history;

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
  process_name VARCHAR(255),
  recorded_at BIGINT NOT NULL,
  INDEX idx_connections_client_time (client_id, recorded_at),
  CONSTRAINT fk_connections_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON DELETE CASCADE
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
  last_scanned_at BIGINT NOT NULL,
  UNIQUE INDEX idx_discovery_ip (ip)
);
