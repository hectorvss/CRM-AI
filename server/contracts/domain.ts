export type UUID = string;
export type ISODateTime = string;

export type SourceSystem =
  | 'zendesk'
  | 'intercom'
  | 'gorgias'
  | 'shopify'
  | 'stripe'
  | 'email'
  | 'api'
  | 'webhook'
  | 'internal'
  | 'custom';

export type Channel = 'email' | 'web_chat' | 'whatsapp' | 'phone' | 'api';

export type CaseType =
  | 'refund'
  | 'return'
  | 'payment_dispute'
  | 'order_issue'
  | 'general_support'
  | 'reconciliation'
  | 'account';

export type CaseStatus =
  | 'new'
  | 'open'
  | 'waiting'
  | 'in_review'
  | 'pending_approval'
  | 'pending_execution'
  | 'resolved'
  | 'closed'
  | 'escalated';

export type Priority = 'low' | 'normal' | 'high' | 'urgent' | 'critical';
export type Severity = 'S1' | 'S2' | 'S3' | 'S4';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type SLAStatus = 'on_track' | 'at_risk' | 'breached' | 'paused';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'delegated';
export type ExecutionPlanStatus =
  | 'draft'
  | 'awaiting_approval'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'rolled_back'
  | 'cancelled';
export type WorkflowRunStatus =
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'cancelled';

export type ReconciliationIssueStatus = 'open' | 'in_progress' | 'resolved' | 'ignored' | 'escalated';
export type ConnectorHealthStatus = 'healthy' | 'degraded' | 'error' | 'timeout' | 'disconnected';

export interface CaseContract {
  id: UUID;
  case_number: string;
  tenant_id: UUID;
  workspace_id: UUID;
  source_system: SourceSystem;
  source_channel: Channel;
  source_entity_id?: string | null;
  type: CaseType;
  sub_type?: string | null;
  intent?: string | null;
  intent_confidence?: number | null;
  tags: string[];
  status: CaseStatus;
  priority: Priority;
  severity: Severity;
  risk_level: RiskLevel;
  risk_score?: number | null;
  assigned_user_id?: UUID | null;
  assigned_team_id?: UUID | null;
  sla_status: SLAStatus;
  sla_first_response_deadline?: ISODateTime | null;
  sla_resolution_deadline?: ISODateTime | null;
  customer_id?: UUID | null;
  order_ids: UUID[];
  payment_ids: UUID[];
  return_ids: UUID[];
  conversation_id?: UUID | null;
  approval_state?: string;
  execution_state?: string;
  resolution_state?: string;
  has_reconciliation_conflicts?: 0 | 1;
  conflict_severity?: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  last_activity_at: ISODateTime;
}

export interface CanonicalEventContract {
  event_id: UUID;
  dedupe_key: string;
  tenant_id: UUID;
  workspace_id: UUID;
  source_system: SourceSystem;
  source_entity_type: string;
  source_entity_id: string;
  occurred_at: ISODateTime;
  ingested_at: ISODateTime;
  processed_at?: ISODateTime | null;
  event_type: string;
  event_category?: 'commerce' | 'support' | 'payment' | 'logistics' | 'identity' | null;
  canonical_entity_type?: string | null;
  canonical_entity_id?: UUID | null;
  correlation_id?: string | null;
  causation_id?: string | null;
  case_id?: UUID | null;
  normalized_payload: Record<string, unknown>;
  raw_payload?: Record<string, unknown> | null;
  confidence: number;
  mapping_version: string;
  mapping_warnings?: string[];
  status: 'received' | 'deduplicated' | 'canonicalized' | 'linked' | 'case_created' | 'failed';
  error?: string | null;
}

export interface ApprovalRequestContract {
  id: UUID;
  case_id: UUID;
  tenant_id: UUID;
  workspace_id: UUID;
  requested_by: string;
  requested_by_type: 'agent' | 'human';
  action_type: string;
  action_payload: Record<string, unknown>;
  risk_level: RiskLevel;
  status: ApprovalStatus;
  evidence_package: Record<string, unknown>;
  assigned_to?: UUID | null;
  assigned_team_id?: UUID | null;
  decision_by?: UUID | null;
  decision_at?: ISODateTime | null;
  decision_note?: string | null;
  expires_at?: ISODateTime | null;
  execution_plan_id?: UUID | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface ExecutionStepContract {
  step_id: string;
  order: number;
  tool_action_id: string;
  tool: string;
  action: string;
  params: Record<string, unknown>;
  idempotency_key: string;
  depends_on?: string[];
  status: 'pending' | 'running' | 'success' | 'failed' | 'timed_out' | 'rolled_back';
  attempt_count: number;
  rollback_hint?: Record<string, unknown>;
}

export interface ExecutionPlanContract {
  id: UUID;
  case_id: UUID;
  tenant_id: UUID;
  generated_by?: string | null;
  generated_at: ISODateTime;
  status: ExecutionPlanStatus;
  steps: ExecutionStepContract[];
  dry_run_result?: Record<string, unknown> | null;
  approval_request_id?: UUID | null;
  started_at?: ISODateTime | null;
  completed_at?: ISODateTime | null;
}

