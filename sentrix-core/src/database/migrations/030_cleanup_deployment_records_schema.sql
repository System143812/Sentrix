-- Migration: 030_cleanup_deployment_records_schema
-- Description: Remove is_processing and operation columns from agent_deployment_records and clean up ENUM status values.

ALTER TABLE agent_deployment_records
  MODIFY COLUMN status ENUM('requested', 'success', 'failed', 'timeout') NOT NULL DEFAULT 'requested';
