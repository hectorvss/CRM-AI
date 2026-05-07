/**
 * tests/workflows-runtime/harness.ts
 *
 * Minimal in-memory harness for driving `executeWorkflowNode` from unit tests.
 *
 * Scope (Phase A)
 * ───────────────
 * Just enough to:
 *   - construct a `WorkflowServices` bundle backed by in-memory mocks
 *   - call the real `executeWorkflowNode` for one node at a time
 *   - walk a small node graph in topological-ish order so a `flow.loop`
 *     bug-1 test can demonstrate red → green
 *
 * This harness is INTENTIONALLY NOT a re-implementation of
 * `executeWorkflowVersion` (the real BFS scheduler). It's just enough to
 * exercise the executor without spinning up Express + Supabase.
 *
 * NOTE on imports
 * ───────────────
 * `server/routes/workflows.ts` side-imports the entire HTTP stack at module
 * load. To keep the harness usable, set the following env vars before
 * importing it (the test files do this via `dotenv/config`):
 *
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — can be dummy values; the
 *   harness's mock supabase client is used at runtime, but the singleton
 *   loader inside `server/db/supabase.ts` reads these at first call.
 */

import 'dotenv/config';

// Set safe dummy env BEFORE importing the executor module so the
// supabase singleton loader doesn't throw on missing config in CI.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-key-for-harness';

import { executeWorkflowNode } from '../../server/routes/workflows.js';
import type { WorkflowServices, ChannelSendResultLite } from '../../server/runtime/workflowServices.js';

// ── Mock supabase ────────────────────────────────────────────────────────────
// In-memory map-backed fake. Implements only the fluent surface the executor
// pilot nodes touch. Phase B will need to grow this.
function buildMockSupabase(): any {
  const tables = new Map<string, any[]>();
  // Per-table primary key spec — used to simulate Postgres 23505 PK conflicts.
  const pkSpec: Record<string, string[]> = {
    workflow_runtime_state: ['tenant_id', 'workspace_id', 'key_namespace', 'key'],
  };
  const matchesPk = (existing: any, row: any, pk: string[]) =>
    pk.every((col) => existing[col] === row[col]);

  const queryBuilder = (tableName: string) => {
    const filters: Array<{ col: string; val: any }> = [];
    let pendingUpdate: any = null;
    let pendingSelect = false;
    let pendingDelete = false;
    const proxy: any = {
      _tableName: tableName,
      insert(row: any) {
        const list = tables.get(tableName) ?? [];
        const rows = Array.isArray(row) ? row : [row];
        const pk = pkSpec[tableName];
        if (pk) {
          for (const r of rows) {
            if (list.some((existing) => matchesPk(existing, r, pk))) {
              return Promise.resolve({
                data: null,
                error: { code: '23505', message: 'duplicate key value violates unique constraint' },
              });
            }
          }
        }
        list.push(...rows);
        tables.set(tableName, list);
        return Promise.resolve({ data: rows, error: null });
      },
      upsert(row: any) {
        const list = tables.get(tableName) ?? [];
        const rows = Array.isArray(row) ? row : [row];
        const pk = pkSpec[tableName];
        if (pk) {
          for (const r of rows) {
            const idx = list.findIndex((existing) => matchesPk(existing, r, pk));
            if (idx >= 0) list[idx] = { ...list[idx], ...r };
            else list.push(r);
          }
        } else {
          list.push(...rows);
        }
        tables.set(tableName, list);
        return Promise.resolve({ data: rows, error: null });
      },
      update(patch: any) {
        pendingUpdate = patch;
        return proxy;
      },
      delete() {
        pendingDelete = true;
        return proxy;
      },
      select(_cols?: string) {
        pendingSelect = true;
        return proxy;
      },
      eq(col: string, val: any) {
        filters.push({ col, val });
        return proxy;
      },
      neq(_col: string, _val: any) {
        return proxy;
      },
      in(_col: string, _vals: any[]) {
        return proxy;
      },
      order() {
        return proxy;
      },
      limit() {
        return proxy;
      },
      single() {
        const list = tables.get(tableName) ?? [];
        const matches = list.filter((r) => filters.every((f) => r[f.col] === f.val));
        return Promise.resolve({ data: matches[0] ?? null, error: null });
      },
      maybeSingle() {
        const list = tables.get(tableName) ?? [];
        const matches = list.filter((r) => filters.every((f) => r[f.col] === f.val));
        return Promise.resolve({ data: matches[0] ?? null, error: null });
      },
      then(resolve: any) {
        const list = tables.get(tableName) ?? [];
        const matches = filters.length
          ? list.filter((r) => filters.every((f) => r[f.col] === f.val))
          : list;
        if (pendingUpdate) {
          for (const row of matches) Object.assign(row, pendingUpdate);
          return resolve({ data: matches, error: null });
        }
        if (pendingDelete) {
          const remaining = list.filter((r) => !matches.includes(r));
          tables.set(tableName, remaining);
          return resolve({ data: matches, error: null });
        }
        if (pendingSelect) {
          return resolve({ data: matches, error: null });
        }
        return resolve({ data: matches, error: null });
      },
    };
    return proxy;
  };
  return {
    from: (table: string) => queryBuilder(table),
    rpc: () => Promise.resolve({ data: null, error: null }),
    _tables: tables,
  };
}

// ── Mock channels ────────────────────────────────────────────────────────────
export interface ChannelCallRecord {
  channel: 'email' | 'sms' | 'whatsapp';
  to: string;
  subject?: string;
  content: string;
  ref?: string;
}

export function buildMockChannels(records: ChannelCallRecord[]) {
  return {
    email: async (
      to: string,
      subject: string,
      content: string,
      ref?: string,
    ): Promise<ChannelSendResultLite> => {
      records.push({ channel: 'email', to, subject, content, ref });
      return { messageId: `mock-email-${records.length}`, simulated: true };
    },
    sms: async (
      to: string,
      content: string,
      ref?: string,
    ): Promise<ChannelSendResultLite> => {
      records.push({ channel: 'sms', to, content, ref });
      return { messageId: `mock-sms-${records.length}`, simulated: true };
    },
    whatsapp: async (
      to: string,
      content: string,
      ref?: string,
    ): Promise<ChannelSendResultLite> => {
      records.push({ channel: 'whatsapp', to, content, ref });
      return { messageId: `mock-whatsapp-${records.length}`, simulated: true };
    },
  };
}

// ── Default services builder ────────────────────────────────────────────────
export function buildMockServices(
  overrides: Partial<WorkflowServices> = {},
): WorkflowServices {
  const channelRecords: ChannelCallRecord[] = [];
  const fixedNow = new Date('2026-05-07T12:00:00.000Z');

  const defaults: WorkflowServices = {
    supabase: buildMockSupabase(),
    integrations: {
      get: () => undefined,
      has: () => false,
    },
    channels: buildMockChannels(channelRecords),
    fetchImpl: (async () =>
      new Response(JSON.stringify({}), { status: 200 })) as unknown as typeof fetch,
    auditLog: async () => {},
    aiKeys: {},
    clock: {
      now: () => fixedNow,
      sleep: async () => {},
    },
  };

  return { ...defaults, ...overrides };
}

// ── Single-node runner ──────────────────────────────────────────────────────
export interface NodeRunResult {
  status: string;
  output?: any;
  error?: string;
  [key: string]: any;
}

export async function runNode({
  node,
  context,
  services,
  scope,
}: {
  node: any;
  context: any;
  services?: Partial<WorkflowServices>;
  scope?: { tenantId: string; workspaceId: string; userId?: string };
}): Promise<NodeRunResult> {
  const builtServices = buildMockServices(services);
  const runScope = scope ?? {
    tenantId: 'tenant-test',
    workspaceId: 'ws-test',
    userId: 'user-test',
  };
  return (await executeWorkflowNode(runScope, node, context, builtServices)) as NodeRunResult;
}

// ── Mini graph runner ───────────────────────────────────────────────────────
// Lightweight BFS that mirrors what `executeWorkflowVersion` does: walk
// edges in declaration order, calling `executeWorkflowNode` for each
// reachable node. Does NOT implement the full retry / branching / SSE /
// persistence machinery — just enough so a single `flow.loop` node (with
// `body` and `iterate` source handles) can be exercised.
export interface WorkflowGraph {
  nodes: any[];
  edges: Array<{ source: string; target: string; sourceHandle?: string }>;
}

export interface WorkflowRunResult {
  finalStatus: string;
  steps: Record<string, NodeRunResult>;
  context: any;
  visited: string[];
  channelRecords: ChannelCallRecord[];
}

export async function runWorkflow({
  workflow,
  trigger = {},
  services,
  scope,
}: {
  workflow: WorkflowGraph;
  trigger?: any;
  services?: Partial<WorkflowServices>;
  scope?: { tenantId: string; workspaceId: string; userId?: string };
}): Promise<WorkflowRunResult> {
  const channelRecords: ChannelCallRecord[] = [];
  const builtServices = buildMockServices({
    ...services,
    channels: services?.channels ?? buildMockChannels(channelRecords),
  });
  const runScope = scope ?? {
    tenantId: 'tenant-test',
    workspaceId: 'ws-test',
    userId: 'user-test',
  };

  // Shared context — mirrors what `buildWorkflowContext` would produce, but
  // bare-bones: just `data` + the trigger payload.
  const context: any = {
    data: { ...(trigger ?? {}) },
    trigger,
    customer: trigger?.customer ?? {},
    case: trigger?.case ?? null,
    order: trigger?.order ?? null,
    payment: trigger?.payment ?? null,
    return: trigger?.return ?? null,
  };

  const steps: Record<string, NodeRunResult> = {};
  const visited: string[] = [];
  const queue: string[] = [];

  // Find entry node: first one with no incoming edges, or first node
  // whose type is 'trigger', else just nodes[0].
  const incoming = new Map<string, number>();
  for (const n of workflow.nodes) incoming.set(n.id, 0);
  for (const e of workflow.edges) {
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
  }
  const entry =
    workflow.nodes.find((n) => incoming.get(n.id) === 0) ?? workflow.nodes[0];
  if (entry) queue.push(entry.id);

  let finalStatus = 'completed';
  const MAX_HOPS = workflow.nodes.length * 8;
  let hops = 0;

  // Pre-compute set of nodes reachable only via a `body` handle from any
  // `flow.loop` — these are skipped in the main BFS because the loop
  // handler executes them per iteration.
  const loopBodyNodeIds = new Set<string>();
  const loopBodyEntryByLoop = new Map<string, string[]>();
  for (const n of workflow.nodes) {
    if (n.key === 'flow.loop') {
      const bodyEntries = workflow.edges
        .filter((e) => e.source === n.id && e.sourceHandle === 'body')
        .map((e) => e.target);
      loopBodyEntryByLoop.set(n.id, bodyEntries);
      // Walk transitively from each body entry; everything reachable is owned
      // by the loop until we hit a node that is also reachable from non-body
      // edges. For simplicity we mark the direct body subgraph following
      // non-`body`-handle out-edges as well (typical loop body has its own
      // chain; the test workflows are small and acyclic).
      const stack = [...bodyEntries];
      while (stack.length) {
        const cur = stack.pop()!;
        if (loopBodyNodeIds.has(cur)) continue;
        loopBodyNodeIds.add(cur);
        for (const e of workflow.edges) {
          if (e.source === cur && e.sourceHandle !== 'done') stack.push(e.target);
        }
      }
    }
  }

  // Merge sync state (Bug-2): track upstream arrivals into each merge node.
  const expectedIncomingByMerge = new Map<string, number>();
  const arrivedByMerge = new Map<string, Map<string, any>>();
  for (const n of workflow.nodes) {
    if (n.key === 'flow.merge') {
      const count = workflow.edges.filter((e) => e.target === n.id).length;
      expectedIncomingByMerge.set(n.id, count);
      arrivedByMerge.set(n.id, new Map());
    }
  }

  // Helper to run a sub-branch of nodes given an entry id list. Used by
  // the body runner injected into flow.loop. Sequentially executes each
  // node; returns the final node's result.
  async function runBranch(entryIds: string[]): Promise<NodeRunResult> {
    let lastResult: NodeRunResult = { status: 'completed', output: {} };
    const localQueue = [...entryIds];
    const localVisited = new Set<string>();
    while (localQueue.length) {
      const id = localQueue.shift()!;
      if (localVisited.has(id)) continue;
      localVisited.add(id);
      const node = workflow.nodes.find((n) => n.id === id);
      if (!node) continue;
      lastResult = (await executeWorkflowNode(
        runScope,
        node,
        context,
        builtServices,
      )) as NodeRunResult;
      if (lastResult.status === 'failed') break;
      const out = workflow.edges.filter(
        (e) => e.source === id && e.sourceHandle !== 'done',
      );
      for (const e of out) localQueue.push(e.target);
    }
    return lastResult;
  }

  while (queue.length > 0 && hops < MAX_HOPS) {
    hops += 1;
    const id = queue.shift()!;
    if (visited.includes(id)) continue;

    // Skip body-only nodes in main BFS — the loop handler will execute them.
    if (loopBodyNodeIds.has(id)) continue;

    const node = workflow.nodes.find((n) => n.id === id);
    if (!node) continue;

    // Bug-2: defer flow.merge until all upstream branches have arrived.
    if (node.key === 'flow.merge') {
      const expected = expectedIncomingByMerge.get(id) ?? 0;
      const arrived = arrivedByMerge.get(id)!;
      if (arrived.size < expected) {
        // Not yet ready — re-queue at the back and continue.
        queue.push(id);
        continue;
      }
      // All upstream arrived → seed merge inputs into context for handler.
      context.__mergeInputs = Object.fromEntries(arrived.entries());
    }

    visited.push(id);

    // Bug-1: when about to execute a flow.loop, install a body runner.
    if (node.key === 'flow.loop') {
      const bodyEntries = loopBodyEntryByLoop.get(id) ?? [];
      context.__bodyRunner = async (_binding: any) => {
        return await runBranch(bodyEntries);
      };
    }

    const result = (await executeWorkflowNode(
      runScope,
      node,
      context,
      builtServices,
    )) as NodeRunResult;

    // Cleanup transient context wiring.
    if (node.key === 'flow.loop') delete context.__bodyRunner;
    if (node.key === 'flow.merge') delete context.__mergeInputs;

    steps[id] = result;

    if (result.status === 'failed') {
      finalStatus = 'failed';
      break;
    }
    if (result.status === 'skipped' || result.status === 'waiting') {
      continue;
    }

    // Enqueue downstream nodes. Follow `done` handle for loops if present;
    // otherwise follow all non-`body` outgoing edges. Body edges are
    // handled by the loop's body runner.
    const outgoing = workflow.edges.filter(
      (e) => e.source === id && e.sourceHandle !== 'body',
    );
    for (const e of outgoing) {
      // For flow.merge tracking: record this node's output as the upstream
      // arrival into the target merge node.
      const targetNode = workflow.nodes.find((n) => n.id === e.target);
      if (targetNode?.key === 'flow.merge') {
        const arrived = arrivedByMerge.get(e.target);
        if (arrived) arrived.set(id, result.output ?? {});
      }
      queue.push(e.target);
    }
  }

  return { finalStatus, steps, context, visited, channelRecords };
}
