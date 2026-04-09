-- Phase 3.3 - Commerce Enrichment from Canonical Events (Supabase / PostgreSQL)
-- Run in Supabase SQL Editor.
-- Idempotent and safe to re-run.

BEGIN;

-- 1) Order/payment/return lookup by external id for upsert paths
CREATE INDEX IF NOT EXISTS idx_orders_tenant_external_order_id
  ON orders(tenant_id, external_order_id);

CREATE INDEX IF NOT EXISTS idx_payments_tenant_external_payment_id
  ON payments(tenant_id, external_payment_id);

CREATE INDEX IF NOT EXISTS idx_returns_tenant_external_return_id
  ON returns(tenant_id, external_return_id);

-- 2) System states hot-paths
CREATE INDEX IF NOT EXISTS idx_system_states_entity_system_fetched
  ON system_states(entity_type, entity_id, system, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_states_tenant_entity
  ON system_states(tenant_id, entity_type, entity_id);

-- 3) Reconciliation triage queries
CREATE INDEX IF NOT EXISTS idx_reconciliation_issues_tenant_entity_status
  ON reconciliation_issues(tenant_id, entity_type, entity_id, status);

CREATE INDEX IF NOT EXISTS idx_reconciliation_issues_case_status
  ON reconciliation_issues(case_id, status, detected_at DESC);

COMMIT;

-- Verification:
-- SELECT COUNT(*) FROM system_states;
-- SELECT status, COUNT(*) FROM reconciliation_issues GROUP BY status ORDER BY status;
