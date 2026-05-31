-- Migration 017: Add category to network tables
ALTER TABLE client_network_connections ADD COLUMN category VARCHAR(50) DEFAULT 'App' AFTER domain;
ALTER TABLE client_activity_history ADD COLUMN category VARCHAR(50) DEFAULT 'App' AFTER process_name;
