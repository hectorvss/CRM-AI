-- Phase 3.2 - Identity Resolution + Auto-Case Link (Supabase / PostgreSQL)
-- Run in Supabase SQL Editor.
-- Idempotent and safe to re-run.

BEGIN;

-- 1) Identity resolution fast path
CREATE INDEX IF NOT EXISTS idx_customers_tenant_workspace_email
  ON customers(tenant_id, workspace_id, canonical_email);

CREATE INDEX IF NOT EXISTS idx_linked_identities_system_external
  ON linked_identities(system, external_id);

CREATE INDEX IF NOT EXISTS idx_linked_identities_customer
  ON linked_identities(customer_id);

-- 2) Customer-based recent case lookup
CREATE INDEX IF NOT EXISTS idx_cases_tenant_workspace_customer_status_activity
  ON cases(tenant_id, workspace_id, customer_id, status, last_activity_at DESC);

-- 3) Canonical event follow-up joins
CREATE INDEX IF NOT EXISTS idx_canonical_events_tenant_workspace_case_status
  ON canonical_events(tenant_id, workspace_id, case_id, status);

COMMIT;

-- Verification:
-- SELECT COUNT(*) FROM customers WHERE canonical_email IS NOT NULL;
-- SELECT COUNT(*) FROM linked_identities;
-- SELECT status, COUNT(*) FROM canonical_events GROUP BY status ORDER BY status;
