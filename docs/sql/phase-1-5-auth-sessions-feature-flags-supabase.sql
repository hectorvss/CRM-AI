-- Phase 1.5 - Auth Sessions + Workspace Feature Flags (Supabase / PostgreSQL)
-- Run in Supabase SQL Editor.
-- Idempotent and safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_scope_active
  ON user_sessions(tenant_id, workspace_id, user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS workspace_feature_flags (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  feature_key TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NOT NULL DEFAULT 'workspace_override',
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, workspace_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_workspace_feature_flags_scope
  ON workspace_feature_flags(tenant_id, workspace_id, feature_key);

COMMIT;

-- Verification:
-- SELECT COUNT(*) FROM user_sessions;
-- SELECT COUNT(*) FROM workspace_feature_flags;
