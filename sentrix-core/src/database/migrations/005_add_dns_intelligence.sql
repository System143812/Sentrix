-- Migration: Add DNS Intelligence Table
-- Description: Creates a global cache for IP-to-hostname resolutions to offload agents and provide persistent offline-aware data.

CREATE TABLE IF NOT EXISTS dns_intelligence (
  ip VARCHAR(45) PRIMARY KEY,
  hostname VARCHAR(255) NOT NULL,
  first_seen_at BIGINT NOT NULL,
  last_verified_at BIGINT NOT NULL,
  ttl INT DEFAULT 86400,
  status ENUM('valid', 'stale', 'failed') DEFAULT 'valid',
  source ENUM('live_dns', 'local_cache', 'manual') DEFAULT 'live_dns',
  INDEX idx_dns_intel_hostname (hostname),
  INDEX idx_dns_intel_verified (last_verified_at)
);
