/**
 * tests/chat-agent/run-live-e2e.ts
 *
 * LIVE end-to-end validation with REAL providers (Claude + OpenAI). Costs a few
 * real LLM calls. Requires ANTHROPIC_API_KEY (and OPENAI_API_KEY) reachable by
 * the test runner — put them in .env.local (tsx loads it) or the process env.
 *
 * Exercises the full workflow against the real model:
 *   - connectivity preflight
 *   - Turn 1: a question that requires a read tool → real Claude tool-use,
 *     situational context injection, live reasoning (extended thinking),
 *     tool_start/tool_result, streamed answer, per-turn trace persisted.
 *   - Turn 2: a follow-up in the same conversation → validates history
 *     reconstruction AND extended-thinking block preservation across a real
 *     multi-turn tool-use sequence (the part the mock tests can only approximate).
 *
 * Run: npx tsx tests/chat-agent/run-live-e2e.ts
 */
import assert from 'node:assert/strict';
import { registerAllTools } from '../../server/agents/planEngine/tools/index.js';
import { toolRegistry } from '../../server/agents/planEngine/registry.js';
import { runChatAgent } from '../../server/agents/chatAgent/index.js';
import { getUtilityProvider } from '../../server/agents/chatAgent/providers/index.js';
import { listTracesForSession } from '../../server/agents/planEngine/traceRepository.js';
import { getConversation, listMessages, deleteConversation, type AgentScope } from '../../server/data/agentConversations.js';
import { getSupabaseAdmin } from '../../server/db/supabase.js';
import type { AgentSSEEmitter } from '../../server/agents/chatAgent/sse.js';

toolRegistry._resetForTests();
registerAllTools();

const scope: AgentScope = { tenantId: 'org_default', workspaceId: 'ws_default', userId: 'live-e2e-user' };

function collect() {
  const events: Array<{ event: string; data: any }> = [];
  const emitter: AgentSSEEmitter = { emit: (event, data) => events.push({ event, data }), close: () => {} };
  return { events, emitter };
}

function seq(events: Array<{ event: string; data: any }>) {
  return events.map((e) => e.event).join(' → ');
}

(async () => {
  // ── 0. Connectivity preflight ─────────────────────────────────────────────
  try {
    const ping = await getUtilityProvider().completeUtility({ system: 'Responde en una palabra.', prompt: 'Di ok', maxTokens: 10 });
    console.log(`✅ connectivity: utility model responded (${ping.model})`);
  } catch (e: any) {
    console.error(`❌ Providers not reachable (${e?.code ?? ''}): ${e?.message ?? e}`);
    console.error('   Put ANTHROPIC_API_KEY / OPENAI_API_KEY in .env.local and retry.');
    process.exit(2);
  }

  let conversationId: string | undefined;

  // ── 1. Turn 1: requires a read tool ───────────────────────────────────────
  {
    const { events, emitter } = collect();
    await runChatAgent({
      ...scope,
      message: 'Lístame los 3 casos más recientes del workspace con su estado. Usa las herramientas del CRM.',
      uiContext: { view: 'inbox' },
      hasPermission: () => true,
      emitter,
    });
    console.log(`\n[turn 1] ${seq(events)}`);
    const names = events.map((e) => e.event);
    conversationId = events.find((e) => e.event === 'conversation_created')?.data?.conversationId;
    assert.ok(conversationId, 'conversation created');

    const done = events[events.length - 1];
    assert.equal(done.event, 'done', 'stream ends with done');
    assert.notEqual(done.data.finishReason, 'error', 'no error finish');
    assert.notEqual(done.data.finishReason, 'credit_exhausted', 'not credit-exhausted');

    const toolStarts = events.filter((e) => e.event === 'tool_start');
    assert.ok(toolStarts.length >= 1, 'the model actually called a tool');
    const toolResults = events.filter((e) => e.event === 'tool_result');
    assert.ok(toolResults.length >= 1, 'tool produced a result');
    assert.ok(names.includes('text_chunk'), 'the model streamed a written answer');

    const reasoning = events.filter((e) => e.event === 'reasoning_chunk');
    console.log(`   tools: ${toolStarts.map((e) => e.data.toolName).join(', ')} | reasoning chunks: ${reasoning.length} | finishReason: ${done.data.finishReason}`);
    const answer = events.filter((e) => e.event === 'text_chunk').map((e) => e.data.text).join('');
    console.log(`   answer: ${answer.slice(0, 160).replace(/\n/g, ' ')}…`);
    console.log('✅ turn 1: real tool-use + streamed answer');

    // Persistence + trace.
    const conv = await getConversation(scope, conversationId!);
    assert.ok(conv, 'conversation persisted');
    const msgs = await listMessages(scope, conversationId!);
    assert.ok(msgs.length >= 2, 'user + assistant messages persisted');
    const traces = await listTracesForSession(conversationId!, 5);
    assert.ok(traces.length >= 1, 'trace persisted for the turn');
    assert.ok(traces[0].spans.length >= 1, 'trace has a tool span');
    console.log(`✅ persistence: ${msgs.length} messages, trace with ${traces[0].spans.length} span(s), status=${traces[0].status}`);
  }

  // ── 2. Turn 2: follow-up (multi-turn + thinking-block preservation) ────────
  {
    const { events, emitter } = collect();
    await runChatAgent({
      ...scope,
      conversationId,
      message: '¿Cuántos casos abiertos hay en total ahora mismo?',
      uiContext: { view: 'inbox' },
      hasPermission: () => true,
      emitter,
    });
    console.log(`\n[turn 2] ${seq(events)}`);
    const done = events[events.length - 1];
    assert.equal(done.event, 'done', 'turn 2 ends with done');
    assert.notEqual(done.data.finishReason, 'error', 'turn 2: no API error (history + thinking blocks valid)');
    const answer = events.filter((e) => e.event === 'text_chunk').map((e) => e.data.text).join('');
    console.log(`   answer: ${answer.slice(0, 160).replace(/\n/g, ' ')}…`);
    console.log('✅ turn 2: multi-turn continuation works with the real API');
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────
  if (conversationId) {
    await deleteConversation(scope, conversationId).catch(() => {});
    await getSupabaseAdmin().from('super_agent_traces').delete().eq('session_id', conversationId);
  }

  console.log('\n🎉 LIVE end-to-end workflow validated with real Claude + OpenAI.');
  process.exit(0);
})().catch((err) => { console.error('❌', err); process.exit(1); });
