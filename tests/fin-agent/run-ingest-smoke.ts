/**
 * tests/fin-agent/run-ingest-smoke.ts
 *
 * P0 verification: content added as a knowledge article becomes retrievable by
 * Fin. Uses a fake embedder (deterministic vectors) + the real
 * chunk/upsert/retrieve path, so it runs without keys.
 *
 *  1. indexArticle → chunks + rows in knowledge_embeddings
 *  2. retrieveKnowledge finds the chunk by full-text (degraded path)
 *  3. syncArticleEmbeddings removes chunks when fin_service flips off
 *
 * Run: npx tsx tests/fin-agent/run-ingest-smoke.ts
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getSupabaseAdmin } from '../../server/db/supabase.js';
import { _setEmbedderForTests, retrieveKnowledge, parseFinConfig, type FinScope } from '../../server/agents/finAgent/index.js';
import { indexArticle, chunkText, syncArticleEmbeddings, countIndexedChunks } from '../../server/agents/finAgent/ingest.js';

const scope: FinScope = { tenantId: 'org_default', workspaceId: 'ws_default' };
const ART_ID = `fin-ingest-art-${crypto.randomUUID().slice(0, 8)}`;

// Deterministic fake embedder — 1536 dims, varies a bit by text length so it's
// not all-identical, but retrieval here is validated via the full-text path.
_setEmbedderForTests(async (t: string) => {
  const v = new Array(1536).fill(0);
  for (let i = 0; i < Math.min(t.length, 1536); i++) v[i] = (t.charCodeAt(i) % 7) / 7;
  return v;
});

const s = getSupabaseAdmin();

async function cleanup() {
  await s.from('knowledge_embeddings').delete().eq('tenant_id', scope.tenantId).eq('source_id', ART_ID);
}

const run = async () => {
  await cleanup();

  // chunkText unit behavior
  const long = Array.from({ length: 40 }, (_, i) => `Párrafo ${i} sobre la política de reembolsos y devoluciones de la tienda.`).join('\n\n');
  const cs = chunkText(long, { maxChars: 800, overlapChars: 100 });
  assert.ok(cs.length >= 3, `long text should chunk (got ${cs.length})`);
  assert.ok(cs.every((c) => c.length <= 1200), 'chunks respect budget-ish');

  // 1. index an article
  const article = {
    id: ART_ID,
    title: 'Cómo cambiar la dirección de envío',
    content: 'Para cambiar la dirección de envío de un pedido, entra en Pedidos, abre el detalle y pulsa "Editar dirección de envío". Solo es posible mientras el pedido no haya salido del almacén. Una vez enviado, contacta con soporte.',
    language: 'es',
    fin_audience: ['users'],
    status: 'published',
  };
  const r = await indexArticle(scope, article);
  console.log('indexArticle:', JSON.stringify(r));
  assert.ok(r.chunks >= 1, 'must produce at least one chunk');

  const { data: rows } = await s.from('knowledge_embeddings').select('*').eq('source_id', ART_ID);
  assert.ok(rows!.length >= 1, 'rows persisted in knowledge_embeddings');
  assert.equal(rows![0].source_type, 'knowledge_article');
  assert.ok(rows![0].chunk_text.includes('Editar dirección'), 'chunk carries the content');
  assert.equal((rows![0].metadata as any).language, 'es');

  assert.ok((await countIndexedChunks(scope)) >= r.chunks, 'countIndexedChunks reflects the insert');

  // 2. Fin retrieval finds it (full-text/degraded path — no real embeddings)
  const config = parseFinConfig({});
  const retrieval = await retrieveKnowledge(scope, 'cómo cambio la dirección de mi pedido', config);
  const found = retrieval.chunks.some((c) => c.sourceId === ART_ID);
  console.log('retrieval found the article chunk:', found, '· total chunks:', retrieval.chunks.length);
  assert.ok(found, 'Fin retrieval must surface the freshly-indexed article');

  // 3. reindex is idempotent (no duplicate rows)
  await indexArticle(scope, article);
  const { data: rows2 } = await s.from('knowledge_embeddings').select('id').eq('source_id', ART_ID);
  assert.equal(rows2!.length, rows!.length, 'reindex must not duplicate chunks');

  // 4. flipping fin_service off removes the chunks
  syncArticleEmbeddings(scope, { ...article, fin_service: false } as any, ART_ID);
  await new Promise((res) => setTimeout(res, 1500)); // fire-and-forget
  const { data: rows3 } = await s.from('knowledge_embeddings').select('id').eq('source_id', ART_ID);
  assert.equal(rows3!.length, 0, 'un-flagging fin_service must remove the chunks');

  console.log('✓ fin-agent ingest smoke passed');
};

run().then(cleanup, async (e) => { await cleanup().catch(() => {}); throw e; })
  .catch((err) => { console.error('✗ FAILED:', err); process.exit(1); });
