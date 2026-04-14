-- CRM AI Supabase migration
-- Applies the current workspace-scoped schema deltas plus the queue RPC.

BEGIN;

ALTER TABLE public.draft_replies
  ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'ws_default';

ALTER TABLE public.internal_notes
  ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'ws_default';

ALTER TABLE public.reconciliation_issues
  ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'ws_default';

UPDATE public.draft_replies
SET workspace_id = COALESCE(NULLIF(workspace_id, ''), 'ws_default')
WHERE workspace_id IS NULL OR workspace_id = '';

UPDATE public.internal_notes
SET workspace_id = COALESCE(NULLIF(workspace_id, ''), 'ws_default')
WHERE workspace_id IS NULL OR workspace_id = '';

UPDATE public.reconciliation_issues
SET workspace_id = COALESCE(NULLIF(workspace_id, ''), 'ws_default')
WHERE workspace_id IS NULL OR workspace_id = '';

CREATE INDEX IF NOT EXISTS idx_draft_replies_case_workspace
  ON public.draft_replies(case_id, workspace_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_internal_notes_case_workspace
  ON public.internal_notes(case_id, workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reconciliation_issues_case_workspace
  ON public.reconciliation_issues(case_id, workspace_id, status, detected_at DESC);

CREATE OR REPLACE FUNCTION public.claim_next_job()
RETURNS SETOF public.jobs
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.jobs
  SET
    status     = 'running',
    started_at = NOW(),
    attempts   = attempts + 1
  WHERE id = (
    SELECT id
    FROM public.jobs
    WHERE status = 'pending'
      AND run_at <= NOW()
      AND tenant_id IS NOT NULL
      AND workspace_id IS NOT NULL
    ORDER BY priority ASC, run_at ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_next_job() TO service_role;

COMMIT;
