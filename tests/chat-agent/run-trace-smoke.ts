/**
 * tests/chat-agent/run-trace-smoke.ts
 *
 * Phase-3 (observability) checks, WITHOUT an LLM key:
 *   - a turn that runs a tool writes an ExecutionTrace to super_agent_traces,
 *     keyed by session_id = conversationId, with an untruncated span per tool.
 *   - listTracesForSession returns it; getTraceMetrics counts it.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Run:
 *   npx tsx tests/chat-agent/run-trace-smoke.ts
 */
import assert from 'node:assert/strict';
import { registerAllTools } from '../../server/agents/planEngine/tools/index.js';
import { toolRegistry } from '../../server/agents/planEngine/registry.js';
import { runChatAgent } from '../../server/agents/chatAgent/index.js';
import { _setProvidersForTests } from '../../server/agents/chatAgent/providers/index.js';
import type { ChatLLMProvider } from '../../server/agents/chatAgent/providers/types.js';
import { listTracesForSession, getTraceMetrics } from '../../server/agents/planEngine/traceRepository.js';
import { deleteConversation, type AgentScope } from '../../server/data/agentConversations.js';
import { getSupabaseAdmin } from '../../server/db/supabase.js';
import type { AgentSSEEmitter } from '../../server/agents/chatAgent/sse.js';

toolRegistry._resetForTests();
registerAllTools();

const READ_TOOL = ['case.list', 'case.search', 'knowledge.search'].find((n) => toolRegistry.get(n))!;
const scope: AgentScope = { tenantId: 'org_default', workspaceId: 'ws_default', userId: 'trace-test-user' };

let turn = 0;
const provider: ChatLLMProvider = {
  async streamChat(opts) {
    turn++;
    if (turn === 1) {
      opts.onTextDelta('Miro los casos. ');
      return { text: 'Miro los casos. ', toolCalls: [{ id: 'c1', toolName: READ_TOOL, args: {} }], usage: { inputTokens: 40, outputTokens: 8 }, stopReason: 'tool_use', model: 'fake' };
    }
    opts.onTextDelta('Listo.');
    return { text: 'Listo.', toolCalls: [], usage: { inputTokens: 50, outputTokens: 4 }, stopReason: 'end_turn', model: 'fake' };
  },
  async completeUtility() { return { text: 'Traza', usage: { inputTokens: 3, outputTokens: 2 }, model: 'fake-mini' }; },
};
_setProvidersForTests(provider, provider);

(async () => {
  // super_agent_traces must exist (used by the plan engine).
  const { error: tblErr } = await getSupabaseAdmin().from('super_agent_traces').select('plan_id').limit(1);
  assert.ok(!tblErr, `super_agent_traces table must exist: ${tblErr?.message}`);

  const events: Array<{ event: string; data: any }> = [];
  const emitter: AgentSSEEmitter = { emit: (event, data) => events.push({ event, data }), close: () => {} };
  await runChatAgent({ ...scope, message: '¿qué casos hay?', hasPermission: () => true, emitter });

  const convId = events[0].data.conversationId as string;

  const traces = await listTracesForSession(convId, 10);
  assert.equal(traces.length, 1, 'one trace persisted for the turn');
  const t = traces[0];
  assert.equal(t.sessionId, convId, 'trace keyed by conversationId');
  assert.equal(t.status, 'success', 'trace status success');
  assert.equal(t.spans.length, 1, 'one span for the single tool call');
  assert.equal(t.spans[0].tool, READ_TOOL, 'span records the tool');
  assert.ok(typeof t.spans[0].latencyMs === 'number', 'span has latency');
  assert.ok('result' in t.spans[0] && typeof t.spans[0].result?.ok === 'boolean', 'span carries the full ToolResult');
  console.log(`✅ trace persisted: session=${convId.slice(0, 8)}…, status=${t.status}, spans=${t.spans.length} (tool=${t.spans[0].tool}, ${t.spans[0].latencyMs}ms)`);

  const metrics = await getTraceMetrics(convId);
  assert.ok(metrics.total >= 1, 'metrics count the trace');
  console.log(`✅ metrics: total=${metrics.total}, avgSpans=${metrics.averageSpanCount}, avgLatency=${metrics.averageLatencyMs}ms`);

  // Cleanup: conversation (traces are append-only; remove the test row too).
  await deleteConversation(scope, convId).catch(() => {});
  await getSupabaseAdmin().from('super_agent_traces').delete().eq('session_id', convId);

  console.log('\nObservability trace (F3) holds.');
  process.exit(0);
})().catch((err) => { console.error('❌', err); process.exit(1); });
