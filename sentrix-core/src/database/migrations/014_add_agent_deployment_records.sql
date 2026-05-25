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
