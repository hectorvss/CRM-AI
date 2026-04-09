-- Phase 4.4 - Approval Queue + Expiration Processing (Supabase / PostgreSQL)
-- Run in Supabase SQL Editor.
-- Idempotent and safe to re-run.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_approval_requests_scope_status_expiry
  ON approval_requests(tenant_id, workspace_id, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_approval_requests_assigned_status
  ON approval_requests(tenant_id, workspace_id, assigned_to, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_approval_requests_risk_status
  ON approval_requests(tenant_id, workspace_id, risk_level, status, created_at DESC);

COMMIT;

-- Verification:
-- SELECT status, COUNT(*) FROM approval_requests GROUP BY status ORDER BY status;
