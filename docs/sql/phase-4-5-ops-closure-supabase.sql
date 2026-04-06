-- Phase 4.5 - Reconciliation/Policy/Approvals Operational Closure (Supabase / PostgreSQL)
-- Run in Supabase SQL Editor.
-- Idempotent and safe to re-run.

BEGIN;

ALTER TABLE policy_evaluations
  ADD COLUMN IF NOT EXISTS conflict_detected BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE policy_evaluations
  ADD COLUMN IF NOT EXISTS conflicting_rule_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS canonical_field_decisions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  chosen_system TEXT,
  chosen_value TEXT,
  candidates JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT,
  issue_id TEXT REFERENCES reconciliation_issues(id),
  case_id TEXT REFERENCES cases(id),
  decided_by TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policy_evaluations_conflict
  ON policy_evaluations(tenant_id, workspace_id, conflict_detected, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_canonical_field_decisions_issue
  ON canonical_field_decisions(tenant_id, issue_id, decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_canonical_field_decisions_entity
  ON canonical_field_decisions(tenant_id, entity_type, entity_id, field_key, decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_reconciliation_issues_resolution_operational
  ON reconciliation_issues(tenant_id, status, source_of_truth_system, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_approval_requests_delegation_operational
  ON approval_requests(tenant_id, workspace_id, status, assigned_to, expires_at);

COMMIT;

-- Verification:
-- SELECT COUNT(*) FROM canonical_field_decisions;
-- SELECT conflict_detected, COUNT(*) FROM policy_evaluations GROUP BY conflict_detected ORDER BY conflict_detected;
