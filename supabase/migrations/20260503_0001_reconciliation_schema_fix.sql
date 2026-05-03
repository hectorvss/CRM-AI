-- Migration: 20260503_0001_reconciliation_schema_fix
-- Purpose: align reconciliation_issues with code that reads `summary` and `issue_type`
-- These columns are referenced in server/data/cases.ts and server/data/reconciliation.ts
-- but were never created. Without them, queries return undefined and reconciliation UI
-- shows blanks.

ALTER TABLE reconciliation_issues
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS issue_type TEXT;

-- Backfill issue_type from existing conflict_domain when null (best-effort)
UPDATE reconciliation_issues
SET issue_type = conflict_domain
WHERE issue_type IS NULL AND conflict_domain IS NOT NULL;

-- Add index for filtering by type
CREATE INDEX IF NOT EXISTS idx_reconciliation_issues_issue_type
  ON reconciliation_issues (tenant_id, workspace_id, issue_type, status);

COMMENT ON COLUMN reconciliation_issues.summary IS 'Human-readable summary of the conflict; populated by the reconciler when detected';
COMMENT ON COLUMN reconciliation_issues.issue_type IS 'Categorical label (refund_mismatch, status_drift, etc.); used by UI for grouping';
