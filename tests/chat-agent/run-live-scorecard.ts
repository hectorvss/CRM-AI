/**
 * tests/chat-agent/run-live-scorecard.ts
 *
 * Live QUALITY/EFFICIENCY scorecard for the operator agent (real Claude+OpenAI).
 * Runs a few realistic scenarios and prints a scorecard: latency (first token,
 * total), tool calls, tokens, answer length, and whether the agent narrated
 * before its first tool (UX). Soft-asserts the clear efficiency invariants.
 *
 * Point it at a tenant WITH data:
 *   LIVE_TENANT=<uuid> LIVE_WORKSPACE=<uuid> npx tsx tests/chat-agent/run-live-scorecard.ts
 * Falls back to org_default/ws_default (usually empty).
 */
import { registerAllTools } from '../../server/agents/planEngine/tools/index.js';
import { toolRegistry } from '../../server/agents/planEngine/registry.js';
import { runChatAgent } from '../../server/agents/chatAgent/index.js';
import { deleteConversation, type AgentScope } from '../../server/data/agentConversations.js';
import { getSupabaseAdmin } from '../../server/db/supabase.js';
import type { AgentSSEEmitter } from '../../server/agents/chatAgent/sse.js';

toolRegistry._resetForTests();
registerAllTools();

const scope: AgentScope = {
  tenantId: process.env.LIVE_TENANT || 'org_default',
  workspaceId: process.env.LIVE_WORKSPACE || 'ws_default',
  userId: 'scorecard',
};

interface Metrics { firstText: number; total: number; tools: string[]; tokens: number; answerLen: number; narratedBeforeTool: boolean; convId?: string; }

async function run(convId: string | undefined, message: string): Promise<Metrics> {
  const t0 = Date.now();
  let firstText = 0, answer = '', tokens = 0, out = convId, sawTextBeforeTool = false, sawTool = false;
  const tools: string[] = [];
  const emitter: AgentSSEEmitter = {
    emit(ev, d: any) {
      if (ev === 'conversation_created') out = d.conversationId;
      else if (ev === 'text_chunk') { if (!firstText) firstText = Date.now() - t0; if (!sawTool) sawTextBeforeTool = true; answer += d.text; }
      else if (ev === 'tool_start') { sawTool = true; tools.push(d.toolName); }
      else if (ev === 'done') tokens = d.tokensUsed ?? 0;
    },
    close() {},
  };
  await runChatAgent({ ...scope, conversationId: convId, message, uiContext: { view: 'inbox' }, hasPermission: () => true, emitter });
  return { firstText, total: Date.now() - t0, tools, tokens, answerLen: answer.length, narratedBeforeTool: sawTextBeforeTool, convId: out };
}

function card(label: string, m: Metrics) {
  console.log(`\n▸ ${label}`);
  console.log(`  latencia: 1er texto ${m.firstText}ms · total ${m.total}ms`);
  console.log(`  tools (${m.tools.length}): ${m.tools.join(', ') || '—'}`);
  console.log(`  tokens: ${m.tokens} · respuesta: ${m.answerLen} chars · narró antes de tool: ${m.narratedBeforeTool ? 'sí' : (m.tools.length ? 'NO' : 'n/a')}`);
}

(async () => {
  console.log(`=== SCORECARD (tenant ${scope.tenantId.slice(0, 8)}…) ===`);
  const soft: string[] = [];

  const a = await run(undefined, '¿Qué está pasando ahora mismo? Dame los casos de alto riesgo.');
  card('A · pregunta de estado', a);
  if (a.tools.length > 1) soft.push(`A usó ${a.tools.length} tools (esperado ~0: la situación ya está inyectada)`);
  if (a.firstText > 8000) soft.push(`A tardó ${a.firstText}ms al 1er texto (>8s)`);

  const b = await run(a.convId, 'Recomiéndame qué hacer con el más urgente.');
  card('B · recomendación (requiere profundizar)', b);
  if (b.tools.length > 4) soft.push(`B usó ${b.tools.length} tools (posible thrashing)`);
  if (b.tools.length && !b.narratedBeforeTool) soft.push('B no narró antes del primer tool (UX)');

  if (a.convId) {
    await deleteConversation(scope, a.convId).catch(() => {});
    await getSupabaseAdmin().from('super_agent_traces').delete().eq('session_id', a.convId);
  }

  console.log('\n─────────── RESUMEN ───────────');
  if (soft.length === 0) console.log('✅ Todos los invariantes de eficiencia/UX se cumplen.');
  else { console.log('⚠️  Señales a revisar:'); for (const s of soft) console.log('   - ' + s); }
  process.exit(0);
})().catch((e) => { console.error('❌ scorecard fail:', e); process.exit(1); });
