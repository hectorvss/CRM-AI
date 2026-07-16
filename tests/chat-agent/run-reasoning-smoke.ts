/**
 * tests/chat-agent/run-reasoning-smoke.ts
 *
 * Phase-2 (live reasoning) checks, WITHOUT an LLM key:
 *   - onThinkingDelta from the provider surfaces as `reasoning_chunk` SSE events.
 *   - the raw provider content (extended-thinking blocks) is carried back
 *     verbatim on the next iteration's assistant message (`_providerContent`),
 *     which Anthropic requires within a tool-use sequence.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Run:
 *   npx tsx tests/chat-agent/run-reasoning-smoke.ts
 */
import assert from 'node:assert/strict';
import { registerAllTools } from '../../server/agents/planEngine/tools/index.js';
import { toolRegistry } from '../../server/agents/planEngine/registry.js';
import { runChatAgent } from '../../server/agents/chatAgent/index.js';
import { _setProvidersForTests } from '../../server/agents/chatAgent/providers/index.js';
import type { ChatLLMProvider } from '../../server/agents/chatAgent/providers/types.js';
import { deleteConversation, type AgentScope } from '../../server/data/agentConversations.js';
import type { AgentSSEEmitter } from '../../server/agents/chatAgent/sse.js';

toolRegistry._resetForTests();
registerAllTools();

const READ_TOOL = ['case.list', 'case.search', 'knowledge.search'].find((n) => toolRegistry.get(n))!;
const scope: AgentScope = { tenantId: 'org_default', workspaceId: 'ws_default', userId: 'reasoning-test-user' };

const RAW_BLOCKS = [
  { type: 'thinking', thinking: 'Debo mirar los casos primero.', signature: 'sig-abc' },
  { type: 'tool_use', id: 'call_1', name: READ_TOOL.replace(/\./g, '__'), input: {} },
];

let turn = 0;
let secondTurnSawRawContent = false;

const provider: ChatLLMProvider = {
  async streamChat(opts) {
    turn++;
    if (turn === 1) {
      // Stream some reasoning, then request a tool.
      opts.onThinkingDelta?.('Pensando: ');
      opts.onThinkingDelta?.('reviso los casos abiertos.');
      opts.onTextDelta('Voy a mirar los casos. ');
      return {
        text: 'Voy a mirar los casos. ',
        toolCalls: [{ id: 'call_1', toolName: READ_TOOL, args: {} }],
        usage: { inputTokens: 50, outputTokens: 10 },
        stopReason: 'tool_use',
        model: 'fake-sonnet-thinking',
        thinking: 'Pensando: reviso los casos abiertos.',
        rawContent: RAW_BLOCKS,
      };
    }
    // On the continuation, the assistant turn that requested the tool must carry
    // its raw thinking blocks back verbatim.
    const assistantWithTool = opts.messages.find(
      (m: any) => m.role === 'assistant' && Array.isArray(m._providerContent) && m._providerContent.some((b: any) => b.type === 'thinking'),
    );
    if (assistantWithTool) secondTurnSawRawContent = true;
    opts.onTextDelta('Listo.');
    return { text: 'Listo.', toolCalls: [], usage: { inputTokens: 60, outputTokens: 5 }, stopReason: 'end_turn', model: 'fake-sonnet-thinking' };
  },
  async completeUtility() {
    return { text: 'Revisión de casos', usage: { inputTokens: 5, outputTokens: 3 }, model: 'fake-mini' };
  },
};
_setProvidersForTests(provider, provider);

(async () => {
  const events: Array<{ event: string; data: any }> = [];
  const emitter: AgentSSEEmitter = { emit: (event, data) => events.push({ event, data }), close: () => {} };

  await runChatAgent({ ...scope, message: '¿qué casos hay abiertos?', hasPermission: () => true, emitter });

  const reasoningEvents = events.filter((e) => e.event === 'reasoning_chunk');
  assert.ok(reasoningEvents.length >= 2, `expected reasoning_chunk events, got ${reasoningEvents.length}`);
  const reasoningText = reasoningEvents.map((e) => e.data.text).join('');
  assert.ok(reasoningText.includes('reviso los casos'), 'reasoning stream carries the thinking text');
  console.log(`✅ reasoning streamed: ${reasoningEvents.length} chunks → "${reasoningText}"`);

  assert.ok(secondTurnSawRawContent, 'raw thinking blocks preserved on the continuation turn');
  console.log('✅ _providerContent (thinking blocks) preserved across the tool-use iteration');

  const convId = events[0]?.data?.conversationId as string | undefined;
  if (convId) await deleteConversation(scope, convId).catch(() => {});

  console.log('\nLive reasoning (F2) holds.');
  process.exit(0);
})().catch((err) => { console.error('❌', err); process.exit(1); });
