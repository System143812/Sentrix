-- Migration: Enrich Process Table
-- Description: Adds columns to support separating Apps from Background processes.

ALTER TABLE client_processes
ADD COLUMN is_foreground TINYINT(1) DEFAULT 0,
ADD COLUMN window_title VARCHAR(512) DEFAULT NULL;

CREATE INDEX idx_processes_foreground ON client_processes (client_id, is_foreground);
