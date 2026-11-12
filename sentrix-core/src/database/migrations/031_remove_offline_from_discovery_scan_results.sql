-- Migration: 031_remove_offline_from_discovery_scan_results
-- Description: Ensure discovery_scan_results agent_status ENUM excludes 'offline' and only contains ('running', 'none', 'deploying', 'updating').

ALTER TABLE discovery_scan_results
  MODIFY COLUMN agent_status ENUM('running', 'none', 'deploying', 'updating') NOT NULL DEFAULT 'none';
