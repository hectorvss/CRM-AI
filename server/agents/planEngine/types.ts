/**
 * server/agents/planEngine/types.ts
 *
 * Core contracts for the Super Agent Plan Engine.
 *
 * Design principles:
 *  - The LLM produces `Plan`s. The system decides whether to execute them.
 *  - Tools are versioned, typed, and classified by risk.
 *  - Every execution emits an `ExecutionTrace` with structured spans.
 *  - Writes are never performed by the LLM directly — only through validated ToolSpecs.
 *
 * This module is intentionally framework-agnostic and has no direct DB access.
 */

// ── Schema validation (minimal, dep-free) ────────────────────────────────────
//
// We define a small internal schema shape so the engine does not pull in `zod`
// today. It is trivial to swap for zod later — adapt `Schema.parse()` to call
// `zodSchema.parse()` and everything keeps working.

export type SchemaResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; path?: string };

export interface Schema<T> {
  /** Validate and coerce a raw unknown value. */
  parse(input: unknown): SchemaResult<T>;
  /** Structural description used to describe the tool to the LLM. */
  describe(): SchemaDescriptor;
}

export type SchemaDescriptor =
  | { type: 'string'; required: boolean; enum?: string[]; description?: string; min?: number; max?: number }
  | { type: 'number'; required: boolean; description?: string; min?: number; max?: number; integer?: boolean }
  | { type: 'boolean'; required: boolean; description?: string }
  | { type: 'object'; required: boolean; description?: string; fields: Record<string, SchemaDescriptor> }
  | { type: 'array'; required: boolean; description?: string; items: SchemaDescriptor }
  | { type: 'any'; required: boolean; description?: string };

// ── Risk / side-effect classification ────────────────────────────────────────

export type SideEffect = 'read' | 'write' | 'external';

/**
 * Risk level determines approval gates and execution policy:
 *  - none     → free reads
 *  - low      → auto-execute, logged
 *  - medium   → auto-execute, elevated audit, rate-limited
 *  - high     → requires explicit confirmation OR policy auto-approval
 *  - critical → always routes to human approval workflow
 */
export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

// ── ToolSpec ─────────────────────────────────────────────────────────────────

export interface ToolExecutionContext {
  /** Tenant / workspace / user scope (passed through, never exposed to LLM). */
  tenantId: string;
  workspaceId: string | null;
  userId: string | null;
  /** Permission checker bound to the current request. */
  hasPermission: (permission: string) => boolean;
  /** Correlation ID for tracing (one per plan execution). */
  planId: string;
  /** Structured audit sink. */
  audit: (entry: AuditEntry) => Promise<void> | void;
  /** Whether this run is a dry-run (no side effects allowed). */
  dryRun: boolean;
}

export interface AuditEntry {
  action: string;
  entityType?: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown>;
}

export interface ToolInvocation<TArgs = unknown> {
  args: TArgs;
  context: ToolExecutionContext;
}

export interface ToolResult<TReturns = unknown> {
  ok: boolean;
  value?: TReturns;
  error?: string;
  errorCode?: string;
  /** When ok=false and the tool produced side effects, list compensating actions. */
  compensations?: Array<{ tool: string; args: unknown }>;
}

export interface ToolSpec<TArgs = unknown, TReturns = unknown> {
  /** Stable canonical name, e.g. "order.cancel". Must be a valid JS identifier with dots. */
  name: string;
  /** SemVer. Bump on breaking changes. */
  version: string;
  /** One-line description surfaced to the LLM. */
  description: string;
  /** Category for cataloguing and policy rules. */
  category: 'case' | 'order' | 'payment' | 'return' | 'customer' | 'approval' | 'workflow' | 'knowledge' | 'report' | 'search' | 'system';
  /** Typed arg validator. */
  args: Schema<TArgs>;
  /** Typed returns validator (documentation + LLM hint). */
  returns: Schema<TReturns>;
  /** Side-effect classification. Writes and externals always require policy eval. */
  sideEffect: SideEffect;
  /** Baseline risk level (may be elevated dynamically by the classifier). */
  risk: RiskLevel;
  /** Required permission string (checked against req.permissions). */
  requiredPermission?: string;
  /** Whether calling twice with same args is safe (true by default for reads). */
  idempotent: boolean;
  /** Hard timeout in ms. Default 10s. */
  timeoutMs?: number;
  /** Compensating tool name if this one needs rollback. */
  compensate?: string;
  /** Deprecation marker. Deprecated tools are hidden from LLM but still callable. */
  deprecated?: boolean;
  /** Implementation. Must honour `ctx.dryRun`. */
  run(invocation: ToolInvocation<TArgs>): Promise<ToolResult<TReturns>>;
}

// ── Plan ─────────────────────────────────────────────────────────────────────

export interface PlanStep {
  /** Stable step id within a plan, e.g. "s0", "s1". Used for `dependsOn` refs. */
  id: string;
  /** Fully qualified tool name. */
  tool: string;
  /** Raw args emitted by the LLM — validated by the registry before execution. */
  args: unknown;
  /** Step ids this step depends on. Empty = may run first / in parallel with other roots. */
  dependsOn: string[];
  /**
   * When true, the executor records a failed span but continues with later steps.
   * Useful for orchestration chains where partial execution is preferable to an abort.
   */
  continueOnFailure?: boolean;
  /** Optional human-readable rationale for this specific step. */
  rationale?: string;
}

export interface Plan {
  planId: string;
  sessionId: string;
  /** ISO timestamp of plan creation. */
  createdAt: string;
  /** Ordered steps; the executor resolves dependency graph. */
  steps: PlanStep[];
  /** LLM-reported confidence in [0,1]. */
  confidence: number;
  /** Aggregate rationale across steps. */
  rationale: string;
  /** Whether the LLM believes human approval is required. The policy layer has the final say. */
  needsApproval: boolean;
  /** Text the agent would show the user once the plan succeeds (templateable). */
  responseTemplate?: string;
}

// ── Execution trace ──────────────────────────────────────────────────────────

export interface ExecutionSpan {
  stepId: string;
  tool: string;
  version: string;
  startedAt: string;
  endedAt: string;
  latencyMs: number;
  args: unknown;
  result: ToolResult;
  /** Risk level assigned at runtime (may differ from baseline). */
  riskLevel: RiskLevel;
  /** Whether this span was a dry-run (no DB writes). */
  dryRun: boolean;
}

export type ExecutionStatus =
  | 'success'
  | 'partial'   // some steps succeeded, some failed
  | 'failed'
  | 'pending_approval'
  | 'rejected_by_policy'
  | 'invalid_args'
  | 'skipped_dry_run';

export interface ExecutionTrace {
  planId: string;
  sessionId: string;
  tenantId: string;
  workspaceId: string | null;
  userId: string | null;
  startedAt: string;
  endedAt: string;
  status: ExecutionStatus;
  spans: ExecutionSpan[];
  /** Human-readable message for the UI / response. */
  summary: string;
  /** When status is pending_approval, the created approval request id(s). */
  approvalIds?: string[];
  /** Policy decisions applied (one per step). */
  policyDecisions?: PolicyDecision[];
}

// ── Policy ───────────────────────────────────────────────────────────────────

export type PolicyAction = 'allow' | 'require_approval' | 'deny';

export interface PolicyDecision {
  stepId: string;
  tool: string;
  action: PolicyAction;
  riskLevel: RiskLevel;
  reason: string;
  /** Name of the rule that fired, for audit. */
  ruleId?: string;
}

// ── Session state (CIL L1 — see Conversational Intelligence Layer) ───────────

export interface Turn {
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  /** If this turn triggered a plan, its id. */
  planId?: string;
}

export interface Slot {
  type: 'customer' | 'order' | 'payment' | 'case' | 'return' | 'approval' | 'workflow' | 'report' | 'filter';
  value: unknown;
  confidence: number;
  mentionedAt: string;
  /** Expires after N turns without reference. */
  ttlTurns: number;
}

export interface ConversationTarget {
  page: string;
  entityType?: string | null;
  entityId?: string | null;
  section?: string | null;
  sourceContext?: string | null;
  runId?: string | null;
}

export interface SessionState {
  id: string;
  userId: string;
  tenantId: string;
  workspaceId: string | null;
  turns: Turn[];
  /** L2 rolling summary (populated by summarizer when turns exceed threshold). */
  summary: string;
  /** Live entities referenceable by pronouns / ellipsis. */
  slots: Record<string, Slot>;
  /** Last navigation targets to resolve pronouns / ellipsis. */
  recentTargets: ConversationTarget[];
  /** Approvals awaiting human decision inside this session. */
  pendingApprovalIds: string[];
  /** Currently executing plan, if any. */
  activePlanId?: string;
  createdAt: string;
  updatedAt: string;
  /** Hard TTL for the session row (persistence layer enforces). */
  ttlAt: string;
}
