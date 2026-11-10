-- Migration: 016_fix_discovery_agent_status_enum
-- Description: Restrict discovery_scan_results agent_status ENUM strictly to running, none, deploying, and updating.

ALTER TABLE discovery_scan_results
  MODIFY COLUMN agent_status ENUM('running', 'none', 'deploying', 'updating') NOT NULL DEFAULT 'none';
