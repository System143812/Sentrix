-- Migration: Add security_incidents table for persistent rate-limiting

CREATE TABLE IF NOT EXISTS security_incidents (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ip_address VARCHAR(45) NOT NULL,
  mac_address VARCHAR(17) NULL,
  event_type VARCHAR(50) NOT NULL,
  created_at BIGINT NOT NULL,
  INDEX idx_incidents_ip_time (ip_address, created_at),
  INDEX idx_incidents_mac_time (mac_address, created_at)
);
