-- Migration: Rename blocked_subjects to security_identities for Zero-Trust terminology

RENAME TABLE blocked_subjects TO security_identities;

ALTER TABLE security_identities
  CHANGE COLUMN blocked_at recorded_at BIGINT NOT NULL,
  CHANGE COLUMN blocked_by added_by CHAR(36) NULL,
  CHANGE COLUMN unblocked_at revoked_at BIGINT NULL,
  CHANGE COLUMN unblocked_by revoked_by CHAR(36) NULL,
  CHANGE COLUMN unblock_reason revoke_reason TEXT NULL;
