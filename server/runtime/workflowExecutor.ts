/**
 * server/runtime/workflowExecutor.ts
 *
 * SCAFFOLD (Phase 1 of the workflow extraction refactor — Turno 5/D2).
 *
 * Goal of this file
 * ─────────────────
 * House the type contracts that adapters (per-category handlers under
 * `server/runtime/adapters/`) implement, plus the dispatcher (`executeNode`)
 * that the inline executor in `server/routes/workflows.ts` will fall through
 * to once each category is migrated.
 *
 * In Phase 1 we ONLY define types + an empty registry hook. The route file
 * still owns the BFS scheduler and all 100+ inline handlers. As each
 * category is extracted (Phase 2+), its adapters land in
 * `server/runtime/adapters/<category>.ts` and are wired into
 * `ALL_ADAPTERS` via `server/runtime/adapters/index.ts`. The route's
 * `executeWorkflowNode` adds an early dispatch: if a key has a registered
 * adapter, delegate to it; otherwise fall through to the inline branches.
 *
 * No behavior change in this scaffold. The only side-effect of importing
 * this file is type information.
 */

import type { WorkflowServices } from './workflowServices.js';

// ── Result shape returned by every adapter ────────────────────────────────
export type NodeAdapterStatus =
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'skipped'
  | 'waiting'
  | 'waiting_approval';

export interface NodeAdapterResult<O = any> {
  status: NodeAdapterStatus;
  output?: O;
  error?: { code: string; message: string } | null;
  // Some legacy handlers stash extra fields on the result (simulated, branch,
  // approvalRequired, etc.). We keep the result shape open so we can do a
  // 1-1 transcription during the extraction without touching callers.
  [extra: string]: any;
}

// ── The execution context handed to every adapter ─────────────────────────
//
// During the extraction we keep this loose (`any` for `node` and `context`)
// so the adapter implementations are byte-for-byte identical to the inline
// branches they replace. Once everything is migrated we can tighten it.
export interface NodeExecutionContext {
  /** Scope for tenant-aware resources (Supabase, audit). */
  scope: { tenantId: string; workspaceId: string; userId?: string };
  /**
   * The mutable workflow context object — the same object the inline
   * executor in `server/routes/workflows.ts` passes around. Adapters read
   * `context.case`, `context.order`, `context.data`, etc. and may mutate
   * `context.condition`, `context.data`, `context.__idempotency`, …
   */
  context: any;
  /** Optional services bundle. Falls back to inline imports when absent. */
  services?: WorkflowServices;
}

// ── The adapter signature ─────────────────────────────────────────────────
//
// The signature deliberately mirrors what the inline executor already does:
// take a node + context, return a status + output. Adapters are async to
// allow side effects (Supabase, fetch, channel senders).
export type NodeAdapter<I = any, O = any> = (
  ctx: NodeExecutionContext,
  node: any,
  config: any,
) => Promise<NodeAdapterResult<O>>;

// ── The adapter registry ──────────────────────────────────────────────────
//
// Defined here (not in `adapters/index.ts`) so this file is the single
// import point for both the route and the adapter sub-modules — preventing
// circular dependencies during the migration.
//
// Phase 1 leaves this empty; Phase 2 wires up the first category.
import { ALL_ADAPTERS as REGISTRY } from './adapters/index.js';

export function getAdapter(key: string): NodeAdapter | undefined {
  return REGISTRY[key];
}

/**
 * Dispatch helper. Returns the adapter result or `undefined` if no adapter
 * is registered for the key — letting the inline executor in the route
 * file fall through to its legacy branches.
 *
 * The route should call this BEFORE the long `if (node.key === ...)`
 * chain. Once every category is migrated the chain disappears and
 * `executeNode` becomes the one true entry point.
 */
export async function executeNode(
  ctx: NodeExecutionContext,
  node: any,
  config: any,
): Promise<NodeAdapterResult | undefined> {
  const adapter = getAdapter(node?.key);
  if (!adapter) return undefined;
  return adapter(ctx, node, config);
}

// ── Per-node retry wrapper ───────────────────────────────────────────────
//
// `executeNodeWithRetry` was historically an inline helper inside
// `server/routes/workflows.ts`. Phase 4a (Turno 5/D2) moves it here while
// keeping the underlying `executeNode` callable injectable so this module
// does not have to know about the inline-handler dispatch in the route.
// The route passes its own `executeWorkflowNode` (which still owns the
// remaining inline `flow.merge` / `flow.loop` / `flow.subworkflow` /
// `flow.wait` / `delay` / `flow.stop_error` branches) until Phase 4b moves
// those into the adapter registry.
//
// The post-execution audit-log side effect was lifted along with the
// wrapper — it depends only on the node contract, the result, and an
// audit-log writer. To avoid pulling the route's audit repository into
// this module we accept an `auditLog` callback. The route wires it to
// `auditRepository.logEvent` exactly as before.
//
// No behavior change: the loop / break / backoff / final-result shape is
// byte-for-byte identical to the previous inline definition.

export interface ExecuteNodeWithRetryDeps {
  /**
   * Per-node executor — typically the route's `executeWorkflowNode`. Returns
   * the same `{ status, output, error, ... }` envelope adapters return.
   */
  executeNode: (
    scope: { tenantId: string; workspaceId: string; userId?: string },
    node: any,
    context: any,
  ) => Promise<any>;
  /** Looks up the contract for a node key (sideEffects + risk). */
  getNodeContract: (key: string) => { sideEffects?: string; risk?: string };
  /** Append-only audit writer. Failures are swallowed (logged via `logger`). */
  auditLog: (
    scope: { tenantId: string; workspaceId: string },
    entry: {
      actorId: string;
      action: string;
      entityType: string;
      entityId: string;
      metadata?: Record<string, any>;
    },
  ) => Promise<unknown>;
  /** Logger used for audit-failure warnings — usually the project logger. */
  logger: { warn: (message: string, meta?: any) => void };
}

export async function executeNodeWithRetry(
  scope: { tenantId: string; workspaceId: string; userId?: string },
  node: any,
  context: any,
  deps: ExecuteNodeWithRetryDeps,
) {
  const retries = Math.max(0, Number(node.retryPolicy?.retries ?? node.retry_policy?.retries ?? 0));
  const backoffMs = Math.max(0, Number(node.retryPolicy?.backoffMs ?? node.retry_policy?.backoffMs ?? 0));
  let attempt = 0;
  let lastResult: any = null;
  while (attempt <= retries) {
    const result = await deps.executeNode(scope, node, context);
    lastResult = { ...result, attempt, maxRetries: retries };
    if (!['failed'].includes(String(result.status))) break;
    if (attempt >= retries) break;
    if (backoffMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(backoffMs, 1_500)));
    }
    attempt += 1;
  }

  // ── Step-level audit (Phase 6 — deep SaaS sync) ─────────────────────────
  // Every node whose contract declares a write or external side-effect
  // generates an audit_log entry identical to the one produced by the
  // equivalent UI action.
  try {
    const contract = deps.getNodeContract(node.key);
    const sideEffects = contract.sideEffects ?? 'none';
    if (sideEffects === 'write' || sideEffects === 'external') {
      const finalResult = lastResult ?? { status: 'failed' };
      const action = `WORKFLOW_${String(node.key).toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
      const entityType = node.key.startsWith('case.') ? 'case'
        : node.key.startsWith('order.') ? 'order'
        : node.key.startsWith('payment.') ? 'payment'
        : node.key.startsWith('return.') ? 'return'
        : node.key.startsWith('approval.') ? 'approval'
        : node.key.startsWith('customer.') ? 'customer'
        : node.key.startsWith('message.') ? 'integration'
        : node.key.startsWith('ai.') || node.key.startsWith('agent.') ? 'agent_run'
        : 'workflow';
      const entityId = (
        context?.case?.id || context?.order?.id || context?.payment?.id ||
        context?.return?.id || context?.customer?.id || node.id
      );
      await deps.auditLog(
        { tenantId: scope.tenantId, workspaceId: scope.workspaceId },
        {
          actorId: scope.userId ?? 'workflow',
          action,
          entityType,
          entityId,
          metadata: {
            nodeKey: node.key,
            nodeLabel: node.label ?? null,
            nodeId: node.id,
            status: finalResult.status,
            error: finalResult.error ?? null,
            sideEffects,
            risk: contract.risk ?? 'low',
            attempt,
          },
        },
      );
    }
  } catch (auditErr: any) {
    deps.logger.warn('workflow step audit failed', {
      nodeId: node.id,
      key: node.key,
      error: String(auditErr?.message ?? auditErr),
    });
  }

  return lastResult ?? { status: 'failed', error: 'Node execution failed before producing a result', attempt, maxRetries: retries };
}

// ── Top-level BFS scheduler ─────────────────────────────────────────────────
//
// `executeWorkflow` is the canonical entry point for running a workflow
// version end to end. It was extracted from `server/routes/workflows.ts`
// (where it lived as `executeWorkflowVersion`) in Phase 4c — Turno 5/D2.
//
// The scheduler itself is pure; the side-effectful collaborators
// (validation, context construction, persistence, broadcasting, error-event
// dispatch) are passed in as `deps`. The route file builds the deps once
// and passes them into every call site that previously invoked
// `executeWorkflowVersion`.
//
// No behavior change vs the inline definition: idempotency replay, BFS
// fan-out, MAX_STEPS guard, audit + SSE broadcast on completion, and the
// post-failure `trigger.workflow_error` dispatch are byte-for-byte
// identical. The only mechanical difference is the use of `crypto.randomUUID`
// imported here instead of the shared route-level import.
//
// `getNodeContract` / repository singletons / sender clients remain in the
// route — only the scheduler logic moves.

import crypto from 'node:crypto';

export interface ExecuteWorkflowDeps {
  /** Validates the node + edge graph; throws statusCode=422 on hard error. */
  validateWorkflowDefinition: (
    nodes: any[],
    edges: any[],
  ) => { ok: boolean; nodes: any[]; edges: any[]; errors: string[]; warnings?: string[]; diagnostics?: any[] };
  /** Returns the start (trigger) node from an already-normalized list. */
  getStartNode: (nodes: any[]) => any | null;
  /** Returns the next nodes following currentNode given the workflow context. */
  pickNextNodes: (nodes: any[], edges: any[], currentNode: any, context: any) => any[];
  /** Builds the initial workflow context (case bundle, order, payment, etc). */
  buildWorkflowContext: (
    scope: { tenantId: string; workspaceId: string; userId?: string },
    payload: any,
  ) => Promise<any>;
  /** Per-node executor with retry + audit. */
  executeNodeWithRetry: (
    scope: { tenantId: string; workspaceId: string; userId?: string },
    node: any,
    context: any,
  ) => Promise<any>;
  /** Supabase admin client. RLS bypassed; the scheduler scopes all queries. */
  getSupabaseAdmin: () => any;
  /** Append-only audit writer for run-level events. */
  auditLog: (
    scope: { tenantId: string; workspaceId: string },
    entry: {
      actorId: string;
      action: string;
      entityType: string;
      entityId: string;
      metadata?: Record<string, any>;
    },
  ) => Promise<unknown>;
  /** SSE broadcaster — emits workflow:run:* events to subscribed tenants. */
  broadcastSSE: (tenantId: string, event: string, payload: Record<string, any>) => void;
  /** Cross-workflow event dispatcher (used for trigger.workflow_error). */
  executeWorkflowsByEvent?: (
    scope: { tenantId: string; workspaceId: string; userId?: string },
    eventType: string,
    payload: Record<string, any>,
  ) => Promise<any>;
  /** Logger used for non-fatal warnings (idempotency, dispatch failures). */
  logger: { info: (m: string, meta?: any) => void; warn: (m: string, meta?: any) => void };
}

export interface ExecuteWorkflowOptions {
  tenantId: string;
  workspaceId: string;
  userId?: string;
  workflowId: string;
  version: any;
  triggerPayload: any;
  triggerType?: string;
  retryOfRunId?: string | null;
}

export interface ExecuteWorkflowResult {
  id: string;
  status: string;
  error: string | null;
  steps: any[];
  retryOfRunId?: string | null;
}

export async function executeWorkflow(
  opts: ExecuteWorkflowOptions,
  deps: ExecuteWorkflowDeps,
): Promise<ExecuteWorkflowResult> {
  const {
    tenantId,
    workspaceId,
    userId,
    workflowId,
    version,
    triggerPayload,
    triggerType = 'manual',
    retryOfRunId = null,
  } = opts;

  const validation = deps.validateWorkflowDefinition(version.nodes ?? [], version.edges ?? []);
  if (!validation.ok) {
    const error: any = new Error('Workflow is not executable');
    error.statusCode = 422;
    error.validation = validation;
    throw error;
  }

  const supabase = deps.getSupabaseAdmin();
  const runId = crypto.randomUUID();
  const now = new Date().toISOString();
  const workflowContext = await deps.buildWorkflowContext(
    { tenantId, workspaceId, userId },
    triggerPayload ?? {},
  );
  const caseId = triggerPayload?.caseId ?? triggerPayload?.case_id ?? workflowContext.case?.id ?? null;

  // Idempotency: if the trigger payload carries a trace_id and a run already
  // exists for this version + trace_id, return that run instead of creating a
  // duplicate. This protects against double-fires from retries / cron sweeps.
  const traceId = triggerPayload?.trace_id ?? triggerPayload?.traceId ?? null;
  if (traceId && !retryOfRunId) {
    const { data: existing } = await supabase
      .from('workflow_runs')
      .select('id, status, error')
      .eq('tenant_id', tenantId)
      .eq('workflow_version_id', version.id)
      .eq('trigger_payload->>trace_id', String(traceId))
      .limit(1);
    if (existing && existing.length > 0) {
      const prior = existing[0];
      deps.logger.info('executeWorkflow: idempotent replay, returning existing run', {
        traceId, runId: prior.id, status: prior.status,
      });
      const { data: priorSteps } = await supabase
        .from('workflow_run_steps')
        .select('*')
        .eq('workflow_run_id', prior.id)
        .order('started_at', { ascending: true });
      return { id: prior.id, status: prior.status, error: prior.error ?? null, steps: priorSteps ?? [], retryOfRunId: null };
    }
  }

  const { error: runError } = await supabase.from('workflow_runs').insert({
    id: runId,
    workflow_version_id: version.id,
    case_id: caseId,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    trigger_type: triggerType,
    trigger_payload: triggerPayload ?? {},
    status: 'running',
    current_node_id: deps.getStartNode(validation.nodes)?.id ?? null,
    context: { dryRun: false, source: retryOfRunId ? 'workflow_retry' : 'workflow_api', retryOfRunId, workflowContext },
    started_at: now,
    ended_at: null,
    error: null,
  });
  if (runError) throw runError;

  // Broadcast run started
  deps.broadcastSSE(tenantId, 'workflow:run:started', {
    runId, workflowId: version.workflow_id ?? '', versionId: version.id,
    triggerType: triggerType ?? 'manual', startedAt: now,
  });

  const steps: any[] = [];
  // BFS queue: each entry carries the node plus the input data snapshot for that branch
  const queue: Array<{ node: any; branchInput: any; order: number }> = [
    { node: deps.getStartNode(validation.nodes), branchInput: triggerPayload ?? {}, order: 0 },
  ];
  const visited = new Set<string>();
  let finalStatus = 'completed';
  let finalError: string | null = null;
  const MAX_STEPS = validation.nodes.length * 4; // guard against runaway graphs

  while (queue.length > 0 && steps.length < MAX_STEPS) {
    const { node: currentNode, branchInput, order } = queue.shift()!;
    if (!currentNode || visited.has(currentNode.id)) continue;
    visited.add(currentNode.id);

    const startedAt = new Date().toISOString();
    const result = await deps.executeNodeWithRetry({ tenantId, workspaceId, userId }, currentNode, workflowContext);
    const endedAt = new Date().toISOString();

    const step = {
      id: crypto.randomUUID(),
      workflow_run_id: runId,
      node_id: currentNode.id,
      node_type: currentNode.type,
      status: result.status,
      input: order === 0 ? branchInput : { fromPreviousStep: true },
      output: result.output ?? {},
      started_at: startedAt,
      ended_at: endedAt,
      error: (result as any).error ?? null,
    };
    steps.push(step);

    workflowContext.lastOutput = result.output ?? null;
    workflowContext.lastNode = { id: currentNode.id, key: currentNode.key, label: currentNode.label, status: result.status };
    if (result.output && typeof result.output === 'object' && !Array.isArray(result.output)) {
      workflowContext.data = (result.output as any).data ?? result.output;
    }

    if (['failed', 'blocked', 'waiting_approval', 'waiting', 'stopped'].includes(result.status)) {
      // Blocking result: record final status, drain remaining queue as skipped
      finalStatus = result.status === 'waiting_approval' ? 'waiting' : result.status;
      finalError = (result as any).error ?? (result.output as any)?.reason ?? null;
      break;
    }

    // Enqueue next nodes (may be multiple for flow.branch fan-out)
    const nextNodes = deps.pickNextNodes(validation.nodes, validation.edges, currentNode, workflowContext);
    for (const nextNode of nextNodes) {
      if (!visited.has(nextNode.id)) {
        queue.push({ node: nextNode, branchInput: result.output ?? {}, order: order + 1 });
      }
    }
  }

  // Cycle detection: if queue still has items that were already visited
  if (steps.length >= MAX_STEPS) {
    finalStatus = 'failed';
    finalError = 'Workflow exceeded maximum step count — possible cycle detected';
  }

  if (steps.length > 0) {
    const { error: stepsError } = await supabase.from('workflow_run_steps').insert(steps);
    if (stepsError) throw stepsError;
  }

  const { error: updateRunError } = await supabase.from('workflow_runs').update({
    status: finalStatus,
    current_node_id: steps.at(-1)?.node_id ?? null,
    context: { dryRun: false, source: retryOfRunId ? 'workflow_retry' : 'workflow_api', retryOfRunId, workflowContext },
    ended_at: ['completed', 'failed', 'blocked', 'stopped'].includes(finalStatus) ? new Date().toISOString() : null,
    error: finalError,
  }).eq('id', runId).eq('tenant_id', tenantId).eq('workspace_id', workspaceId);
  if (updateRunError) throw updateRunError;

  await deps.auditLog({ tenantId, workspaceId }, {
    actorId: userId ?? 'system',
    action: finalStatus === 'completed' ? 'WORKFLOW_RUN_COMPLETED' : 'WORKFLOW_RUN_PAUSED',
    entityType: 'workflow',
    entityId: workflowId,
    metadata: { runId, retryOfRunId, stepCount: steps.length, finalStatus, finalError },
  });

  // Broadcast run completed/failed/paused
  deps.broadcastSSE(tenantId, 'workflow:run:updated', {
    runId,
    workflowId: workflowId ?? '',
    status: finalStatus,
    stepCount: steps.length,
    error: finalError,
    endedAt: new Date().toISOString(),
  });

  // Dispatch trigger.workflow_error event so error-handler workflows can react.
  // Skipped on retries to avoid loops.
  if (finalStatus === 'failed' && triggerType !== 'workflow.error' && !retryOfRunId && deps.executeWorkflowsByEvent) {
    try {
      await deps.executeWorkflowsByEvent(
        { tenantId, workspaceId, userId },
        'trigger.workflow_error',
        {
          sourceWorkflowId: workflowId,
          sourceRunId: runId,
          severity: 'error',
          error: finalError,
          failedNodeId: steps.find((s) => s.status === 'failed')?.node_id ?? null,
          failedNodeKey: steps.find((s) => s.status === 'failed')?.node_id ?? null,
        },
      );
    } catch (dispatchErr: any) {
      deps.logger.warn('workflow_error event dispatch failed', { runId, error: String(dispatchErr?.message ?? dispatchErr) });
    }
  }

  return { id: runId, status: finalStatus, error: finalError, steps, retryOfRunId };
}
