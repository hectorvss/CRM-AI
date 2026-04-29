/**
 * server/queue/types.ts
 *
 * All job type definitions for the async queue system.
 *
 * Each job has:
 *  - A unique `type` discriminant string
 *  - A typed `payload` with all data needed to process it
 *
 * Adding a new job kind:
 *  1. Add a new entry to `JobType`
 *  2. Define its payload interface
 *  3. Add it to the `Job` discriminated union
 *  4. Register a handler in queue/handlers/index.ts
 */

// ── Job status lifecycle ──────────────────────────────────────────────────────
//
//   pending → processing → completed
//                       ↘ failed (retryable → back to pending after delay)
//                       ↘ dead   (max attempts exhausted, no more retries)

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'dead';

// ── Job type discriminants ────────────────────────────────────────────────────

export const JobType = {
  // Phase 0 / infrastructure
  NOOP:                    'noop',                    // smoke-test job

  // Phase 2 — ingest pipeline
  WEBHOOK_PROCESS:         'webhook.process',         // raw webhook → canonical event
  CHANNEL_INGEST:          'channel.ingest',          // channel event → structured intake
  CANONICALIZE:            'canonicalize',            // intake → canonical case context
  INTENT_ROUTE:            'intent.route',            // canonical context → intent + case

  // Phase 3 — reconciliation
  RECONCILE_CASE:          'reconcile.case',          // run reconciliation for a case
  RECONCILE_SCHEDULED:     'reconcile.scheduled',     // periodic sweep of open cases

  // Phase 4 — resolution
  RESOLUTION_PLAN:         'resolution.plan',         // build execution plan for a conflict
  RESOLUTION_EXECUTE:      'resolution.execute',      // run an approved execution plan
  RESOLUTION_ROLLBACK:     'resolution.rollback',     // roll back a partially-executed plan

  // Phase 5 — communication
  DRAFT_REPLY:             'draft.reply',             // generate AI draft for a case
  SEND_MESSAGE:            'send.message',            // send message through a channel

  // Phase 6 — observability
  SLA_CHECK:               'sla.check',               // check SLA deadlines across cases
  CHURN_RISK_SCAN:         'churn.risk.scan',         // scan for customers at churn risk

  // Phase 7 — agent engine
  AGENT_TRIGGER:           'agent.trigger',            // trigger one or more agents for a case
  AGENT_EXECUTE:           'agent.execute',            // execute a single agent ad hoc
  AI_DIAGNOSE:             'ai.diagnose',              // queued AI diagnosis request
  AI_DRAFT:                'ai.draft',                 // queued AI draft request
} as const;

export type JobType = typeof JobType[keyof typeof JobType];

// ── Per-job payload types ─────────────────────────────────────────────────────

export interface NoopPayload {
  message?: string;
}

export interface WebhookProcessPayload {
  webhookEventId: string;
  /** e.g. 'shopify' | 'stripe' | 'whatsapp' | 'email' */
  source: string;
  /** Raw body as stored in webhook_events.raw_body */
  rawBody: string;
  headers: Record<string, string>;
}

export interface ChannelIngestPayload {
  /** ID of the canonical_event produced by WebhookProcess */
  canonicalEventId: string;
  channel: 'email' | 'web_chat' | 'whatsapp' | 'sms';
  rawMessageId: string;
}

export interface CanonicalizePayload {
  canonicalEventId: string;
}

export interface IntentRoutePayload {
  canonicalEventId: string;
  /** Case to update, if already exists */
  caseId?: string;
}

export interface ReconcileCasePayload {
  caseId: string;
  /** Which domains to check. Undefined = all */
  domains?: Array<'payment' | 'fulfillment' | 'returns' | 'identity'>;
}

export interface ReconcileScheduledPayload {
  /** Max number of cases to process in this sweep */
  limit?: number;
}

export interface ResolutionPlanPayload {
  caseId: string;
  reconciliationIssueIds: string[];
}

export interface ResolutionExecutePayload {
  executionPlanId: string;
  /** 'ai' = run fully autonomous; 'manual' = just validate steps */
  mode: 'ai' | 'manual';
}

export interface ResolutionRollbackPayload {
  executionPlanId: string;
  reason: string;
}

export interface DraftReplyPayload {
  caseId: string;
  tone?: 'professional' | 'friendly' | 'empathetic';
}

export interface SendMessagePayload {
  caseId: string;
  conversationId: string;
  channel: 'email' | 'web_chat' | 'whatsapp' | 'sms';
  content: string;
  /** Message row created immediately by the API for instant inbox feedback. */
  queuedMessageId?: string;
  /** Reference to the draft_reply that was approved, if any */
  draftReplyId?: string;
}

export interface SlaCheckPayload {
  /** Specific case to check. Undefined = sweep all open cases */
  caseId?: string;
}

export interface ChurnRiskScanPayload {
  /** If set, only scan this specific customer */
  customerId?: string;
}

export interface AgentTriggerPayload {
  /** Which lifecycle event fired this trigger */
  triggerEvent: 'case_created' | 'message_received' | 'conflicts_detected' | 'approval_approved' | 'approval_rejected' | 'case_resolved';
  caseId: string;
  /** If set, run only this specific agent (skip routing table) */
  agentSlug?: string;
  /** Extra context passed through to the agent implementation */
  context?: Record<string, unknown>;
}

export interface AgentExecutePayload {
  agentId: string;
  agentSlug: string;
  input?: Record<string, unknown>;
  context?: Record<string, unknown>;
  isTest?: boolean;
}

export interface AiDiagnosePayload {
  caseId: string;
  profile?: string;
  context?: Record<string, unknown>;
}

export interface AiDraftPayload {
  caseId: string;
  profile?: string;
  agentSlug?: string;
  tone?: string;
  context?: Record<string, unknown>;
}

// ── Discriminated union ───────────────────────────────────────────────────────

export type JobPayloadMap = {
  [JobType.NOOP]:                NoopPayload;
  [JobType.WEBHOOK_PROCESS]:     WebhookProcessPayload;
  [JobType.CHANNEL_INGEST]:      ChannelIngestPayload;
  [JobType.CANONICALIZE]:        CanonicalizePayload;
  [JobType.INTENT_ROUTE]:        IntentRoutePayload;
  [JobType.RECONCILE_CASE]:      ReconcileCasePayload;
  [JobType.RECONCILE_SCHEDULED]: ReconcileScheduledPayload;
  [JobType.RESOLUTION_PLAN]:     ResolutionPlanPayload;
  [JobType.RESOLUTION_EXECUTE]:  ResolutionExecutePayload;
  [JobType.RESOLUTION_ROLLBACK]: ResolutionRollbackPayload;
  [JobType.DRAFT_REPLY]:         DraftReplyPayload;
  [JobType.SEND_MESSAGE]:        SendMessagePayload;
  [JobType.SLA_CHECK]:           SlaCheckPayload;
  [JobType.CHURN_RISK_SCAN]:     ChurnRiskScanPayload;
  [JobType.AGENT_TRIGGER]:       AgentTriggerPayload;
  [JobType.AGENT_EXECUTE]:       AgentExecutePayload;
  [JobType.AI_DIAGNOSE]:         AiDiagnosePayload;
  [JobType.AI_DRAFT]:            AiDraftPayload;
};

// ── DB row shape (as stored in the `jobs` table) ──────────────────────────────

export interface JobRow {
  id:           string;
  type:         JobType;
  payload:      string;         // JSON
  status:       JobStatus;
  priority:     number;         // lower = higher priority (default 10)
  attempts:     number;
  max_attempts: number;
  run_at:       string;         // ISO datetime — when the job becomes eligible
  started_at:   string | null;
  finished_at:  string | null;
  error:        string | null;  // last error message
  created_at:   string;
  tenant_id:    string | null;
  workspace_id: string | null;
  trace_id:     string | null;  // for distributed tracing correlation
}

// ── Enqueue options (caller-facing) ──────────────────────────────────────────

export interface EnqueueOptions {
  /** Lower number = processed first. Default: 10 */
  priority?: number;
  /** Delay before job becomes eligible. Default: 0 */
  delayMs?: number;
  /** Override default max attempts from config */
  maxAttempts?: number;
  /** Tenant context to carry into the handler */
  tenantId?: string;
  workspaceId?: string;
  /** Arbitrary trace/correlation ID */
  traceId?: string;
}

// ── Handler contract ──────────────────────────────────────────────────────────

export interface JobContext {
  jobId:       string;
  traceId:     string;
  tenantId:    string | null;
  workspaceId: string | null;
  attempt:     number;
}

export type JobHandler<T extends JobType> = (
  payload: JobPayloadMap[T],
  ctx: JobContext
) => Promise<void>;
