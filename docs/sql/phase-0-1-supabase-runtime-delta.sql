-- Phase 0.1 - Runtime delta for Supabase / PostgreSQL
-- Use this when you already executed the older phased scripts
-- and want to catch up to the CURRENT runtime schema.
-- Safe to re-run.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- CUSTOMERS / IDENTITIES
-- ============================================================

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE linked_identities
  ADD COLUMN IF NOT EXISTS tenant_id TEXT;

ALTER TABLE linked_identities
  ADD COLUMN IF NOT EXISTS workspace_id TEXT;

ALTER TABLE linked_identities
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- ============================================================
-- CONVERSATIONS / MESSAGES / DRAFTS
-- ============================================================

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS subject TEXT;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS first_message_at TIMESTAMPTZ;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS customer_id TEXT;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'inbound';

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'text';

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS external_message_id TEXT;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS draft_reply_id TEXT;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE draft_replies
  ADD COLUMN IF NOT EXISTS tone TEXT DEFAULT 'professional';

ALTER TABLE draft_replies
  ADD COLUMN IF NOT EXISTS confidence NUMERIC DEFAULT 0.5;

ALTER TABLE draft_replies
  ADD COLUMN IF NOT EXISTS has_policies BOOLEAN DEFAULT FALSE;

ALTER TABLE draft_replies
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

ALTER TABLE draft_replies
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS case_knowledge_links (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  article_id TEXT NOT NULL REFERENCES knowledge_articles(id),
  tenant_id TEXT NOT NULL,
  relevance_score NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(case_id, article_id)
);

-- ============================================================
-- ORDERS / PAYMENTS / RETURNS
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS fulfillment_status TEXT;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tracking_number TEXT;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tracking_url TEXT;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_address TEXT;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS has_conflict BOOLEAN DEFAULT FALSE;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS workspace_id TEXT NOT NULL DEFAULT 'ws_default';

CREATE INDEX IF NOT EXISTS idx_payments_tenant_workspace
  ON payments(tenant_id, workspace_id);

ALTER TABLE returns
  ADD COLUMN IF NOT EXISTS has_conflict BOOLEAN DEFAULT FALSE;

-- ============================================================
-- POLICY / RECONCILIATION / APPROVALS
-- ============================================================

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

CREATE INDEX IF NOT EXISTS idx_policy_rules_tenant_entity_active
  ON policy_rules(tenant_id, entity_type, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_policy_evaluations_scope_time
  ON policy_evaluations(tenant_id, workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_policy_evaluations_conflict
  ON policy_evaluations(tenant_id, workspace_id, conflict_detected, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_canonical_field_decisions_issue
  ON canonical_field_decisions(tenant_id, issue_id, decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_canonical_field_decisions_entity
  ON canonical_field_decisions(tenant_id, entity_type, entity_id, field_key, decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_reconciliation_issues_resolution_operational
  ON reconciliation_issues(tenant_id, status, source_of_truth_system, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_approval_requests_tenant_policy_status
  ON approval_requests(tenant_id, policy_rule_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_approval_requests_case_status
  ON approval_requests(case_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_approval_requests_delegation_operational
  ON approval_requests(tenant_id, workspace_id, status, assigned_to, expires_at);

CREATE INDEX IF NOT EXISTS idx_cases_active_approval
  ON cases(tenant_id, workspace_id, active_approval_request_id);

-- ============================================================
-- EVENTS / INGEST
-- ============================================================

ALTER TABLE canonical_events
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_dedupe_key
  ON webhook_events(dedupe_key);

CREATE UNIQUE INDEX IF NOT EXISTS idx_canonical_events_dedupe_key
  ON canonical_events(dedupe_key);

CREATE INDEX IF NOT EXISTS idx_canonical_events_tenant_workspace_occurred
  ON canonical_events(tenant_id, workspace_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_canonical_events_tenant_status_occurred
  ON canonical_events(tenant_id, status, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_canonical_events_case_id_occurred
  ON canonical_events(case_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_canonical_events_source_entity
  ON canonical_events(source_system, source_entity_type, source_entity_id);

CREATE INDEX IF NOT EXISTS idx_webhook_events_connector_received
  ON webhook_events(connector_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_events_tenant_status_received
  ON webhook_events(tenant_id, status, received_at DESC);

-- ============================================================
-- AI RUNTIME
-- ============================================================

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS workspace_id TEXT NOT NULL DEFAULT 'ws_default';

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS trigger_event TEXT DEFAULT 'case_created';

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'running';

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS summary TEXT;

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS output JSONB;

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS error_message TEXT;

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_agent_runs_tenant_workspace
  ON agent_runs(tenant_id, workspace_id);

-- ============================================================
-- OPERATIONAL INDEXES & UPDATED_AT TRIGGERS
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_internal_notes_case_tenant_created
  ON internal_notes(case_id, tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_case_status_history_case_tenant_created
  ON case_status_history(case_id, tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_case_tenant_sent
  ON messages(case_id, tenant_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_feature_flags_scope
  ON workspace_feature_flags(tenant_id, workspace_id, feature_key);

CREATE INDEX IF NOT EXISTS idx_identity_resolution_queue_scope_status
  ON identity_resolution_queue(tenant_id, workspace_id, status, created_at DESC);

DROP TRIGGER IF EXISTS trg_workspaces_updated_at ON workspaces;
CREATE TRIGGER trg_workspaces_updated_at
BEFORE UPDATE ON workspaces
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers;
CREATE TRIGGER trg_customers_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_cases_updated_at ON cases;
CREATE TRIGGER trg_cases_updated_at
BEFORE UPDATE ON cases
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_conversations_updated_at ON conversations;
CREATE TRIGGER trg_conversations_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_draft_replies_updated_at ON draft_replies;
CREATE TRIGGER trg_draft_replies_updated_at
BEFORE UPDATE ON draft_replies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_refunds_updated_at ON refunds;
CREATE TRIGGER trg_refunds_updated_at
BEFORE UPDATE ON refunds
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_returns_updated_at ON returns;
CREATE TRIGGER trg_returns_updated_at
BEFORE UPDATE ON returns
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_source_of_truth_rules_updated_at ON source_of_truth_rules;
CREATE TRIGGER trg_source_of_truth_rules_updated_at
BEFORE UPDATE ON source_of_truth_rules
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_approval_requests_updated_at ON approval_requests;
CREATE TRIGGER trg_approval_requests_updated_at
BEFORE UPDATE ON approval_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_workflow_definitions_updated_at ON workflow_definitions;
CREATE TRIGGER trg_workflow_definitions_updated_at
BEFORE UPDATE ON workflow_definitions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_knowledge_articles_updated_at ON knowledge_articles;
CREATE TRIGGER trg_knowledge_articles_updated_at
BEFORE UPDATE ON knowledge_articles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_connectors_updated_at ON connectors;
CREATE TRIGGER trg_connectors_updated_at
BEFORE UPDATE ON connectors
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_canonical_events_updated_at ON canonical_events;
CREATE TRIGGER trg_canonical_events_updated_at
BEFORE UPDATE ON canonical_events
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_agents_updated_at ON agents;
CREATE TRIGGER trg_agents_updated_at
BEFORE UPDATE ON agents
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
