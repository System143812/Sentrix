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
  history JSON NOT NULL,
  archived TINYINT(1) NOT NULL DEFAULT 0,
  last_seen_at BIGINT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
