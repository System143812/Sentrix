ALTER TABLE security_authority
MODIFY COLUMN category ENUM('whitelist', 'rate_limit', 'blacklist') NOT NULL DEFAULT 'rate_limit';
