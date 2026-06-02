ALTER TABLE blocked_subjects
ADD COLUMN unblocked_at BIGINT NULL,
ADD COLUMN unblocked_by CHAR(36) NULL,
ADD COLUMN unblock_reason TEXT NULL;
