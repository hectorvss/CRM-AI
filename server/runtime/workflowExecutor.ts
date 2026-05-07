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
