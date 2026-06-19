/**
 * server/runtime/adapters/flow.ts
 *
 * Adapter handlers for self-contained `flow.*` and `stop` node keys.
 *
 * Phase 2 of the workflow extraction (Turno 5/D2). Migrated handlers in
 * this file are byte-for-byte transcriptions of the inline branches that
 * previously lived in `server/routes/workflows.ts` inside
 * `executeWorkflowNode`. The route's executor now early-dispatches to
 * `ALL_ADAPTERS[node.key]` if a handler exists here.
 *
 * Scope of this first cut
 * ───────────────────────
 * Only handlers that have no cross-dependency on the BFS scheduler or
 * the `executeWorkflowVersion` helper:
 *
 *   - flow.if         (mutates context.condition)
 *   - flow.compare    (mutates context.condition)
 *   - flow.branch     (mutates context.condition)
 *   - flow.switch     (mutates context.condition)
 *   - flow.filter     (mutates context.condition + context.data)
 *   - flow.note       (pure)
 *   - flow.noop       (pure)
 *   - flow.stop_error (pure)
 *   - stop            (pure)
 *
 * Deferred to a later turn (need scheduler-side hooks):
 *   - flow.merge      (consumes __mergeInputs from BFS scheduler)
 *   - flow.loop       (consumes __bodyRunner from BFS scheduler)
 *   - flow.subworkflow (calls back into executeWorkflowVersion)
 *   - flow.wait / delay (interact with scheduler waiting state)
 *   - flow.retry      (retry semantics live in executeWorkflowNodeWithRetry)
 *
 * No behavior change: each handler returns exactly what the inline branch
 * used to return.
 */

import type { NodeAdapter } from '../workflowExecutor.js';
import {
  asArray,
  compareValues,
  readContextPath,
  resolveTemplateValue,
} from '../nodeHelpers.js';

// ── flow.if ────────────────────────────────────────────────────────────────
// Source: server/routes/workflows.ts (was inside `if (node.type === 'condition')`)
const flowIf: NodeAdapter = async ({ context }, _node, config) => {
  const left = readContextPath(context, config.field || config.source || config.path || 'data.value');
  const right = config.value ?? config.right ?? config.expected ?? config.compareTo ?? config.comparison;
  const operator = config.operator ?? config.comparisonOperator ?? '==';
  const result = compareValues(left, operator, right);
  context.condition = { result, left, operator, right };
  return { status: result ? 'completed' : 'skipped', output: context.condition };
};

// ── flow.filter ────────────────────────────────────────────────────────────
const flowFilter: NodeAdapter = async ({ context }, _node, config) => {
  const source = readContextPath(context, config.source || config.field || 'data.items');
  const list = asArray(source);
  const field = config.field || 'value';
  const operator = config.operator || '==';
  const expected = config.value ?? config.expected ?? config.right ?? config.comparison;
  const filtered = list.filter((item) => {
    const candidate = item && typeof item === 'object' ? readContextPath(item, field) ?? item[field] : item;
    return compareValues(candidate, operator, expected);
  });
  context.data = Array.isArray(source)
    ? filtered
    : { ...(source && typeof source === 'object' ? source : {}), items: filtered };
  context.condition = { result: filtered.length > 0, filteredCount: filtered.length, operator, expected };
  return {
    status: filtered.length > 0 ? 'completed' : 'skipped',
    output: { ...context.condition, items: filtered },
  };
};

// ── flow.compare ───────────────────────────────────────────────────────────
const flowCompare: NodeAdapter = async ({ context }, _node, config) => {
  const left = readContextPath(context, config.left || config.sourceA || config.fieldA || config.field || 'data.left');
  const right = readContextPath(context, config.right || config.sourceB || config.fieldB || 'data.right')
    ?? config.value
    ?? config.expected;
  const operator = config.operator ?? '==';
  const result = compareValues(left, operator, right);
  context.condition = { result, left, operator, right };
  return { status: 'completed', output: context.condition };
};

// ── flow.branch ────────────────────────────────────────────────────────────
const flowBranch: NodeAdapter = async ({ context }, _node, config) => {
  const branches = String(config.branches || config.routes || config.options || 'true|false')
    .split('|')
    .map((value: string) => value.trim())
    .filter(Boolean);
  context.condition = { result: true, route: branches[0] ?? 'true', branches };
  return { status: 'completed', output: context.condition };
};

// ── flow.switch ────────────────────────────────────────────────────────────
const flowSwitch: NodeAdapter = async ({ context }, _node, config) => {
  const source = config.field || config.branch || 'customer.segment';
  const rawRoute = String(readContextPath(context, source) ?? config.value ?? config.comparison ?? 'other').trim();
  const branches = String(config.comparison || config.branches || config.value || 'vip|standard|other')
    .split('|')
    .map((value: string) => value.trim())
    .filter(Boolean);
  const normalizedRoute = branches.find((branch: string) => branch.toLowerCase() === rawRoute.toLowerCase())
    ?? ((branches.at(-1) ?? rawRoute) || 'other');
  context.condition = {
    result: normalizedRoute !== (branches.at(-1) ?? 'other'),
    route: normalizedRoute,
    left: rawRoute,
    branches,
  };
  return {
    status: normalizedRoute === (branches.at(-1) ?? 'other') ? 'skipped' : 'completed',
    output: context.condition,
  };
};

// ── flow.note ──────────────────────────────────────────────────────────────
// Source: server/routes/workflows.ts ~line 1078 (was inside the `data.*` block,
// but had no actual data-block dependency — purely a passthrough).
const flowNote: NodeAdapter = async (_ctx, _node, config) => {
  return { status: 'completed', output: { note: config.content, color: config.color || 'yellow' } };
};

// ── flow.noop ──────────────────────────────────────────────────────────────
const flowNoop: NodeAdapter = async () => {
  return { status: 'completed', output: { passedThrough: true } };
};

// ── flow.stop_error ────────────────────────────────────────────────────────
const flowStopError: NodeAdapter = async (_ctx, _node, config) => {
  return {
    status: 'failed',
    error: config.errorMessage || 'Stopped by flow.stop_error',
    output: { stopped: true },
  } as any;
};

// ── stop ───────────────────────────────────────────────────────────────────
const stopAdapter: NodeAdapter = async () => {
  return { status: 'stopped' as any, output: { stopped: true } };
};

// ── Registry ───────────────────────────────────────────────────────────────
export const flowAdapters: Record<string, NodeAdapter> = {
  'flow.if': flowIf,
  'flow.filter': flowFilter,
  'flow.compare': flowCompare,
  'flow.branch': flowBranch,
  'flow.switch': flowSwitch,
  'flow.note': flowNote,
  'flow.noop': flowNoop,
  'flow.stop_error': flowStopError,
  'stop': stopAdapter,
};
