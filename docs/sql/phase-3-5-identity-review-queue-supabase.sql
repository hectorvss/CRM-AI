-- Phase 3.5 - Identity Resolution Low-Confidence Review Queue (Supabase / PostgreSQL)
-- Run in Supabase SQL Editor.
-- Idempotent and safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS identity_resolution_queue (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  source_system TEXT NOT NULL,
  external_id TEXT,
  normalized_email TEXT,
  suggested_customer_id TEXT REFERENCES customers(id),
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.500,
  reason TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  resolved_customer_id TEXT REFERENCES customers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_identity_resolution_queue_scope_status
  ON identity_resolution_queue(tenant_id, workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_identity_resolution_queue_source_email
  ON identity_resolution_queue(tenant_id, workspace_id, source_system, normalized_email);

COMMIT;

-- Verification:
-- SELECT status, COUNT(*) FROM identity_resolution_queue GROUP BY status ORDER BY status;
