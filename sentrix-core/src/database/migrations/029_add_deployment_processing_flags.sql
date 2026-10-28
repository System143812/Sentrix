ALTER TABLE agent_deployment_records
  ADD COLUMN is_processing TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN operation VARCHAR(32) DEFAULT 'deploy';
