/**
 * tests/chat-agent/run-situation-smoke.ts
 *
 * Phase-1 (awareness) checks:
 *   - assembleSituation reads the real accessors, is tenant-scoped, and never
 *     throws even when sources are empty (all groups default to 0/[]).
 *   - formatSituationForPrompt produces a compact, LLM-free string.
 *   - /status slash command answers from the snapshot with ZERO LLM calls.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Run:
 *   npx tsx tests/chat-agent/run-situation-smoke.ts
 */
import assert from 'node:assert/strict';
import { registerAllTools } from '../../server/agents/planEngine/tools/index.js';
import { toolRegistry } from '../../server/agents/planEngine/registry.js';
import { assembleSituation, formatSituationForPrompt } from '../../server/agents/chatAgent/situation.js';
import { runChatAgent } from '../../server/agents/chatAgent/index.js';
import { _setProvidersForTests } from '../../server/agents/chatAgent/providers/index.js';
import type { ChatLLMProvider } from '../../server/agents/chatAgent/providers/types.js';
import { getConversation, listMessages, deleteConversation, type AgentScope } from '../../server/data/agentConversations.js';
import type { AgentSSEEmitter } from '../../server/agents/chatAgent/sse.js';

toolRegistry._resetForTests();
registerAllTools();

const scope = { tenantId: 'org_default', workspaceId: 'ws_default', userId: 'situation-test-user' };

(async () => {
  // ── 1. assembleSituation: robust + shaped ─────────────────────────────────
  const situation = await assembleSituation(scope, { compact: true });
  assert.ok(situation.generatedAt, 'has a timestamp');
  for (const g of ['pendingApprovals', 'riskyCases', 'slaAtRisk', 'unread'] as const) {
    assert.equal(typeof (situation as any)[g].count, 'number', `${g}.count is a number`);
    assert.ok(Array.isArray((situation as any)[g].items), `${g}.items is an array`);
    assert.ok((situation as any)[g].items.length <= 3, `${g} compact caps at 3`);
  }
  assert.equal(typeof situation.queues.open, 'number', 'queues.open numeric');
  console.log(`✅ assembleSituation: shaped & robust (approvals=${situation.pendingApprovals.count}, risky=${situation.riskyCases.count}, sla=${situation.slaAtRisk.count}, unread=${situation.unread.count})`);

  const text = formatSituationForPrompt(situation);
  assert.ok(text.includes('Colas:'), 'prompt text has a queues line');
  console.log('✅ formatSituationForPrompt produces compact text');

  // Tenant isolation: a nonexistent tenant yields all-zero, never throws.
  const empty = await assembleSituation({ tenantId: 'org_nonexistent_xyz', workspaceId: 'ws_default', userId: 'nobody' }, { compact: true });
  assert.equal(empty.pendingApprovals.count, 0);
  assert.equal(empty.riskyCases.count, 0);
  console.log('✅ unknown tenant → all-zero snapshot (no throw)');

  // ── 2. /status runs with ZERO LLM calls ───────────────────────────────────
  let llmCalls = 0;
  const failIfCalled: ChatLLMProvider = {
    async streamChat() { llmCalls++; throw new Error('LLM must not be called for /status'); },
    async completeUtility() { llmCalls++; return { text: 'x', usage: { inputTokens: 0, outputTokens: 0 }, model: 'x' }; },
  };
  _setProvidersForTests(failIfCalled, failIfCalled);

  const events: Array<{ event: string; data: any }> = [];
  const emitter: AgentSSEEmitter = { emit: (event, data) => events.push({ event, data }), close: () => {} };
  await runChatAgent({ ...scope, message: '/status', hasPermission: () => true, emitter });

  const names = events.map((e) => e.event);
  assert.ok(names.includes('text_chunk'), '/status streams a text answer');
  assert.equal(names[names.length - 1], 'done');
  assert.equal(llmCalls, 0, '/status must not call the LLM');
  const answer = events.filter((e) => e.event === 'text_chunk').map((e) => e.data.text).join('');
  assert.ok(answer.includes('Estado del workspace') || answer.includes('Colas:'), '/status returns the snapshot');
  console.log('✅ /status: snapshot answer, 0 LLM calls');

  // Cleanup the conversation /status created.
  const convId = events[0]?.data?.conversationId as string | undefined;
  if (convId) {
    const conv = await getConversation(scope as AgentScope, convId);
    if (conv) { await listMessages(scope as AgentScope, convId); await deleteConversation(scope as AgentScope, convId); }
  }

  console.log('\nSituational awareness (F1) holds.');
  process.exit(0);
})().catch((err) => { console.error('❌', err); process.exit(1); });
