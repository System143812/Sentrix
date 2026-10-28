ALTER TABLE agent_deployment_records MODIFY COLUMN status ENUM('requested', 'deploying', 'updating', 'prepared', 'success', 'failed', 'timeout') NOT NULL DEFAULT 'requested';
