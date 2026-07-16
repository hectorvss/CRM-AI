-- ─────────────────────────────────────────────────────────────────────────────
-- Fin AI Agent — F4: Procedures + Data Connectors (spec §5, §5.1)
--  fin_procedures        NL documents with deterministic blocks; draft→live
--  fin_procedure_runs    resumable per-conversation executions (non-linear)
--  fin_connectors        internal (tool-registry) or HTTP systems; encrypted auth
--  fin_connector_actions typed actions with per-action policy
--  fin_pending_actions   write_approval queue decided from the inbox
-- All idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fin_procedures (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id        TEXT NOT NULL,
  workspace_id     TEXT NOT NULL,
  name             TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  trigger_criteria TEXT NOT NULL DEFAULT '',
  steps            JSONB NOT NULL DEFAULT '[]',
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'archived')),
  version          INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_procedures_scope ON fin_procedures (tenant_id, workspace_id, status);

CREATE TABLE IF NOT EXISTS fin_procedure_runs (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       TEXT NOT NULL,
  workspace_id    TEXT NOT NULL,
  procedure_id    TEXT NOT NULL,
  case_id         TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'waiting_customer', 'waiting_approval', 'waiting_webhook',
    'completed', 'failed', 'cancelled'
  )),
  current_step    INTEGER NOT NULL DEFAULT 0,
  state           JSONB NOT NULL DEFAULT '{}',   -- collected variables, identity, otp hash
  log             JSONB NOT NULL DEFAULT '[]',   -- executed-step trail (answer inspection)
  outcome         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_runs_conversation ON fin_procedure_runs (conversation_id, status);
CREATE INDEX IF NOT EXISTS idx_fin_runs_scope ON fin_procedure_runs (tenant_id, workspace_id, status);

CREATE TABLE IF NOT EXISTS fin_connectors (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id    TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('internal', 'http')),
  base_url     TEXT,
  -- AES-256-GCM ciphertext (FIN_CONNECTOR_SECRET); never exposed via API reads.
  auth_encrypted TEXT,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_connectors_scope ON fin_connectors (tenant_id, workspace_id);

CREATE TABLE IF NOT EXISTS fin_connector_actions (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  connector_id      TEXT NOT NULL REFERENCES fin_connectors(id) ON DELETE CASCADE,
  tenant_id         TEXT NOT NULL,
  workspace_id      TEXT NOT NULL,
  name              TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  -- internal kind → registry tool; http kind → method+path template
  tool_name         TEXT,
  http_method       TEXT CHECK (http_method IS NULL OR http_method IN ('GET','POST','PUT','PATCH','DELETE')),
  http_path         TEXT,
  input_schema      JSONB NOT NULL DEFAULT '{}',
  policy            TEXT NOT NULL DEFAULT 'read' CHECK (policy IN ('read', 'write_auto', 'write_approval', 'blocked')),
  requires_identity BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_actions_connector ON fin_connector_actions (connector_id);
CREATE INDEX IF NOT EXISTS idx_fin_actions_scope ON fin_connector_actions (tenant_id, workspace_id);

CREATE TABLE IF NOT EXISTS fin_pending_actions (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id    TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  run_id       TEXT NOT NULL,
  case_id      TEXT NOT NULL,
  action_id    TEXT NOT NULL,
  args         JSONB NOT NULL DEFAULT '{}',
  preview      TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'rejected', 'executed', 'failed', 'expired'
  )),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at   TIMESTAMPTZ,
  decided_by   TEXT,
  executed_at  TIMESTAMPTZ,
  result       JSONB
);
CREATE INDEX IF NOT EXISTS idx_fin_pending_scope ON fin_pending_actions (tenant_id, workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_fin_pending_case ON fin_pending_actions (case_id);
