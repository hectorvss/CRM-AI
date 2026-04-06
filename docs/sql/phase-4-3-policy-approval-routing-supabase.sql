-- Phase 4.3 - Policy-Driven Approval Routing (Supabase / PostgreSQL)
-- Run in Supabase SQL Editor.
-- Idempotent and safe to re-run.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_approval_requests_tenant_policy_status
  ON approval_requests(tenant_id, policy_rule_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_approval_requests_case_status
  ON approval_requests(case_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cases_active_approval
  ON cases(tenant_id, workspace_id, active_approval_request_id);

COMMIT;

-- Verification:
-- SELECT status, COUNT(*) FROM approval_requests GROUP BY status ORDER BY status;
