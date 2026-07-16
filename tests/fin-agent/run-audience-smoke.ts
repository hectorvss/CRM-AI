/**
 * tests/fin-agent/run-audience-smoke.ts
 *
 * P1.3: retrieval respects article fin_audience (content targeting). Seeds two
 * chunks (one for 'users' only, one unrestricted) and checks that a 'visitors'
 * customer only sees the unrestricted one, while a 'users' customer sees both.
 * Fake embedder (full-text path) + a fake reranker that keeps everything.
 *
 * Run: npx tsx tests/fin-agent/run-audience-smoke.ts
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getSupabaseAdmin } from '../../server/db/supabase.js';
import { _setProvidersForTests } from '../../server/agents/chatAgent/providers/index.js';
import type { ChatLLMProvider, StreamChatResult } from '../../server/agents/chatAgent/providers/types.js';
import { retrieveKnowledge, parseFinConfig, _setEmbedderForTests, type FinScope } from '../../server/agents/finAgent/index.js';

const scope: FinScope = { tenantId: 'org_default', workspaceId: 'ws_default' };
const sfx = crypto.randomUUID().slice(0, 8);
const PUB = `fin-aud-pub-${sfx}`;   // unrestricted
const USR = `fin-aud-usr-${sfx}`;   // users-only
const s = getSupabaseAdmin();

_setEmbedderForTests(async () => null); // full-text path
// Reranker returns all with equal score so nothing is dropped by rerank.
const fake: ChatLLMProvider = {
  async streamChat(): Promise<StreamChatResult> { throw new Error('no'); },
  async completeUtility() { return { text: '[]', usage: { inputTokens: 0, outputTokens: 0 }, model: 'fake' }; },
};
_setProvidersForTests(fake, fake);

async function cleanup() {
  await s.from('knowledge_embeddings').delete().in('id', [PUB, USR]);
}

const run = async () => {
  await cleanup();
  const base = { tenant_id: scope.tenantId, workspace_id: scope.workspaceId, source_type: 'knowledge_article', chunk_index: 0, model: 'none' };
  await s.from('knowledge_embeddings').insert([
    { ...base, id: PUB, source_id: PUB, chunk_text: 'Horario de atención: lunes a viernes de 9 a 18h para reembolsos.', metadata: {} }, // unrestricted
    { ...base, id: USR, source_id: USR, chunk_text: 'Los clientes premium tienen reembolsos prioritarios en 24h.', metadata: { fin_audience: ['users'] } },
  ]);

  const config = parseFinConfig({ retrieval: { top_k: 10, candidates: 40 } });
  const q = 'reembolsos horario premium';

  const asVisitor = await retrieveKnowledge(scope, q, config, { audience: 'visitors' });
  const visIds = asVisitor.chunks.map((c) => c.id);
  console.log('visitor sees:', visIds);
  assert.ok(visIds.includes(PUB), 'visitor sees the unrestricted chunk');
  assert.ok(!visIds.includes(USR), 'visitor must NOT see the users-only chunk');

  const asUser = await retrieveKnowledge(scope, q, config, { audience: 'users' });
  const usrIds = asUser.chunks.map((c) => c.id);
  console.log('user sees:', usrIds);
  assert.ok(usrIds.includes(PUB) && usrIds.includes(USR), 'user sees both');

  const noAud = await retrieveKnowledge(scope, q, config); // no audience → no filter
  assert.ok(noAud.chunks.length >= 2, 'no audience → no filtering');

  console.log('✓ fin-agent audience retrieval smoke passed');
};

run().then(cleanup, async (e) => { await cleanup().catch(() => {}); throw e; })
  .catch((err) => { console.error('✗ FAILED:', err); process.exit(1); });
