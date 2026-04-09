-- CRM AI — Database Schema
-- Compatible with SQLite (better-sqlite3) and PostgreSQL
-- PRAGMA directives are handled by the DB client, NOT here
-- Uses CURRENT_TIMESTAMP (standard SQL) instead of datetime('now') (SQLite-only)

-- ============================================================
-- IDENTITY & GOVERNANCE
-- ============================================================

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  plan_id TEXT NOT NULL DEFAULT 'starter',
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'agent',
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- ============================================================
-- CUSTOMERS
-- ============================================================

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT 'ws_default',
  canonical_email TEXT,
  email TEXT,                              -- alias / channel-ingest shorthand
  phone TEXT,                              -- phone number for WhatsApp / SMS channels
  canonical_name TEXT,
  segment TEXT NOT NULL DEFAULT 'regular',
  risk_level TEXT NOT NULL DEFAULT 'low',
  lifetime_value REAL,
  currency TEXT DEFAULT 'USD',
  preferred_channel TEXT,
  dispute_rate REAL DEFAULT 0,
  refund_rate REAL DEFAULT 0,
  chargeback_count INTEGER DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  total_spent REAL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS linked_identities (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  system TEXT NOT NULL,
  external_id TEXT NOT NULL,
  confidence REAL DEFAULT 1.0,
  verified INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
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
  confidence REAL NOT NULL DEFAULT 0.5,
  reason TEXT,
  payload TEXT DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TEXT,
  resolved_customer_id TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_identity_resolution_queue_scope_status
  ON identity_resolution_queue(tenant_id, workspace_id, status, created_at DESC);

-- ============================================================
-- CASES (Root entity)
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
  intent_confidence REAL,
  status TEXT NOT NULL DEFAULT 'new',
  priority TEXT NOT NULL DEFAULT 'normal',
  severity TEXT NOT NULL DEFAULT 'S3',
  risk_level TEXT NOT NULL DEFAULT 'low',
  risk_score REAL DEFAULT 0,
  fraud_flag INTEGER DEFAULT 0,
  assigned_user_id TEXT REFERENCES users(id),
  assigned_team_id TEXT REFERENCES teams(id),
  created_by_user_id TEXT REFERENCES users(id),
  sla_policy_id TEXT,
  sla_first_response_deadline TEXT,
  sla_resolution_deadline TEXT,
  sla_status TEXT DEFAULT 'on_track',
  customer_id TEXT REFERENCES customers(id),
  order_ids TEXT DEFAULT '[]',
  payment_ids TEXT DEFAULT '[]',
  return_ids TEXT DEFAULT '[]',
  conversation_id TEXT,
  ai_diagnosis TEXT,
  ai_root_cause TEXT,
  ai_confidence REAL,
  ai_recommended_action TEXT,
  ai_evidence_refs TEXT DEFAULT '[]',
  approval_state TEXT DEFAULT 'not_required',
  active_approval_request_id TEXT,
  execution_state TEXT DEFAULT 'idle',
  active_execution_plan_id TEXT,
  resolution_state TEXT DEFAULT 'unresolved',
  resolved_by TEXT,
  resolution_notes TEXT,
  resolution_at TEXT,
  has_reconciliation_conflicts INTEGER DEFAULT 0,
  conflict_severity TEXT,
  tags TEXT DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  first_response_at TEXT,
  last_activity_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  closed_at TEXT
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
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
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
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  tenant_id TEXT NOT NULL
);

-- ============================================================
-- CONVERSATIONS & MESSAGES
-- ============================================================

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES cases(id),        -- nullable: set after case is created
  customer_id TEXT REFERENCES customers(id),
  channel TEXT NOT NULL DEFAULT 'email',
  status TEXT NOT NULL DEFAULT 'open',
  subject TEXT,                              -- email subject / thread title
  external_thread_id TEXT,
  first_message_at TEXT,
  last_message_at TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT 'ws_default'
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  case_id TEXT REFERENCES cases(id),        -- nullable: linked after case creation
  customer_id TEXT REFERENCES customers(id),
  type TEXT NOT NULL DEFAULT 'customer',
  direction TEXT NOT NULL DEFAULT 'inbound', -- 'inbound' | 'outbound'
  sender_id TEXT,
  sender_name TEXT,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text', -- 'text' | 'html' | 'markdown'
  channel TEXT NOT NULL DEFAULT 'email',
  external_message_id TEXT,                  -- platform-native ID for dedup
  draft_reply_id TEXT REFERENCES draft_replies(id),
  sentiment TEXT,
  sentiment_score REAL,
  attachments TEXT DEFAULT '[]',
  sent_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  delivered_at TEXT,
  read_at TEXT,
  tenant_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_messages_case ON messages(case_id, sent_at);

CREATE TABLE IF NOT EXISTS draft_replies (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  content TEXT NOT NULL,
  generated_by TEXT,
  generated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  tone TEXT DEFAULT 'professional',          -- 'professional' | 'friendly' | 'empathetic'
  confidence REAL DEFAULT 0.5,               -- AI confidence 0–1
  has_policies INTEGER DEFAULT 0,            -- 1 if knowledge articles were referenced
  citations TEXT DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending_review',
  reviewed_by TEXT,
  reviewed_at TEXT,
  sent_at TEXT,                              -- set when the draft is actually delivered
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  tenant_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS internal_notes (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  content TEXT NOT NULL,
  created_by TEXT,
  created_by_type TEXT DEFAULT 'human',
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
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
  system_states TEXT NOT NULL DEFAULT '{"canonical":"pending"}',
  total_amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  country TEXT,
  brand TEXT,
  channel TEXT,
  order_date TEXT,
  has_conflict INTEGER DEFAULT 0,
  conflict_domain TEXT,
  conflict_detected TEXT,
  recommended_action TEXT,
  risk_level TEXT DEFAULT 'low',
  order_type TEXT DEFAULT 'standard',
  approval_status TEXT DEFAULT 'not_required',
  summary TEXT,
  last_sync_at TEXT,
  last_update TEXT,
  badges TEXT DEFAULT '[]',
  tab TEXT DEFAULT 'all',
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  system TEXT,
  time TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  tenant_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  external_payment_id TEXT,
  order_id TEXT REFERENCES orders(id),
  customer_id TEXT REFERENCES customers(id),
  tenant_id TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_method TEXT,
  psp TEXT DEFAULT 'stripe',
  status TEXT NOT NULL DEFAULT 'pending',
  system_states TEXT NOT NULL DEFAULT '{"canonical":"pending"}',
  dispute_id TEXT,
  refund_ids TEXT DEFAULT '[]',
  risk_level TEXT DEFAULT 'low',
  payment_type TEXT DEFAULT 'standard',
  approval_status TEXT DEFAULT 'not_required',
  summary TEXT,
  has_conflict INTEGER DEFAULT 0,
  conflict_detected TEXT,
  recommended_action TEXT,
  badges TEXT DEFAULT '[]',
  tab TEXT DEFAULT 'all',
  refund_amount REAL,
  refund_type TEXT,
  dispute_reference TEXT,
  chargeback_amount REAL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  last_update TEXT
);

CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  external_refund_id TEXT,
  payment_id TEXT REFERENCES payments(id),
  order_id TEXT REFERENCES orders(id),
  customer_id TEXT REFERENCES customers(id),
  tenant_id TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  type TEXT DEFAULT 'full',
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  initiated_by TEXT,
  initiated_by_type TEXT DEFAULT 'human',
  approval_request_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
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
  return_value REAL,
  status TEXT NOT NULL DEFAULT 'pending_review',
  inspection_status TEXT,
  refund_status TEXT,
  carrier_status TEXT,
  has_conflict INTEGER DEFAULT 0,
  approval_status TEXT DEFAULT 'not_required',
  risk_level TEXT DEFAULT 'low',
  linked_refund_id TEXT,
  linked_shipment_id TEXT,
  system_states TEXT NOT NULL DEFAULT '{"canonical":"pending_review"}',
  conflict_detected TEXT,
  recommended_action TEXT,
  summary TEXT,
  badges TEXT DEFAULT '[]',
  tab TEXT DEFAULT 'all',
  method TEXT,
  received_at_warehouse TEXT,
  brand TEXT,
  country TEXT,
  currency TEXT DEFAULT 'USD',
  last_update TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS return_events (
  id TEXT PRIMARY KEY,
  return_id TEXT NOT NULL REFERENCES returns(id),
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  system TEXT,
  time TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
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
  conflicting_systems TEXT DEFAULT '[]',
  expected_state TEXT,
  actual_states TEXT DEFAULT '{}',
  source_of_truth_system TEXT,
  resolution_plan TEXT,
  detected_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  resolved_at TEXT,
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
  fetched_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  is_stale INTEGER DEFAULT 0,
  tenant_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_of_truth_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  preferred_system TEXT NOT NULL,
  fallback_system TEXT,
  confidence_threshold REAL DEFAULT 0.8,
  rule_priority INTEGER DEFAULT 100,
  is_active INTEGER DEFAULT 1,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_source_of_truth_rules_scope_entity
  ON source_of_truth_rules(tenant_id, workspace_id, entity_type);

-- ============================================================
-- APPROVALS
-- ============================================================

CREATE TABLE IF NOT EXISTS approval_policies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  trigger_conditions TEXT DEFAULT '[]',
  required_approver_role TEXT,
  required_approver_user_id TEXT,
  expires_after_hours INTEGER DEFAULT 24,
  allow_delegation INTEGER DEFAULT 1,
  allow_bulk INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_by TEXT,
  version INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  requested_by_type TEXT DEFAULT 'agent',
  action_type TEXT NOT NULL,
  action_payload TEXT DEFAULT '{}',
  risk_level TEXT NOT NULL DEFAULT 'medium',
  policy_rule_id TEXT,
  evidence_package TEXT DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  assigned_to TEXT,
  assigned_team_id TEXT,
  decision_by TEXT,
  decision_at TEXT,
  decision_note TEXT,
  expires_at TEXT,
  execution_plan_id TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_approvals_status ON approval_requests(tenant_id, status, created_at DESC);

-- ============================================================
-- EXECUTION
-- ============================================================

CREATE TABLE IF NOT EXISTS execution_plans (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  tenant_id TEXT NOT NULL,
  generated_by TEXT,
  generated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  status TEXT NOT NULL DEFAULT 'draft',
  steps TEXT DEFAULT '[]',
  dry_run_result TEXT,
  approval_request_id TEXT,
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS tool_action_attempts (
  id TEXT PRIMARY KEY,
  execution_plan_id TEXT REFERENCES execution_plans(id),
  step_id TEXT,
  tenant_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  action TEXT NOT NULL,
  params TEXT DEFAULT '{}',
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  request_payload TEXT,
  response_payload TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  ended_at TEXT,
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
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS workflow_versions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflow_definitions(id),
  version_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  nodes TEXT DEFAULT '[]',
  edges TEXT DEFAULT '[]',
  trigger TEXT DEFAULT '{}',
  published_by TEXT,
  published_at TEXT,
  tenant_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_version_id TEXT NOT NULL REFERENCES workflow_versions(id),
  case_id TEXT REFERENCES cases(id),
  tenant_id TEXT NOT NULL,
  trigger_type TEXT DEFAULT 'manual',
  trigger_payload TEXT DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'running',
  current_node_id TEXT,
  context TEXT DEFAULT '{}',
  started_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  ended_at TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS workflow_run_steps (
  id TEXT PRIMARY KEY,
  workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id),
  node_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  input TEXT DEFAULT '{}',
  output TEXT DEFAULT '{}',
  started_at TEXT,
  ended_at TEXT,
  error TEXT
);

-- ============================================================
-- KNOWLEDGE
-- ============================================================

CREATE TABLE IF NOT EXISTS knowledge_domains (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS knowledge_articles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  domain_id TEXT REFERENCES knowledge_domains(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_structured TEXT,
  type TEXT NOT NULL DEFAULT 'article',
  status TEXT NOT NULL DEFAULT 'published',
  owner_user_id TEXT REFERENCES users(id),
  review_cycle_days INTEGER DEFAULT 90,
  last_reviewed_at TEXT,
  next_review_at TEXT,
  version INTEGER DEFAULT 1,
  citation_count INTEGER DEFAULT 0,
  last_cited_at TEXT,
  outdated_flag INTEGER DEFAULT 0,
  linked_workflow_ids TEXT DEFAULT '[]',
  linked_approval_policy_ids TEXT DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS policy_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  knowledge_article_id TEXT REFERENCES knowledge_articles(id),
  name TEXT NOT NULL,
  description TEXT,
  entity_type TEXT NOT NULL,
  conditions TEXT DEFAULT '[]',
  action_mapping TEXT DEFAULT '{}',
  approval_mapping TEXT,
  escalation_mapping TEXT,
  is_active INTEGER DEFAULT 1,
  version INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS policy_evaluations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  action_type TEXT,
  case_id TEXT,
  input_context TEXT DEFAULT '{}',
  evaluated_rules TEXT DEFAULT '[]',
  matched_rule_id TEXT,
  decision TEXT NOT NULL,
  requires_approval INTEGER DEFAULT 0,
  conflict_detected INTEGER DEFAULT 0,
  conflicting_rule_ids TEXT DEFAULT '[]',
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS canonical_field_decisions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  chosen_system TEXT,
  chosen_value TEXT,
  candidates TEXT DEFAULT '{}',
  reason TEXT,
  issue_id TEXT REFERENCES reconciliation_issues(id),
  case_id TEXT REFERENCES cases(id),
  decided_by TEXT,
  decided_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
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

-- ============================================================
-- INTEGRATIONS & CONNECTORS
-- ============================================================

CREATE TABLE IF NOT EXISTS connectors (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  system TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected',
  auth_type TEXT NOT NULL DEFAULT 'api_key',
  auth_config TEXT DEFAULT '{}',
  last_health_check_at TEXT,
  capabilities TEXT DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS connector_capabilities (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL REFERENCES connectors(id),
  capability_key TEXT NOT NULL,
  direction TEXT DEFAULT 'read',
  is_enabled INTEGER DEFAULT 1,
  requires_approval INTEGER DEFAULT 0,
  is_idempotent INTEGER DEFAULT 1,
  rate_limit_per_minute INTEGER,
  UNIQUE(connector_id, capability_key)
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  connector_id TEXT REFERENCES connectors(id),
  tenant_id TEXT NOT NULL,
  source_system TEXT NOT NULL,
  event_type TEXT NOT NULL,
  raw_payload TEXT,
  received_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  processed_at TEXT,
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
  occurred_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  ingested_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  processed_at TEXT,
  canonical_entity_type TEXT,
  canonical_entity_id TEXT,
  correlation_id TEXT,
  case_id TEXT REFERENCES cases(id),
  normalized_payload TEXT DEFAULT '{}',
  confidence REAL DEFAULT 1.0,
  mapping_version TEXT DEFAULT '1.0',
  status TEXT NOT NULL DEFAULT 'received',
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

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
  is_system INTEGER DEFAULT 0,
  is_locked INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  current_version_id TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS case_knowledge_links (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  article_id TEXT NOT NULL REFERENCES knowledge_articles(id),
  tenant_id TEXT NOT NULL,
  relevance_score REAL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE(case_id, article_id)
);

CREATE TABLE IF NOT EXISTS agent_versions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  version_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'published',
  permission_profile TEXT DEFAULT '{}',
  reasoning_profile TEXT DEFAULT '{}',
  safety_profile TEXT DEFAULT '{}',
  knowledge_profile TEXT DEFAULT '{}',
  capabilities TEXT DEFAULT '{}',
  rollout_percentage INTEGER DEFAULT 100,
  published_by TEXT,
  published_at TEXT,
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
  confidence REAL,
  summary TEXT,
  output TEXT,
  evidence_refs TEXT DEFAULT '[]',
  execution_decision TEXT DEFAULT 'proceed',
  tokens_used INTEGER DEFAULT 0,
  cost_credits REAL DEFAULT 0,
  error TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  ended_at TEXT,
  finished_at TEXT
);

-- ============================================================
-- AUDIT & BILLING
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
  metadata TEXT DEFAULT '{}',
  ip_address TEXT,
  occurred_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_events(tenant_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  entry_type TEXT NOT NULL DEFAULT 'debit',
  amount REAL NOT NULL,
  reason TEXT NOT NULL,
  reference_id TEXT,
  balance_after REAL NOT NULL,
  occurred_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  role_id TEXT NOT NULL,
  seat_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  joined_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  tenant_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '[]',
  is_system INTEGER NOT NULL DEFAULT 0,
  tenant_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TEXT NOT NULL,
  current_period_end TEXT NOT NULL,
  seats_included INTEGER NOT NULL DEFAULT 1,
  seats_used INTEGER NOT NULL DEFAULT 1,
  credits_included INTEGER NOT NULL DEFAULT 0,
  credits_used INTEGER NOT NULL DEFAULT 0,
  external_subscription_id TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS billing_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  interval TEXT NOT NULL DEFAULT 'month',
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS feature_gates (
  id TEXT PRIMARY KEY,
  feature_key TEXT NOT NULL,
  plan_ids TEXT NOT NULL DEFAULT '[]',
  workspace_overrides TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS workspace_feature_flags (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  feature_key TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'workspace_override',
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE(tenant_id, workspace_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_workspace_feature_flags_scope
  ON workspace_feature_flags(tenant_id, workspace_id, feature_key);

CREATE TABLE IF NOT EXISTS seats (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  member_id TEXT REFERENCES members(id),
  seat_type TEXT NOT NULL DEFAULT 'full',
  assigned_at TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1.0,
  unit TEXT NOT NULL,
  reference_id TEXT,
  reference_type TEXT,
  billing_period TEXT NOT NULL,
  occurred_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- ============================================================
-- ASYNC JOB QUEUE
-- ============================================================
-- SQLite-backed queue. No external broker required.
-- The worker polls this table and claims jobs atomically.
-- Statuses: pending → processing → completed
--                              ↘ failed (retryable → back to pending after backoff)
--                              ↘ dead   (max_attempts exhausted)

CREATE TABLE IF NOT EXISTS jobs (
  id           TEXT    PRIMARY KEY,
  type         TEXT    NOT NULL,                          -- JobType discriminant
  payload      TEXT    NOT NULL DEFAULT '{}',             -- JSON payload
  status       TEXT    NOT NULL DEFAULT 'pending',        -- pending|processing|completed|failed|dead
  priority     INTEGER NOT NULL DEFAULT 10,               -- lower = higher priority
  attempts     INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  run_at       TEXT    NOT NULL DEFAULT (CURRENT_TIMESTAMP), -- earliest eligible time
  started_at   TEXT,
  finished_at  TEXT,
  error        TEXT,                                      -- last error message
  created_at   TEXT    NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  tenant_id    TEXT,
  workspace_id TEXT,
  trace_id     TEXT                                       -- distributed tracing correlation
);

-- Worker claims jobs ordered by priority ASC, run_at ASC
CREATE INDEX IF NOT EXISTS idx_jobs_queue
  ON jobs(status, run_at, priority)
  WHERE status = 'pending';

-- Admin / dashboard queries by tenant
CREATE INDEX IF NOT EXISTS idx_jobs_tenant
  ON jobs(tenant_id, status, created_at DESC);

-- Look up a specific job by trace for debugging
CREATE INDEX IF NOT EXISTS idx_jobs_trace
  ON jobs(trace_id)
  WHERE trace_id IS NOT NULL;

-- ============================================================
-- SCHEMA MIGRATIONS TRACKING
-- ============================================================
-- Tracks which incremental ALTER TABLE migrations have been applied.
-- Prevents re-running migrations on existing databases.

CREATE TABLE IF NOT EXISTS schema_migrations (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
