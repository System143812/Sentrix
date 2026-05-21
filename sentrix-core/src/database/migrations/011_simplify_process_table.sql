-- Migration: Simplify Process Table
-- Description: Removes columns used for App/Background separation as they are now merged into a single list.

ALTER TABLE client_processes
DROP INDEX idx_processes_foreground,
DROP COLUMN is_foreground,
DROP COLUMN window_title;
