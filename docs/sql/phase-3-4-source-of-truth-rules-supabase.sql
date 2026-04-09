-- Phase 3.4 - Source of Truth Rules (Supabase / PostgreSQL)
-- Run in Supabase SQL Editor.
-- Idempotent and safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS source_of_truth_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('order', 'payment', 'refund', 'return')),
  preferred_system TEXT NOT NULL,
  fallback_system TEXT,
  confidence_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.80,
  rule_priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, workspace_id, entity_type)
);

CREATE INDEX IF NOT EXISTS idx_sot_rules_scope_active
  ON source_of_truth_rules(tenant_id, workspace_id, is_active, entity_type);

CREATE INDEX IF NOT EXISTS idx_sot_rules_entity_preferred
  ON source_of_truth_rules(entity_type, preferred_system);

INSERT INTO source_of_truth_rules (
  id, tenant_id, workspace_id, entity_type, preferred_system, fallback_system,
  confidence_threshold, rule_priority, is_active, updated_by
)
SELECT
  gen_random_uuid()::text,
  w.org_id,
  w.id,
  d.entity_type,
  d.preferred_system,
  NULL,
  0.80,
  100,
  TRUE,
  'system_seed'
FROM workspaces w
CROSS JOIN (
  VALUES
    ('order', 'shopify'),
    ('payment', 'stripe'),
    ('refund', 'stripe'),
    ('return', 'shopify')
) AS d(entity_type, preferred_system)
ON CONFLICT (tenant_id, workspace_id, entity_type) DO NOTHING;

COMMIT;

-- Verification:
-- SELECT entity_type, preferred_system, is_active, COUNT(*) FROM source_of_truth_rules
-- GROUP BY entity_type, preferred_system, is_active
-- ORDER BY entity_type, preferred_system;
