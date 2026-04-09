-- Phase 4.1 - Reconciliation Issue Lifecycle (Supabase / PostgreSQL)
-- Run in Supabase SQL Editor.
-- Idempotent and safe to re-run.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_reconciliation_issues_tenant_status_detected
  ON reconciliation_issues(tenant_id, status, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_reconciliation_issues_tenant_case_status
  ON reconciliation_issues(tenant_id, case_id, status);

CREATE INDEX IF NOT EXISTS idx_reconciliation_issues_tenant_entity_status
  ON reconciliation_issues(tenant_id, entity_type, entity_id, status);

CREATE INDEX IF NOT EXISTS idx_reconciliation_issues_tenant_severity_status
  ON reconciliation_issues(tenant_id, severity, status, detected_at DESC);

COMMIT;

-- Verification:
-- SELECT status, COUNT(*) FROM reconciliation_issues GROUP BY status ORDER BY status;
-- SELECT severity, COUNT(*) FROM reconciliation_issues GROUP BY severity ORDER BY severity;
