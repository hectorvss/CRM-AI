-- Phase 4.2 - Policy Engine Minimal (Supabase / PostgreSQL)
-- Run in Supabase SQL Editor.
-- Idempotent and safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS policy_evaluations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  action_type TEXT,
  case_id TEXT,
  input_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  evaluated_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  matched_rule_id TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('allow', 'conditional', 'approval_required', 'block')),
  requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policy_rules_tenant_entity_active
  ON policy_rules(tenant_id, entity_type, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_policy_evaluations_scope_time
  ON policy_evaluations(tenant_id, workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_policy_evaluations_decision
  ON policy_evaluations(tenant_id, decision, created_at DESC);

COMMIT;

-- Verification:
-- SELECT decision, COUNT(*) FROM policy_evaluations GROUP BY decision ORDER BY decision;
