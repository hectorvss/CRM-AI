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
  const queryBuilder = (tableName: string) => {
    const ops: Array<{ kind: string; args: any[] }> = [];
    const proxy: any = {
      _tableName: tableName,
      insert(row: any) {
        const list = tables.get(tableName) ?? [];
        const rows = Array.isArray(row) ? row : [row];
        list.push(...rows);
        tables.set(tableName, list);
        return Promise.resolve({ data: rows, error: null });
      },
      upsert(row: any) {
        return proxy.insert(row);
      },
      update(patch: any) {
        ops.push({ kind: 'update', args: [patch] });
        return proxy;
      },
      delete() {
        ops.push({ kind: 'delete', args: [] });
        return proxy;
      },
      select(_cols?: string) {
        ops.push({ kind: 'select', args: [_cols] });
        return proxy;
      },
      eq(_col: string, _val: any) {
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
        return Promise.resolve({ data: null, error: null });
      },
      maybeSingle() {
        return Promise.resolve({ data: null, error: null });
      },
      then(resolve: any) {
        return resolve({ data: tables.get(tableName) ?? [], error: null });
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
  const MAX_HOPS = workflow.nodes.length * 4;
  let hops = 0;

  while (queue.length > 0 && hops < MAX_HOPS) {
    hops += 1;
    const id = queue.shift()!;
    if (visited.includes(id)) continue;
    visited.push(id);
    const node = workflow.nodes.find((n) => n.id === id);
    if (!node) continue;

    const result = (await executeWorkflowNode(
      runScope,
      node,
      context,
      builtServices,
    )) as NodeRunResult;
    steps[id] = result;

    if (result.status === 'failed') {
      finalStatus = 'failed';
      break;
    }
    if (result.status === 'skipped' || result.status === 'waiting') {
      continue;
    }

    // Enqueue downstream nodes. For `flow.loop` we follow the `body`
    // handle expecting fan-out; otherwise follow all outgoing edges.
    const outgoing = workflow.edges.filter((e) => e.source === id);
    for (const e of outgoing) queue.push(e.target);
  }

  return { finalStatus, steps, context, visited, channelRecords };
}
