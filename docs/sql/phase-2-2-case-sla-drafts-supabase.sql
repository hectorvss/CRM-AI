-- Phase 2.2 - Case SLA + Draft Replies (Supabase / PostgreSQL)
-- Run in Supabase SQL Editor.
-- Idempotent and safe to re-run.

BEGIN;

-- 1) Ensure draft_replies has all needed columns in existing environments
ALTER TABLE IF EXISTS draft_replies
  ADD COLUMN IF NOT EXISTS citations JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS draft_replies
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending_review';

ALTER TABLE IF EXISTS draft_replies
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT;

ALTER TABLE IF EXISTS draft_replies
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- 2) Normalize text SLA status field in cases
ALTER TABLE IF EXISTS cases
  ADD COLUMN IF NOT EXISTS sla_status TEXT NOT NULL DEFAULT 'on_track';

-- 3) Draft status validation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'draft_replies_status_check'
  ) THEN
    ALTER TABLE draft_replies
    ADD CONSTRAINT draft_replies_status_check
    CHECK (status IN ('pending_review', 'approved', 'rejected', 'sent'));
  END IF;
END $$;

-- 4) Performance indexes for draft and SLA-related query paths
CREATE INDEX IF NOT EXISTS idx_draft_replies_case_tenant_generated
  ON draft_replies(case_id, tenant_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_draft_replies_case_tenant_status
  ON draft_replies(case_id, tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_cases_sla_resolution
  ON cases(tenant_id, workspace_id, sla_resolution_deadline, sla_status);

CREATE INDEX IF NOT EXISTS idx_cases_sla_first_response
  ON cases(tenant_id, workspace_id, sla_first_response_deadline, sla_status);

COMMIT;

-- Verification:
-- SELECT status, COUNT(*) FROM draft_replies GROUP BY status ORDER BY status;
-- SELECT sla_status, COUNT(*) FROM cases GROUP BY sla_status ORDER BY sla_status;
