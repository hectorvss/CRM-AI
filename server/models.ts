export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface Workspace {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  plan_id: string;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: string;
  is_system: number;
  created_at: string;
}

export interface Member {
  id: string;
  user_id: string;
  workspace_id: string;
  role_id: string;
  seat_id: string | null;
  status: 'active' | 'invited' | 'suspended';
  joined_at: string;
  tenant_id: string;
}

export interface Role {
  id: string;
  workspace_id: string;
  name: string;
  permissions: string[];
  is_system: number;
  tenant_id: string;
}

export interface Case {
  id: string;
  case_number: string;
  tenant_id: string;
  workspace_id: string;
  source_system: string;
  source_channel: string;
  source_entity_id: string | null;
  type: string;
  sub_type: string | null;
  intent: string | null;
  intent_confidence: number | null;
  status: string;
  priority: string;
  severity: string;
  risk_level: string;
  risk_score: number;
  fraud_flag: number;
  assigned_user_id: string | null;
  assigned_team_id: string | null;
  created_by_user_id: string | null;
  sla_policy_id: string | null;
  sla_first_response_deadline: string | null;
  sla_resolution_deadline: string | null;
  sla_status: string;
  customer_id: string | null;
  order_ids: string[];
  payment_ids: string[];
  return_ids: string[];
  conversation_id: string | null;
  ai_diagnosis: string | null;
  ai_root_cause: string | null;
  ai_confidence: number | null;
  ai_recommended_action: string | null;
  ai_evidence_refs: string[];
  approval_state: string;
  active_approval_request_id: string | null;
  execution_state: string;
  active_execution_plan_id: string | null;
  resolution_state: string;
  resolved_by: string | null;
  resolution_notes: string | null;
  resolution_at: string | null;
  has_reconciliation_conflicts: number;
  conflict_severity: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  first_response_at: string | null;
  last_activity_at: string;
  closed_at: string | null;
}

export interface CaseDraftReply {
  id: string;
  case_id: string;
  conversation_id: string;
  content: string;
  generated_by: string | null;
  generated_at: string;
  citations: string[];
  status: 'pending_review' | 'approved' | 'rejected' | 'sent';
  reviewed_by: string | null;
  reviewed_at: string | null;
  tenant_id: string;
}

export interface CanonicalEvent {
  id: string;
  dedupe_key: string;
  tenant_id: string;
  workspace_id: string;
  source_system: string;
  source_entity_type: string;
  source_entity_id: string;
  event_type: string;
  event_category: string | null;
  occurred_at: string;
  ingested_at: string;
  processed_at: string | null;
  canonical_entity_type: string | null;
  canonical_entity_id: string | null;
  correlation_id: string | null;
  case_id: string | null;
  normalized_payload: Record<string, any>;
  confidence: number;
  mapping_version: string;
  status: 'received' | 'deduplicated' | 'canonicalized' | 'linked' | 'case_created' | 'failed';
}

export interface KnowledgeArticle {
  id: string;
  tenant_id: string;
  workspace_id: string;
  domain_id: string | null;
  title: string;
  content: string;
  content_structured: Record<string, any> | null;
  type: 'sop' | 'policy' | 'macro' | 'faq' | 'playbook' | 'article';
  status: 'draft' | 'published' | 'archived' | 'needs_review';
  owner_user_id: string | null;
  review_cycle_days: number;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  version: number;
  citation_count: number;
  last_cited_at: string | null;
  outdated_flag: number;
  linked_workflow_ids: string[];
  linked_approval_policy_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface ApprovalRequest {
  id: string;
  case_id: string;
  tenant_id: string;
  workspace_id: string;
  requested_by: string;
  requested_by_type: string;
  action_type: string;
  action_payload: Record<string, any>;
  risk_level: string;
  policy_rule_id: string | null;
  evidence_package: Record<string, any>;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'delegated';
  assigned_to: string | null;
  assigned_team_id: string | null;
  decision_by: string | null;
  decision_at: string | null;
  decision_note: string | null;
  expires_at: string | null;
  execution_plan_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRun {
  id: string;
  workflow_version_id: string;
  case_id: string | null;
  tenant_id: string;
  trigger_type: string;
  trigger_payload: Record<string, any>;
  status: 'running' | 'waiting_approval' | 'completed' | 'failed' | 'paused' | 'cancelled';
  current_node_id: string | null;
  context: Record<string, any>;
  started_at: string;
  ended_at: string | null;
  error: string | null;
}

export interface ExecutionPlan {
  id: string;
  case_id: string;
  tenant_id: string;
  generated_by: string | null;
  generated_at: string;
  status: 'draft' | 'awaiting_approval' | 'approved' | 'executing' | 'completed' | 'failed' | 'rolled_back';
  steps: ExecutionStep[];
  dry_run_result: Record<string, any> | null;
  approval_request_id: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface ExecutionStep {
  step_id: string;
  order: number;
  tool_action_id: string;
  tool: string;
  action: string;
  params: Record<string, any>;
  idempotency_key: string;
  depends_on?: string[];
  status: 'pending' | 'running' | 'success' | 'failed' | 'timed_out' | 'rolled_back';
  attempt_count: number;
  rollback_hint?: Record<string, any>;
}
