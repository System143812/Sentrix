CREATE TABLE IF NOT EXISTS client_activity_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id VARCHAR(255) NOT NULL,
  domain VARCHAR(255) NOT NULL,
  process_name VARCHAR(255),
  full_domain TEXT,
  first_seen_at BIGINT NOT NULL,
  last_seen_at BIGINT NOT NULL,
  hit_count INT DEFAULT 1,
  INDEX idx_activity_client (client_id),
  INDEX idx_activity_time (last_seen_at),
  CONSTRAINT fk_activity_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);
