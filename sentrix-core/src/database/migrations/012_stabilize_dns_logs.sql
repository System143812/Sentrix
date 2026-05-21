-- Migration: Stabilize DNS logs
-- Description: Deduplicate DNS cache rows so current DNS snapshots can be refreshed without creating log churn.

DELETE FROM client_dns_logs WHERE id NOT IN (
    SELECT id FROM (
        SELECT MIN(id) AS id
        FROM client_dns_logs
        GROUP BY client_id, domain, resolved_address
    ) AS tmp
);

ALTER TABLE client_dns_logs
ADD UNIQUE INDEX idx_dns_log_identity (client_id, domain, resolved_address);
