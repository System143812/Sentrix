ALTER TABLE blocked_subjects
MODIFY COLUMN subject_type ENUM('mac', 'user', 'ip', 'agent_id') NOT NULL,
ADD COLUMN category ENUM('whitelist', 'rate_limit') NOT NULL DEFAULT 'rate_limit',
ADD INDEX idx_security_category (category, active);
