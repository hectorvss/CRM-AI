/**
 * tests/chat-agent/run-loop-smoke.ts
 *
 * End-to-end smoke of the operator Super Agent loop WITHOUT an LLM key:
 * injects a scripted fake provider (two turns: tool call → final answer) and
 * asserts the full pipeline — conversation persistence in Supabase
 * (agent_conversations/agent_messages), real invokeTool execution against the
 * Plan Engine, SSE event sequence, and history round-trip.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (loaded from .env.local/.env
 * by server/config.ts). Run: npx tsx tests/chat-agent/run-loop-smoke.ts
 */
import assert from 'node:assert/strict';
import { registerAllTools } from '../../server/agents/planEngine/tools/index.js';
import { toolRegistry } from '../../server/agents/planEngine/registry.js';
import { runChatAgent } from '../../server/agents/chatAgent/index.js';
import { _setProvidersForTests } from '../../server/agents/chatAgent/providers/index.js';
import type { ChatLLMProvider, StreamChatResult } from '../../server/agents/chatAgent/providers/types.js';
import {
  getConversation,
  listMessages,
  deleteConversation,
  type AgentScope,
} from '../../server/data/agentConversations.js';
import type { AgentSSEEmitter } from '../../server/agents/chatAgent/sse.js';

toolRegistry._resetForTests();
registerAllTools();

// Pick a real read tool from the registry to exercise invokeTool.
const READ_TOOL = ['case.list', 'case.search', 'knowledge.search', 'case.get']
  .find((name) => toolRegistry.get(name)) ?? (() => { throw new Error('no read tool found'); })();

let turn = 0;
const fakeProvider: ChatLLMProvider = {
  async streamChat(opts): Promise<StreamChatResult> {
    turn++;
    if (turn === 1) {
      assert.ok(opts.tools.length > 50, `expected a real catalog, got ${opts.tools.length} tools`);
      assert.ok(opts.system.includes('Clain AI'), 'system prompt must carry the ported role');
      opts.onTextDelta('Voy a consultar los casos. ');
      return {
        text: 'Voy a consultar los casos. ',
        toolCalls: [{ id: 'call_1', toolName: READ_TOOL, args: {} }],
        usage: { inputTokens: 100, outputTokens: 20 },
        stopReason: 'tool_use',
        model: 'fake-sonnet',
      };
    }
    // Second turn: the loop must have appended assistant(tool_use) + tool_result.
    const hasToolResult = opts.messages.some((m) => m.role === 'tool_result');
    assert.ok(hasToolResult, 'second turn must include the tool_result message');
    opts.onTextDelta('Listo: aquí tienes el resumen.');
    return {
      text: 'Listo: aquí tienes el resumen.',
      toolCalls: [],
      usage: { inputTokens: 150, outputTokens: 30 },
      stopReason: 'end_turn',
      model: 'fake-sonnet',
    };
  },
  async completeUtility() {
    return { text: 'Consulta de casos de prueba', usage: { inputTokens: 10, outputTokens: 5 }, model: 'fake-mini' };
  },
};
_setProvidersForTests(fakeProvider, fakeProvider);

const events: Array<{ event: string; data: any }> = [];
const emitter: AgentSSEEmitter = {
  emit: (event, data) => events.push({ event, data }),
  close: () => {},
};

const scope: AgentScope = { tenantId: 'org_default', workspaceId: 'ws_default', userId: 'smoke-test-user' };

const run = async () => {
  await runChatAgent({
    ...scope,
    message: 'lista los últimos casos abiertos',
    uiContext: { view: 'inbox' },
    hasPermission: () => true,
    emitter,
  });

  // ── Event sequence ──────────────────────────────────────────────────────────
  const names = events.map((e) => e.event);
  console.log('events:', names.join(' → '));

  assert.equal(names[0], 'conversation_created');
  assert.ok(names.includes('text_chunk'), 'must stream text chunks');
  assert.ok(names.includes('tool_start'), 'must emit tool_start');
  assert.ok(names.includes('tool_result'), 'must emit tool_result');
  assert.ok(names.includes('title_generated'), 'must emit title_generated');
  assert.equal(names[names.length - 1], 'done');

  const toolStart = events.find((e) => e.event === 'tool_start')!.data;
  const toolResult = events.find((e) => e.event === 'tool_result')!.data;
  assert.equal(toolStart.toolName, READ_TOOL);
  assert.equal(toolResult.toolCallId, toolStart.toolCallId, 'tool_result must carry the same toolCallId');
  assert.equal(typeof toolResult.ok, 'boolean');

  const done = events[events.length - 1].data;
  assert.equal(done.finishReason, 'stop');
  assert.ok(done.tokensUsed >= 300, `credits metering saw ${done.tokensUsed} tokens`);

  // ── Persistence round-trip ──────────────────────────────────────────────────
  const conversationId = events[0].data.conversationId as string;
  const conversation = await getConversation(scope, conversationId);
  assert.ok(conversation, 'conversation row must exist');
  assert.equal(conversation!.title, 'Consulta de casos de prueba');

  const messages = await listMessages(scope, conversationId);
  assert.equal(messages.length, 2, 'one user + one assistant message');
  assert.equal(messages[0].role, 'user');
  assert.equal(messages[1].role, 'assistant');
  assert.ok(messages[1].content.includes('Listo'), 'assistant text persisted');
  assert.equal(messages[1].tool_calls?.length, 1, 'tool call persisted');
  assert.equal(messages[1].tool_calls![0].toolName, READ_TOOL);

  // Cross-tenant isolation: another tenant must not see it.
  const foreign = await getConversation({ ...scope, tenantId: 'org_other' }, conversationId);
  assert.equal(foreign, null, 'cross-tenant read must return null');

  // ── Cleanup ────────────────────────────────────────────────────────────────
  await deleteConversation(scope, conversationId);
  const gone = await getConversation(scope, conversationId);
  assert.equal(gone, null, 'conversation deleted');

  console.log(`✅ loop smoke: tool=${READ_TOOL}, toolResult.ok=${toolResult.ok}, 2 turns, persistence + isolation + cleanup OK`);
};

run().then(() => process.exit(0)).catch((err) => { console.error('❌', err); process.exit(1); });
