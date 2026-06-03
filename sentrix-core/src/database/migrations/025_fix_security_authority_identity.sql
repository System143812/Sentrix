-- Fix: Robust Deduplication, Restore Unique Index and Backfill Unified Columns

-- 1. Safely remove duplicates before adding unique index
-- We create a temporary table to identify IDs to keep, then delete others.
-- This is more robust than a direct join on some MySQL versions.
DELETE FROM security_authority 
WHERE id NOT IN (
    SELECT id FROM (
        SELECT MIN(id) as id
        FROM security_authority
        GROUP BY subject_type, identifier
    ) as tmp
);

-- 2. Restore the unique index on (subject_type, identifier)
-- Use a block to ensure we don't fail if it exists (though runner doesn't support complex blocks well, 
-- we'll just rely on the DELETE above making it safe to recreate or the runner skipping it if we check).
-- To be 100% safe, we drop it first if it exists.
DROP INDEX IF EXISTS idx_security_authority_identity ON security_authority;
CREATE UNIQUE INDEX idx_security_authority_identity ON security_authority (subject_type, identifier);

-- 3. Backfill ip_address and mac_address from identifier column for existing records
UPDATE security_authority 
SET ip_address = identifier 
WHERE subject_type = 'ip' AND (ip_address IS NULL OR ip_address = '');

UPDATE security_authority 
SET mac_address = identifier 
WHERE subject_type = 'mac' AND (mac_address IS NULL OR mac_address = '');
