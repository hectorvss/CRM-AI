/**
 * server/runtime/adapters/flowScheduler.ts
 *
 * Adapter handlers for `flow.*` (and `delay`) node keys that are coupled
 * to the BFS scheduler in `server/runtime/workflowExecutor.ts`. They read
 * scheduler-side state from the workflow context (`__mergeInputs`,
 * `__bodyRunner`) or call back into the scheduler itself
 * (`flow.subworkflow`).
 *
 * Phase 4b — Turno 5/D2. Moved out of the inline executor in
 * `server/routes/workflows.ts`. Each handler is a byte-for-byte
 * transcription of the inline branch it replaces.
 *
 * Cross-module dependencies
 * ─────────────────────────
 * `flow.subworkflow` and the lookup of workflow versions for it require
 * the workflow repository + the top-level scheduler. To avoid pulling
 * either of those into this module (the repository would create a cycle
 * via `server/data/index.ts`; the scheduler lives in `workflowExecutor.ts`
 * and importing it directly is fine but the repository is not), we expose
 * `registerSchedulerHooks()`. The route file calls it once at module load
 * with concrete `getDefinition` / `getVersion` / `getLatestVersion` /
 * `runSubworkflow` callbacks. Until the hooks are registered the handler
 * returns a `failed` result so misconfiguration surfaces loudly.
 *
 * No behavior change vs the inline definitions previously in
 * `server/routes/workflows.ts`.
 */

import type { NodeAdapter } from '../workflowExecutor.js';
import {
  asArray,
  cloneJson,
  parseMaybeJsonObject,
  readContextPath,
} from '../nodeHelpers.js';
import { logger } from '../../utils/logger.js';

// ── Cross-module hook registration ──────────────────────────────────────────
export interface SchedulerHooks {
  /** Resolve a workflow definition by id, scoped by tenant + workspace. */
  getDefinition: (
    id: string,
    tenantId: string,
    workspaceId: string,
  ) => Promise<any | null>;
  /** Resolve a specific workflow version by id, scoped by tenant. */
  getVersion: (id: string, scope: { tenantId: string }) => Promise<any | null>;
  /** Resolve the latest version for a definition id, scoped by tenant. */
  getLatestVersion: (
    definitionId: string,
    scope: { tenantId: string },
  ) => Promise<any | null>;
  /** Recursive call into the BFS scheduler for `flow.subworkflow`. */
  runSubworkflow: (opts: {
    tenantId: string;
    workspaceId: string;
    userId?: string;
    workflowId: string;
    version: any;
    triggerPayload: any;
    triggerType: string;
  }) => Promise<{ id: string; status: string; error?: string | null }>;
}

let hooks: SchedulerHooks | null = null;

export function registerSchedulerHooks(impl: SchedulerHooks) {
  hooks = impl;
}

function requireHooks(handlerName: string): SchedulerHooks {
  if (!hooks) {
    throw new Error(
      `flowScheduler: ${handlerName} called before registerSchedulerHooks(); ` +
      `the route file must call it once at startup.`,
    );
  }
  return hooks;
}

/** Parse a human duration string ("2h", "30m", "1d") into an ISO timestamp. */
function resolveDelayUntil(duration: string): string | null {
  const str = String(duration).trim().toLowerCase();
  const match = str.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)$/);
  if (!match) return null;
  const amount = parseFloat(match[1]);
  const unit = match[2];
  const ms = unit === 'ms' ? amount
    : unit === 's'  ? amount * 1_000
    : unit === 'm'  ? amount * 60_000
    : unit === 'h'  ? amount * 3_600_000
    : unit === 'd'  ? amount * 86_400_000
    : unit === 'w'  ? amount * 604_800_000
    : 0;
  if (!ms) return null;
  return new Date(Date.now() + ms).toISOString();
}

// ── flow.wait / delay ──────────────────────────────────────────────────────
const flowWait: NodeAdapter = async ({ context }, _node, config) => {
  const duration = config.duration || config.timeout || null;
  // Store delay expiry in context so the scheduler can resume at the right time.
  const delayUntil = duration ? resolveDelayUntil(duration) : null;
  context.delayUntil = delayUntil;
  return {
    status: 'waiting',
    output: { delay: duration || 'manual_resume', delayUntil },
  };
};

// ── flow.merge ─────────────────────────────────────────────────────────────
// Bug-2 fix: when the scheduler has aggregated upstream branch outputs into
// `context.__mergeInputs` (Map<sourceId, output>), expose them as
// `output.merged.from_<sourceId>`. The scheduler is responsible for not
// firing this node until ALL incoming edges have arrived. If no merge inputs
// have been seeded (legacy / single-incoming caller) we degenerate to a
// passthrough.
const flowMerge: NodeAdapter = async ({ context }, _node, config) => {
  const inputs = context.__mergeInputs;
  const merged: Record<string, any> = {};
  if (inputs && typeof inputs === 'object') {
    for (const [sourceId, payload] of Object.entries(inputs)) {
      merged[`from_${sourceId}`] = payload;
    }
  }
  return {
    status: 'completed',
    output: {
      merged: Object.keys(merged).length > 0 ? merged : { passthrough: true },
      mode: config.mode || 'wait-all',
      sources: Object.keys(merged),
    },
  };
};

// ── flow.loop ──────────────────────────────────────────────────────────────
const flowLoop: NodeAdapter = async ({ context }, node, config) => {
  // Resolve the items array. Accepts a context path ("steps.fetch.output.items"),
  // a JSONPath-ish "$.steps.fetch.output.items", or a literal array via config.items.
  const rawSource = config.items ?? config.source ?? 'data.items';
  let resolvedItems: any;
  if (Array.isArray(rawSource)) {
    resolvedItems = rawSource;
  } else if (typeof rawSource === 'string') {
    const cleaned = rawSource.replace(/^\$\.?/, '');
    resolvedItems = readContextPath(context, cleaned);
    if (resolvedItems == null) resolvedItems = asArray(rawSource);
  } else {
    resolvedItems = rawSource;
  }
  if (!Array.isArray(resolvedItems)) {
    return {
      status: 'failed',
      error: `flow.loop: el campo "items" no resolvió a un array (recibido ${typeof resolvedItems}).`,
    } as any;
  }
  const items = resolvedItems;
  const maxIterations = Math.max(1, Number(config.maxIterations || config.max_iterations || 1000));
  const truncated = items.length > maxIterations;
  const sliced = truncated ? items.slice(0, maxIterations) : items;
  logger.info('flow.loop start', { nodeId: node.id, count: sliced.length, maxIterations, truncated });

  const aggregated: any[] = [];
  let failures = 0;
  // Bug-1 fix: if the scheduler has provided a body runner via
  // `context.__bodyRunner`, invoke it per item so downstream `body`-handle
  // nodes actually execute once per iteration. The runner walks the body
  // sub-graph and returns the terminal step's output. When no runner is
  // wired (legacy / pre-fan-out callers), we fall back to the previous
  // snapshot-only behaviour so existing tests keep passing.
  const bodyRunner: ((loopBinding: any) => Promise<any>) | undefined =
    typeof context.__bodyRunner === 'function' ? context.__bodyRunner : undefined;
  for (let index = 0; index < sliced.length; index += 1) {
    const item = sliced[index];
    context.loop = { item, index, count: sliced.length, maxIterations };
    try {
      if (bodyRunner) {
        const bodyResult = await bodyRunner({ item, index, count: sliced.length });
        const bodyOutput = bodyResult?.output ?? bodyResult ?? {};
        const bodyStatus = bodyResult?.status ?? 'completed';
        const ok = bodyStatus !== 'failed';
        if (!ok) failures += 1;
        aggregated.push({
          index,
          item,
          ok,
          status: bodyStatus,
          output: bodyOutput,
          snapshot: cloneJson(context.data ?? {}),
          ...(bodyResult?.error ? { error: bodyResult.error } : {}),
        });
      } else {
        aggregated.push({ index, item, ok: true, snapshot: cloneJson(context.data ?? {}) });
      }
    } catch (err: any) {
      failures += 1;
      aggregated.push({ index, item, ok: false, error: err?.message ?? String(err) });
      logger.warn('flow.loop iteration failed', { nodeId: node.id, index, error: err?.message ?? String(err) });
    }
  }

  context.loop = { items: sliced, count: sliced.length, maxIterations, truncated, completed: true };
  context.data = {
    ...(context.data && typeof context.data === 'object' ? context.data : {}),
    [String(config.target || 'loopResults')]: aggregated,
  };
  logger.info('flow.loop done', { nodeId: node.id, count: sliced.length, failures, truncated });
  return {
    status: failures > 0 && failures === sliced.length ? 'failed' : 'completed',
    output: {
      looped: true,
      count: sliced.length,
      truncated,
      failures,
      items: aggregated,
      target: config.target || 'loopResults',
    },
    ...(failures > 0 && failures === sliced.length
      ? { error: `flow.loop: todas las ${sliced.length} iteraciones fallaron.` }
      : {}),
  } as any;
};

// ── flow.subworkflow ───────────────────────────────────────────────────────
// Pre-extraction position equivalence: the inline branch lived *after* the
// second simulation gate at line 980 of routes/workflows.ts which short-
// circuited any node with sideEffects!='none' under __simulation. The
// adapter dispatch path bypasses that second gate (the first gate at line
// 884 deliberately exempts `flow.*`), so we honor the simulation flag here
// to preserve the prior dry-run shape — recursion would otherwise leak.
const flowSubworkflow: NodeAdapter = async ({ scope, context }, node, config) => {
  if (context.__simulation) {
    return {
      status: 'completed',
      output: {
        simulated: true,
        key: node.key,
        label: node.label,
        sideEffects: 'external',
        risk: 'medium',
        subWorkflowId: config.workflow || config.workflowId || null,
      },
    };
  }
  const h = requireHooks('flow.subworkflow');
  const subWorkflowId = config.workflow || config.workflowId || null;
  if (!subWorkflowId) return { status: 'failed', error: 'flow.subworkflow requires workflow id' } as any;
  const definition = await h.getDefinition(subWorkflowId, scope.tenantId, scope.workspaceId);
  if (!definition) return { status: 'failed', error: 'Sub-workflow not found' } as any;
  const version = definition.current_version_id
    ? await h.getVersion(definition.current_version_id, { tenantId: scope.tenantId })
    : await h.getLatestVersion(definition.id, { tenantId: scope.tenantId });
  if (!version) return { status: 'failed', error: 'Sub-workflow has no version' } as any;
  const nestedDepth = Number(context.__subworkflowDepth || 0);
  if (nestedDepth >= 3) {
    return {
      status: 'blocked',
      output: { reason: 'Sub-workflow nesting limit reached', subWorkflowId },
    };
  }
  const result = await h.runSubworkflow({
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    userId: scope.userId,
    workflowId: definition.id,
    version,
    triggerPayload: {
      ...(parseMaybeJsonObject(config.input) || {}),
      parentWorkflowNodeId: node.id,
      parentContext: {
        caseId: context.case?.id,
        orderId: context.order?.id,
        paymentId: context.payment?.id,
        returnId: context.return?.id,
        data: context.data,
      },
      __subworkflowDepth: nestedDepth + 1,
    },
    triggerType: 'subworkflow',
  });
  context.subworkflow = { subWorkflowId, runId: result.id, status: result.status };
  return {
    status: result.status === 'completed' ? 'completed' : 'waiting',
    output: context.subworkflow,
    error: result.error ?? null,
  } as any;
};

// ── Registry ───────────────────────────────────────────────────────────────
//
// `flow.retry` retry-policy semantics live in the per-node retry wrapper
// (`executeNodeWithRetry` in workflowExecutor.ts) — there is no inline
// branch for the key itself. So the registry only exposes the 5 keys that
// had inline implementations.
export const flowSchedulerAdapters: Record<string, NodeAdapter> = {
  'flow.wait': flowWait,
  'delay': flowWait,
  'flow.merge': flowMerge,
  'flow.loop': flowLoop,
  'flow.subworkflow': flowSubworkflow,
};
