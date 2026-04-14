-- Phase 0.0 - Full baseline schema for Supabase / PostgreSQL
-- Use this for a NEW Supabase project.
-- This script consolidates the current runtime schema from:
--   - server/db/schema.sql
--   - server/db/migrate.ts
-- Idempotent where possible and safe to re-run for structure bootstrap.

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
-- IDENTITY & GOVERNANCE
-- ============================================================

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  plan_id TEXT NOT NULL DEFAULT 'starter',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'agent',
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  tenant_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  role_id TEXT NOT NULL,
  seat_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  tenant_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS seats (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  member_id TEXT REFERENCES members(id),
  seat_type TEXT NOT NULL DEFAULT 'full',
  assigned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  seats_included INTEGER NOT NULL DEFAULT 1,
  seats_used INTEGER NOT NULL DEFAULT 1,
  credits_included INTEGER NOT NULL DEFAULT 0,
  credits_used INTEGER NOT NULL DEFAULT 0,
  external_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  interval TEXT NOT NULL DEFAULT 'month',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  entry_type TEXT NOT NULL DEFAULT 'debit',
  amount NUMERIC NOT NULL,
  reason TEXT NOT NULL,
  reference_id TEXT,
  balance_after NUMERIC NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1.0,
  unit TEXT NOT NULL,
  reference_id TEXT,
  reference_type TEXT,
  billing_period TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feature_gates (
  id TEXT PRIMARY KEY,
  feature_key TEXT NOT NULL,
  plan_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  workspace_overrides JSONB NOT NULL DEFAULT '[]'::jsonb
);

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

-- ============================================================
-- CUSTOMERS
-- ============================================================

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT 'ws_default',
  canonical_email TEXT,
  email TEXT,
  phone TEXT,
  canonical_name TEXT,
  segment TEXT NOT NULL DEFAULT 'regular',
  risk_level TEXT NOT NULL DEFAULT 'low',
  lifetime_value NUMERIC,
  currency TEXT DEFAULT 'USD',
  preferred_channel TEXT,
  dispute_rate NUMERIC DEFAULT 0,
  refund_rate NUMERIC DEFAULT 0,
  chargeback_count INTEGER DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  total_spent NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS linked_identities (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  tenant_id TEXT,
  workspace_id TEXT,
  system TEXT NOT NULL,
  external_id TEXT NOT NULL,
  confidence NUMERIC DEFAULT 1.0,
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(system, external_id)
);

CREATE TABLE IF NOT EXISTS identity_resolution_queue (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  source_system TEXT NOT NULL,
  external_id TEXT,
  normalized_email TEXT,
  suggested_customer_id TEXT,
  confidence NUMERIC NOT NULL DEFAULT 0.5,
  reason TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  resolved_customer_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_identity_resolution_queue_scope_status
  ON identity_resolution_queue(tenant_id, workspace_id, status, created_at DESC);

-- ============================================================
-- CASES
-- ============================================================

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  case_number TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  source_system TEXT NOT NULL DEFAULT 'email',
  source_channel TEXT NOT NULL DEFAULT 'email',
  source_entity_id TEXT,
  type TEXT NOT NULL DEFAULT 'general_support',
  sub_type TEXT,
  intent TEXT,
  intent_confidence NUMERIC,
  status TEXT NOT NULL DEFAULT 'new',
  priority TEXT NOT NULL DEFAULT 'normal',
  severity TEXT NOT NULL DEFAULT 'S3',
  risk_level TEXT NOT NULL DEFAULT 'low',
  risk_score NUMERIC DEFAULT 0,
  fraud_flag BOOLEAN DEFAULT FALSE,
  assigned_user_id TEXT REFERENCES users(id),
  assigned_team_id TEXT REFERENCES teams(id),
  created_by_user_id TEXT REFERENCES users(id),
  sla_policy_id TEXT,
  sla_first_response_deadline TIMESTAMPTZ,
  sla_resolution_deadline TIMESTAMPTZ,
  sla_status TEXT DEFAULT 'on_track',
  customer_id TEXT REFERENCES customers(id),
  order_ids JSONB DEFAULT '[]'::jsonb,
  payment_ids JSONB DEFAULT '[]'::jsonb,
  return_ids JSONB DEFAULT '[]'::jsonb,
  conversation_id TEXT,
  ai_diagnosis TEXT,
  ai_root_cause TEXT,
  ai_confidence NUMERIC,
  ai_recommended_action TEXT,
  ai_evidence_refs JSONB DEFAULT '[]'::jsonb,
  approval_state TEXT DEFAULT 'not_required',
  active_approval_request_id TEXT,
  execution_state TEXT DEFAULT 'idle',
  active_execution_plan_id TEXT,
  resolution_state TEXT DEFAULT 'unresolved',
  resolved_by TEXT,
  resolution_notes TEXT,
  resolution_at TIMESTAMPTZ,
  has_reconciliation_conflicts BOOLEAN DEFAULT FALSE,
  conflict_severity TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_response_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cases_tenant_status ON cases(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cases_tenant_customer ON cases(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_cases_assigned ON cases(assigned_user_id, status);

CREATE TABLE IF NOT EXISTS case_status_history (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by TEXT,
  changed_by_type TEXT DEFAULT 'human',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS case_tags (
  case_id TEXT NOT NULL REFERENCES cases(id),
  tag TEXT NOT NULL,
  PRIMARY KEY (case_id, tag)
);

CREATE TABLE IF NOT EXISTS case_links (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  linked_case_id TEXT NOT NULL REFERENCES cases(id),
  link_type TEXT NOT NULL DEFAULT 'related',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id TEXT NOT NULL
);

-- ============================================================
-- CONVERSATIONS & MESSAGES
-- ============================================================

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES cases(id),
  customer_id TEXT REFERENCES customers(id),
  channel TEXT NOT NULL DEFAULT 'email',
  status TEXT NOT NULL DEFAULT 'open',
  subject TEXT,
  external_thread_id TEXT,
  first_message_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT 'ws_default'
);

CREATE TABLE IF NOT EXISTS draft_replies (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  content TEXT NOT NULL,
  generated_by TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tone TEXT DEFAULT 'professional',
  confidence NUMERIC DEFAULT 0.5,
  has_policies BOOLEAN DEFAULT FALSE,
  citations JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending_review',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  case_id TEXT REFERENCES cases(id),
  customer_id TEXT REFERENCES customers(id),
  type TEXT NOT NULL DEFAULT 'customer',
  direction TEXT NOT NULL DEFAULT 'inbound',
  sender_id TEXT,
  sender_name TEXT,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text',
  channel TEXT NOT NULL DEFAULT 'email',
  external_message_id TEXT,
  draft_reply_id TEXT REFERENCES draft_replies(id),
  sentiment TEXT,
  sentiment_score NUMERIC,
  attachments JSONB DEFAULT '[]'::jsonb,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  tenant_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_messages_case ON messages(case_id, sent_at);

CREATE TABLE IF NOT EXISTS internal_notes (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  content TEXT NOT NULL,
  created_by TEXT,
  created_by_type TEXT DEFAULT 'human',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id TEXT NOT NULL
);

-- ============================================================
-- COMMERCE
-- ============================================================

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  external_order_id TEXT NOT NULL,
  customer_id TEXT REFERENCES customers(id),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  fulfillment_status TEXT,
  tracking_number TEXT,
  tracking_url TEXT,
  shipping_address TEXT,
  system_states JSONB NOT NULL DEFAULT '{"canonical":"pending"}'::jsonb,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  country TEXT,
  brand TEXT,
  channel TEXT,
  order_date DATE,
  has_conflict BOOLEAN DEFAULT FALSE,
  conflict_domain TEXT,
  conflict_detected TEXT,
  recommended_action TEXT,
  risk_level TEXT DEFAULT 'low',
  order_type TEXT DEFAULT 'standard',
  approval_status TEXT DEFAULT 'not_required',
  summary TEXT,
  last_sync_at TIMESTAMPTZ,
  last_update TEXT,
  badges JSONB DEFAULT '[]'::jsonb,
  tab TEXT DEFAULT 'all',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  system TEXT,
  time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  external_payment_id TEXT,
  order_id TEXT REFERENCES orders(id),
  customer_id TEXT REFERENCES customers(id),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT 'ws_default',
  amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_method TEXT,
  psp TEXT DEFAULT 'stripe',
  status TEXT NOT NULL DEFAULT 'pending',
  system_states JSONB NOT NULL DEFAULT '{"canonical":"pending"}'::jsonb,
  dispute_id TEXT,
  refund_ids JSONB DEFAULT '[]'::jsonb,
  risk_level TEXT DEFAULT 'low',
  payment_type TEXT DEFAULT 'standard',
  approval_status TEXT DEFAULT 'not_required',
  summary TEXT,
  has_conflict BOOLEAN DEFAULT FALSE,
  conflict_detected TEXT,
  recommended_action TEXT,
  badges JSONB DEFAULT '[]'::jsonb,
  tab TEXT DEFAULT 'all',
  refund_amount NUMERIC,
  refund_type TEXT,
  dispute_reference TEXT,
  chargeback_amount NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_update TEXT
);

CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  external_refund_id TEXT,
  payment_id TEXT REFERENCES payments(id),
  order_id TEXT REFERENCES orders(id),
  customer_id TEXT REFERENCES customers(id),
  tenant_id TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  type TEXT DEFAULT 'full',
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  initiated_by TEXT,
  initiated_by_type TEXT DEFAULT 'human',
  approval_request_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS returns (
  id TEXT PRIMARY KEY,
  external_return_id TEXT,
  order_id TEXT REFERENCES orders(id),
  customer_id TEXT REFERENCES customers(id),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  type TEXT DEFAULT 'return',
  return_reason TEXT,
  return_value NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending_review',
  inspection_status TEXT,
  refund_status TEXT,
  carrier_status TEXT,
  has_conflict BOOLEAN DEFAULT FALSE,
  approval_status TEXT DEFAULT 'not_required',
  risk_level TEXT DEFAULT 'low',
  linked_refund_id TEXT,
  linked_shipment_id TEXT,
  system_states JSONB NOT NULL DEFAULT '{"canonical":"pending_review"}'::jsonb,
  conflict_detected TEXT,
  recommended_action TEXT,
  summary TEXT,
  badges JSONB DEFAULT '[]'::jsonb,
  tab TEXT DEFAULT 'all',
  method TEXT,
  received_at_warehouse TIMESTAMPTZ,
  brand TEXT,
  country TEXT,
  currency TEXT DEFAULT 'USD',
  last_update TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS return_events (
  id TEXT PRIMARY KEY,
  return_id TEXT NOT NULL REFERENCES returns(id),
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  system TEXT,
  time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id TEXT NOT NULL
);

-- ============================================================
-- RECONCILIATION
-- ============================================================

CREATE TABLE IF NOT EXISTS reconciliation_issues (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES cases(id),
  tenant_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  conflict_domain TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  conflicting_systems JSONB DEFAULT '[]'::jsonb,
  expected_state TEXT,
  actual_states JSONB DEFAULT '{}'::jsonb,
  source_of_truth_system TEXT,
  resolution_plan TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  detected_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_issues_tenant_status_detected
  ON reconciliation_issues(tenant_id, status, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_reconciliation_issues_tenant_case_status
  ON reconciliation_issues(tenant_id, case_id, status);

CREATE INDEX IF NOT EXISTS idx_reconciliation_issues_tenant_entity_status
  ON reconciliation_issues(tenant_id, entity_type, entity_id, status);

CREATE TABLE IF NOT EXISTS system_states (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  system TEXT NOT NULL,
  state_key TEXT NOT NULL,
  state_value TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_stale BOOLEAN DEFAULT FALSE,
  tenant_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_of_truth_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  preferred_system TEXT NOT NULL,
  fallback_system TEXT,
  confidence_threshold NUMERIC DEFAULT 0.8,
  rule_priority INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT TRUE,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_source_of_truth_rules_scope_entity
  ON source_of_truth_rules(tenant_id, workspace_id, entity_type);

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

CREATE INDEX IF NOT EXISTS idx_canonical_field_decisions_issue
  ON canonical_field_decisions(tenant_id, issue_id, decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_canonical_field_decisions_entity
  ON canonical_field_decisions(tenant_id, entity_type, entity_id, field_key, decided_at DESC);

-- ============================================================
-- APPROVALS & EXECUTION
-- ============================================================

CREATE TABLE IF NOT EXISTS approval_policies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  trigger_conditions JSONB DEFAULT '[]'::jsonb,
  required_approver_role TEXT,
  required_approver_user_id TEXT,
  expires_after_hours INTEGER DEFAULT 24,
  allow_delegation BOOLEAN DEFAULT TRUE,
  allow_bulk BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_by TEXT,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  requested_by_type TEXT DEFAULT 'agent',
  action_type TEXT NOT NULL,
  action_payload JSONB DEFAULT '{}'::jsonb,
  risk_level TEXT NOT NULL DEFAULT 'medium',
  policy_rule_id TEXT,
  evidence_package JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  assigned_to TEXT,
  assigned_team_id TEXT,
  decision_by TEXT,
  decision_at TIMESTAMPTZ,
  decision_note TEXT,
  expires_at TIMESTAMPTZ,
  execution_plan_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approvals_status ON approval_requests(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_requests_tenant_policy_status
  ON approval_requests(tenant_id, policy_rule_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_requests_case_status
  ON approval_requests(case_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_requests_delegation_operational
  ON approval_requests(tenant_id, workspace_id, status, assigned_to, expires_at);

CREATE TABLE IF NOT EXISTS execution_plans (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  tenant_id TEXT NOT NULL,
  generated_by TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'draft',
  steps JSONB DEFAULT '[]'::jsonb,
  dry_run_result JSONB,
  approval_request_id TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tool_action_attempts (
  id TEXT PRIMARY KEY,
  execution_plan_id TEXT REFERENCES execution_plans(id),
  step_id TEXT,
  tenant_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  action TEXT NOT NULL,
  params JSONB DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  request_payload JSONB,
  response_payload JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_ms INTEGER
);

-- ============================================================
-- WORKFLOWS
-- ============================================================

CREATE TABLE IF NOT EXISTS workflow_definitions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  current_version_id TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_versions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflow_definitions(id),
  version_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  nodes JSONB DEFAULT '[]'::jsonb,
  edges JSONB DEFAULT '[]'::jsonb,
  trigger JSONB DEFAULT '{}'::jsonb,
  published_by TEXT,
  published_at TIMESTAMPTZ,
  tenant_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_version_id TEXT NOT NULL REFERENCES workflow_versions(id),
  case_id TEXT REFERENCES cases(id),
  tenant_id TEXT NOT NULL,
  trigger_type TEXT DEFAULT 'manual',
  trigger_payload JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'running',
  current_node_id TEXT,
  context JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  error TEXT
);

CREATE TABLE IF NOT EXISTS workflow_run_steps (
  id TEXT PRIMARY KEY,
  workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id),
  node_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  input JSONB DEFAULT '{}'::jsonb,
  output JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  error TEXT
);

-- ============================================================
-- KNOWLEDGE & POLICY
-- ============================================================

CREATE TABLE IF NOT EXISTS knowledge_domains (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_articles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  domain_id TEXT REFERENCES knowledge_domains(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_structured JSONB,
  type TEXT NOT NULL DEFAULT 'article',
  status TEXT NOT NULL DEFAULT 'published',
  owner_user_id TEXT REFERENCES users(id),
  review_cycle_days INTEGER DEFAULT 90,
  last_reviewed_at TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ,
  version INTEGER DEFAULT 1,
  citation_count INTEGER DEFAULT 0,
  last_cited_at TIMESTAMPTZ,
  outdated_flag BOOLEAN DEFAULT FALSE,
  linked_workflow_ids JSONB DEFAULT '[]'::jsonb,
  linked_approval_policy_ids JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS policy_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  knowledge_article_id TEXT REFERENCES knowledge_articles(id),
  name TEXT NOT NULL,
  description TEXT,
  entity_type TEXT NOT NULL,
  conditions JSONB DEFAULT '[]'::jsonb,
  action_mapping JSONB DEFAULT '{}'::jsonb,
  approval_mapping JSONB,
  escalation_mapping JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS policy_evaluations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  action_type TEXT,
  case_id TEXT,
  input_context JSONB DEFAULT '{}'::jsonb,
  evaluated_rules JSONB DEFAULT '[]'::jsonb,
  matched_rule_id TEXT,
  decision TEXT NOT NULL,
  requires_approval BOOLEAN DEFAULT FALSE,
  conflict_detected BOOLEAN DEFAULT FALSE,
  conflicting_rule_ids JSONB DEFAULT '[]'::jsonb,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policy_rules_tenant_entity_active
  ON policy_rules(tenant_id, entity_type, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_policy_evaluations_scope_time
  ON policy_evaluations(tenant_id, workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_policy_evaluations_conflict
  ON policy_evaluations(tenant_id, workspace_id, conflict_detected, created_at DESC);

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
-- INTEGRATIONS & EVENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS connectors (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  system TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected',
  auth_type TEXT NOT NULL DEFAULT 'api_key',
  auth_config JSONB DEFAULT '{}'::jsonb,
  last_health_check_at TIMESTAMPTZ,
  capabilities JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS connector_capabilities (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL REFERENCES connectors(id),
  capability_key TEXT NOT NULL,
  direction TEXT DEFAULT 'read',
  is_enabled BOOLEAN DEFAULT TRUE,
  requires_approval BOOLEAN DEFAULT FALSE,
  is_idempotent BOOLEAN DEFAULT TRUE,
  rate_limit_per_minute INTEGER,
  UNIQUE(connector_id, capability_key)
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  connector_id TEXT REFERENCES connectors(id),
  tenant_id TEXT NOT NULL,
  source_system TEXT NOT NULL,
  event_type TEXT NOT NULL,
  raw_payload JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'received',
  canonical_event_id TEXT,
  dedupe_key TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS canonical_events (
  id TEXT PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT 'ws_default',
  source_system TEXT NOT NULL,
  source_entity_type TEXT NOT NULL DEFAULT 'unknown',
  source_entity_id TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL,
  event_category TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  canonical_entity_type TEXT,
  canonical_entity_id TEXT,
  correlation_id TEXT,
  case_id TEXT REFERENCES cases(id),
  normalized_payload JSONB DEFAULT '{}'::jsonb,
  confidence NUMERIC DEFAULT 1.0,
  mapping_version TEXT DEFAULT '1.0',
  status TEXT NOT NULL DEFAULT 'received',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'specialist',
  description TEXT,
  is_system BOOLEAN DEFAULT FALSE,
  is_locked BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  current_version_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_versions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  version_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'published',
  permission_profile JSONB DEFAULT '{}'::jsonb,
  reasoning_profile JSONB DEFAULT '{}'::jsonb,
  safety_profile JSONB DEFAULT '{}'::jsonb,
  knowledge_profile JSONB DEFAULT '{}'::jsonb,
  capabilities JSONB DEFAULT '{}'::jsonb,
  rollout_percentage INTEGER DEFAULT 100,
  published_by TEXT,
  published_at TIMESTAMPTZ,
  changelog TEXT,
  tenant_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES cases(id),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT 'ws_default',
  agent_id TEXT NOT NULL REFERENCES agents(id),
  agent_version_id TEXT REFERENCES agent_versions(id),
  trigger_event TEXT DEFAULT 'case_created',
  trigger_type TEXT DEFAULT 'case_event',
  status TEXT NOT NULL DEFAULT 'running',
  outcome_status TEXT NOT NULL DEFAULT 'completed',
  confidence NUMERIC,
  summary TEXT,
  output JSONB,
  evidence_refs JSONB DEFAULT '[]'::jsonb,
  execution_decision TEXT DEFAULT 'proceed',
  tokens_used INTEGER DEFAULT 0,
  cost_credits NUMERIC DEFAULT 0,
  error TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_tenant_workspace
  ON agent_runs(tenant_id, workspace_id);

-- ============================================================
-- AUDIT & ASYNC
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  actor_id TEXT,
  actor_type TEXT DEFAULT 'human',
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  old_value TEXT,
  new_value TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity
  ON audit_events(entity_type, entity_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_tenant
  ON audit_events(tenant_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 10,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id TEXT,
  workspace_id TEXT,
  trace_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_queue
  ON jobs(status, run_at, priority);

CREATE INDEX IF NOT EXISTS idx_jobs_tenant
  ON jobs(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_trace
  ON jobs(trace_id);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id BIGSERIAL PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AUXILIARY IAM NORMALIZATION TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS permissions (
  key TEXT PRIMARY KEY,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_key ON role_permissions(permission_key);

CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_in_team TEXT NOT NULL DEFAULT 'member',
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_workspace ON team_members(workspace_id, team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_tenant ON team_members(tenant_id, user_id);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

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

-- ============================================================
-- OPERATIONAL INDEXES & PERMISSIONS CATALOG
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_internal_notes_case_tenant_created
  ON internal_notes(case_id, tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_case_status_history_case_tenant_created
  ON case_status_history(case_id, tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_case_tenant_sent
  ON messages(case_id, tenant_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_reconciliation_issues_resolution_operational
  ON reconciliation_issues(tenant_id, status, source_of_truth_system, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_cases_active_approval
  ON cases(tenant_id, workspace_id, active_approval_request_id);

INSERT INTO permissions (key, module, action, description) VALUES
('cases.read', 'cases', 'read', 'Read case lists and case details'),
('cases.write', 'cases', 'write', 'Update case status and case fields'),
('cases.assign', 'cases', 'assign', 'Assign/reassign cases'),
('approvals.read', 'approvals', 'read', 'Read approvals queue and details'),
('approvals.decide', 'approvals', 'decide', 'Approve or reject approval requests'),
('workflows.read', 'workflows', 'read', 'Read workflow definitions and runs'),
('workflows.write', 'workflows', 'write', 'Create and edit workflows'),
('workflows.trigger', 'workflows', 'trigger', 'Trigger workflow runs'),
('knowledge.read', 'knowledge', 'read', 'Read knowledge articles and policy rules'),
('knowledge.write', 'knowledge', 'write', 'Create/update draft knowledge content'),
('knowledge.publish', 'knowledge', 'publish', 'Publish knowledge content'),
('reports.read', 'reports', 'read', 'Read reports and operational metrics'),
('reports.export', 'reports', 'export', 'Export report data'),
('settings.read', 'settings', 'read', 'Read workspace settings'),
('settings.write', 'settings', 'write', 'Update workspace settings'),
('members.read', 'members', 'read', 'Read members and roles'),
('members.invite', 'members', 'invite', 'Invite new members'),
('members.remove', 'members', 'remove', 'Remove/suspend members'),
('billing.read', 'billing', 'read', 'Read billing usage and subscription state'),
('billing.manage', 'billing', 'manage', 'Manage billing plan and payment settings'),
('audit.read', 'audit', 'read', 'Read audit logs')
ON CONFLICT (key) DO NOTHING;

COMMIT;
