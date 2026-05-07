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
