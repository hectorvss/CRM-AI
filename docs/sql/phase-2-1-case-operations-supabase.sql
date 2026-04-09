-- Phase 2.1 - Case Operations (Supabase / PostgreSQL)
-- Run in Supabase SQL Editor.
-- Idempotent and safe to re-run.

BEGIN;

-- 1) Ensure internal notes table exists (for case notes endpoint)
CREATE TABLE IF NOT EXISTS internal_notes (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by TEXT,
  created_by_type TEXT NOT NULL DEFAULT 'human',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id TEXT NOT NULL
);

-- 2) Performance indexes for notes and timeline queries
CREATE INDEX IF NOT EXISTS idx_internal_notes_case_tenant_created
  ON internal_notes(case_id, tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_case_status_history_case_tenant_created
  ON case_status_history(case_id, tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_case_tenant_sent
  ON messages(case_id, tenant_id, sent_at DESC);

COMMIT;

-- Verification:
-- SELECT COUNT(*) FROM internal_notes;
-- \d internal_notes
