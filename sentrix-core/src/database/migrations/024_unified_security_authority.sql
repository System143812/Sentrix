-- Migration: Unified Security Authority (Consolidate IP and MAC into single records)

ALTER TABLE security_authority
  ADD COLUMN ip_address VARCHAR(45) NULL,
  ADD COLUMN mac_address VARCHAR(17) NULL,
  ADD COLUMN block_target ENUM('ip', 'mac', 'all') NOT NULL DEFAULT 'all';

-- Drop the old strict identity index to allow unified records
DROP INDEX idx_blocked_subject_identity ON security_authority;

-- Add a more flexible index for security checks
CREATE INDEX idx_security_authority_identifiers ON security_authority (active, category, ip_address, mac_address);

-- Optional: Initial data cleanup if any existing rows can be merged (Manual process usually, but we keep it simple here)
-- We will rely on the service layer to handle the merge on new bans.
