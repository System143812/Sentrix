-- Migration: Enrich DNS Intelligence
-- Description: Adds fields for ASN, Organization, Service Classification, and Verification status.

ALTER TABLE dns_intelligence
ADD COLUMN asn VARCHAR(20) AFTER hostname,
ADD COLUMN organization VARCHAR(255) AFTER asn,
ADD COLUMN service_label VARCHAR(255) AFTER organization,
ADD COLUMN forward_verified TINYINT(1) DEFAULT 0 AFTER service_label,
ADD COLUMN is_cloud TINYINT(1) DEFAULT 0 AFTER forward_verified;

CREATE INDEX idx_dns_intel_service ON dns_intelligence (service_label);
CREATE INDEX idx_dns_intel_org ON dns_intelligence (organization);
