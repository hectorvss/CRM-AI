/**
 * tests/fin-agent/run-attributes-smoke.ts
 *
 * P1.1: the pipeline classifies the workspace's configured attributes into
 * ai_triage.attributes. Fake providers, no keys.
 *
 * Run: npx tsx tests/fin-agent/run-attributes-smoke.ts
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getSupabaseAdmin } from '../../server/db/supabase.js';
import { _setProvidersForTests } from '../../server/agents/chatAgent/providers/index.js';
import type { ChatLLMProvider, StreamChatResult } from '../../server/agents/chatAgent/providers/types.js';
import { runFinPipeline, patchFinConfig, _setEmbedderForTests, type FinScope } from '../../server/agents/finAgent/index.js';

const scope: FinScope = { tenantId: 'org_default', workspaceId: 'ws_default' };
const sfx = crypto.randomUUID().slice(0, 8);
const CASE_ID = `fin-attr-case-${sfx}`;
const CONV_ID = `fin-attr-conv-${sfx}`;
const CHUNK_ID = `fin-attr-chunk-${sfx}`;
const s = getSupabaseAdmin();

_setEmbedderForTests(async () => null);

let sawAttributesPrompt = false;
const fake: ChatLLMProvider = {
  async streamChat(): Promise<StreamChatResult> {
    return { text: JSON.stringify({ type: 'answer', text: 'Lamento mucho el problema, lo resolvemos enseguida.', citations: [CHUNK_ID] }), toolCalls: [], usage: { inputTokens: 10, outputTokens: 10 }, stopReason: 'end_turn', model: 'fake' };
  },
  async completeUtility(opts) {
    if (opts.system.includes('query-refinement'))
      return { text: JSON.stringify({ safe: true, unsafe_reason: null, language: 'es', refined_query: 'mi pedido llegó roto y estoy muy enfadado', ticket_type: 'diagnostic', needs_clarification: false, clarifying_question: null }), usage: { inputTokens: 10, outputTokens: 10 }, model: 'fake' };
    if (opts.system.includes('classify a customer-support conversation against a set of configured attributes')) {
      sawAttributesPrompt = true;
      assert.ok(opts.prompt.includes('Sentimiento') && opts.prompt.includes('Urgencia'), 'attributes prompt must list the configured attributes');
      return { text: JSON.stringify({ Sentimiento: 'negativo', Urgencia: 'alta' }), usage: { inputTokens: 10, outputTokens: 10 }, model: 'fake' };
    }
    if (opts.system.includes('validation stage'))
      return { text: JSON.stringify({ score: 0.9, grounded: true, safe: true, missing: [], feedback: '' }), usage: { inputTokens: 10, outputTokens: 10 }, model: 'fake' };
    if (opts.system.includes('retrieval reranker'))
      return { text: `[{"id":"${CHUNK_ID}","score":8}]`, usage: { inputTokens: 5, outputTokens: 5 }, model: 'fake' };
    throw new Error('unexpected utility: ' + opts.system.slice(0, 50));
  },
};
_setProvidersForTests(fake, fake);

async function cleanup() {
  await s.from('messages').delete().eq('conversation_id', CONV_ID);
  await s.from('conversations').delete().eq('id', CONV_ID);
  await s.from('cases').delete().eq('id', CASE_ID);
  await s.from('knowledge_embeddings').delete().eq('id', CHUNK_ID);
  await patchFinConfig(scope, { enabled: false, channels: { chat: { enabled: false } }, attributes: [] });
}

const run = async () => {
  await cleanup();
  const now = new Date().toISOString();
  await s.from('knowledge_embeddings').insert({ id: CHUNK_ID, tenant_id: scope.tenantId, workspace_id: scope.workspaceId, source_type: 'knowledge_article', source_id: CHUNK_ID, chunk_index: 0, chunk_text: 'Si un pedido llega roto ofrecemos reemplazo o reembolso completo.', model: 'none', metadata: {} });
  await s.from('cases').insert({ id: CASE_ID, case_number: CASE_ID, tenant_id: scope.tenantId, workspace_id: scope.workspaceId, type: 'question', status: 'open', priority: 'medium', created_at: now, updated_at: now, conversation_id: CONV_ID });
  await s.from('conversations').insert({ id: CONV_ID, case_id: CASE_ID, tenant_id: scope.tenantId, workspace_id: scope.workspaceId, channel: 'chat', status: 'open', created_at: now, updated_at: now });
  await s.from('messages').insert({ id: crypto.randomUUID(), conversation_id: CONV_ID, case_id: CASE_ID, type: 'message', direction: 'inbound', content: '¡Mi pedido llegó ROTO y estoy MUY enfadado, lo necesito ya!', content_type: 'text', channel: 'chat', sent_at: now, created_at: now, tenant_id: scope.tenantId, author_type: 'customer', is_private: false });

  // Configure two attributes (server-backed) + enable chat.
  await patchFinConfig(scope, {
    enabled: true,
    channels: { chat: { enabled: true, reply_modes: { '*': 'draft_only' } } },
    attributes: [
      { name: 'Sentimiento', description: 'Estado emocional del cliente', type: 'select', options: ['positivo', 'neutral', 'negativo'], enabled: true },
      { name: 'Urgencia', description: 'Qué urgente es la petición', type: 'select', options: ['baja', 'media', 'alta'], enabled: true },
    ],
  });

  const result = await runFinPipeline({ scope, caseId: CASE_ID, conversationId: CONV_ID, channel: 'chat' });
  console.log('status:', result.status, '· attributes:', JSON.stringify((result.triage as any).attributes));

  assert.ok(sawAttributesPrompt, 'the attributes stage must run');
  const attrs = (result.triage as any).attributes;
  assert.ok(attrs && attrs.Sentimiento === 'negativo' && attrs.Urgencia === 'alta', 'attributes must be classified into triage');
  const stages = (result.triage as any).stages.map((x: any) => x.stage);
  assert.ok(stages.includes('e1b_attributes'), 'e1b_attributes stage logged');

  // Verify it persisted on the case row too.
  const { data: caseRow } = await s.from('cases').select('ai_triage').eq('id', CASE_ID).maybeSingle();
  assert.equal((caseRow!.ai_triage as any).attributes.Urgencia, 'alta', 'attributes persisted in ai_triage');

  console.log('✓ fin-agent attributes smoke passed');
};

run().then(cleanup, async (e) => { await cleanup().catch(() => {}); throw e; })
  .catch((err) => { console.error('✗ FAILED:', err); process.exit(1); });
