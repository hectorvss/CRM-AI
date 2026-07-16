/**
 * tests/chat-agent/run-memory-smoke.ts
 *
 * Phase-3 checks: the memory tools, the /remember slash command (no LLM), and
 * the read-only surface contract for memory.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Run:
 *   npx tsx tests/chat-agent/run-memory-smoke.ts
 */
import assert from 'node:assert/strict';
import { registerAllTools } from '../../server/agents/planEngine/tools/index.js';
import { toolRegistry } from '../../server/agents/planEngine/registry.js';
import { runChatAgent } from '../../server/agents/chatAgent/index.js';
import { _setProvidersForTests } from '../../server/agents/chatAgent/providers/index.js';
import type { ChatLLMProvider } from '../../server/agents/chatAgent/providers/types.js';
import { selectToolkit } from '../../server/agents/chatAgent/toolkit.js';
import { getCoreMemory } from '../../server/data/agentCoreMemory.js';
import { getSupabaseAdmin } from '../../server/db/supabase.js';
import { listConversations, deleteConversation, type AgentScope } from '../../server/data/agentConversations.js';
import type { AgentSSEEmitter } from '../../server/agents/chatAgent/sse.js';

toolRegistry._resetForTests();
registerAllTools();

const scope: AgentScope = { tenantId: 'org_memtest', workspaceId: 'ws_default', userId: 'mem-test-user' };

// ── 1. Registry + surface contract ────────────────────────────────────────────
assert.ok(toolRegistry.get('memory.append'), 'memory.append registered');
assert.ok(toolRegistry.get('memory.get'), 'memory.get registered');
assert.equal(toolRegistry.get('memory.append')!.sideEffect, 'write');
assert.equal(toolRegistry.get('memory.get')!.sideEffect, 'read');

const support = selectToolkit({ hasPermission: () => true, surface: 'support_readonly', maxRisk: 'critical' });
assert.ok(support.some((t) => t.name === 'memory.get'), 'support surface can read memory');
assert.ok(!support.some((t) => t.name === 'memory.append'), 'support surface cannot write memory');
console.log('✅ memory tools registered; support_readonly has get but not append');

// Provider that must NOT be called for slash commands.
let llmCalls = 0;
const failIfCalled: ChatLLMProvider = {
  async streamChat() { llmCalls++; throw new Error('LLM must not be called for a slash command'); },
  async completeUtility() { llmCalls++; return { text: 'x', usage: { inputTokens: 0, outputTokens: 0 }, model: 'x' }; },
};

async function cleanup() {
  // Remove any conversations + the memory row for the test tenant.
  const convs = await listConversations(scope, 100);
  for (const c of convs) await deleteConversation(scope, c.id).catch(() => {});
  try {
    await getSupabaseAdmin().from('agent_core_memory').delete().eq('tenant_id', scope.tenantId);
  } catch { /* best-effort */ }
}

(async () => {
  await cleanup();

  // ── 2. /remember writes memory without touching the LLM ─────────────────────
  _setProvidersForTests(failIfCalled, failIfCalled);
  const ev: Array<{ event: string; data: any }> = [];
  const emitter: AgentSSEEmitter = { emit: (event, data) => ev.push({ event, data }), close: () => {} };

  await runChatAgent({
    ...scope,
    message: '/remember El cliente ACME está en plan Enterprise',
    hasPermission: () => true,
    emitter,
  });

  const names = ev.map((e) => e.event);
  assert.ok(names.includes('memory_updated'), '/remember emits memory_updated');
  assert.equal(names[names.length - 1], 'done');
  assert.equal(llmCalls, 0, '/remember must not call the LLM');

  const mem = await getCoreMemory(scope.tenantId);
  assert.ok(mem?.includes('ACME') && mem.includes('Enterprise'), 'fact persisted to core memory');
  console.log('✅ /remember: fact saved, memory_updated emitted, 0 LLM calls');

  // ── 3. memory.append tool path emits memory_updated ─────────────────────────
  let called = 0;
  const toolProvider: ChatLLMProvider = {
    async streamChat(opts) {
      called++;
      if (called === 1) {
        return {
          text: 'Lo guardo.',
          toolCalls: [{ id: 'c1', toolName: 'memory.append', args: { fact: 'Los reembolsos > 500 requieren finanzas' } }],
          usage: { inputTokens: 20, outputTokens: 5 }, stopReason: 'tool_use', model: 'fake',
        };
      }
      return { text: 'Guardado.', toolCalls: [], usage: { inputTokens: 10, outputTokens: 3 }, stopReason: 'end_turn', model: 'fake' };
    },
    async completeUtility() { return { text: 'Memoria', usage: { inputTokens: 1, outputTokens: 1 }, model: 'fake' }; },
  };
  _setProvidersForTests(toolProvider, toolProvider);
  const ev2: Array<{ event: string; data: any }> = [];
  await runChatAgent({
    ...scope,
    message: 'recuerda que los reembolsos grandes necesitan aprobación de finanzas',
    hasPermission: () => true,
    emitter: { emit: (e, d) => ev2.push({ event: e, data: d }), close: () => {} },
  });
  assert.ok(ev2.some((e) => e.event === 'memory_updated'), 'memory.append tool emits memory_updated');
  const mem2 = await getCoreMemory(scope.tenantId);
  assert.ok(mem2?.includes('finanzas'), 'tool-saved fact persisted');
  console.log('✅ memory.append tool: persisted + memory_updated emitted');

  await cleanup();
  console.log('\nMemory + slash commands hold.');
  process.exit(0);
})().catch(async (err) => { await cleanup().catch(() => {}); console.error('❌', err); process.exit(1); });
