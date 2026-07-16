/**
 * tests/fin-agent/validate-ingest-live.ts
 *
 * REAL end-to-end P0 proof (uses the live OPENAI/ANTHROPIC keys): create a
 * knowledge article through the SAME repository the API uses → the CRUD hook
 * embeds it → run the real Fin pipeline against a question it answers → Fin
 * cites it. Proves "content added in the UI is retrievable by Fin".
 *
 * Run: SEED_TENANT=… SEED_WS=… npx tsx tests/fin-agent/validate-ingest-live.ts
 */
import crypto from 'node:crypto';
import { getSupabaseAdmin } from '../../server/db/supabase.js';
import { createKnowledgeRepository } from '../../server/data/knowledge.js';
import { runFinPipeline, patchFinConfig, type FinScope } from '../../server/agents/finAgent/index.js';

const scope: FinScope = {
  tenantId: process.env.SEED_TENANT || 'org_default',
  workspaceId: process.env.SEED_WS || 'ws_default',
};
const CASE_ID = 'fin-ingest-live-case';
const CONV_ID = 'fin-ingest-live-conv';
const s = getSupabaseAdmin();
const repo = createKnowledgeRepository();
let articleId = '';

async function cleanup() {
  await s.from('messages').delete().eq('conversation_id', CONV_ID);
  await s.from('conversations').delete().eq('id', CONV_ID);
  await s.from('cases').delete().eq('id', CASE_ID);
  if (articleId) {
    await s.from('knowledge_embeddings').delete().eq('source_id', articleId);
    await s.from('knowledge_articles').delete().eq('id', articleId);
  }
}

const run = async () => {
  await cleanup();
  const now = new Date().toISOString();

  // 1. Create a Fin-source article the normal way (repo → CRUD hook embeds it).
  console.log('→ Creando artículo de conocimiento (con hook de embedding)…');
  const art = await repo.createArticle(scope as any, {
    title: 'Política de reembolsos',
    content: 'Aceptamos devoluciones dentro de los 30 días posteriores a la compra. El reembolso se emite al mismo método de pago en 5-7 días hábiles una vez recibido el artículo. Los productos personalizados no son reembolsables.',
    status: 'published',
    fin_service: true,
    language: 'es',
  });
  articleId = art.id;
  console.log('  artículo:', articleId);

  // Wait for the fire-and-forget embedding hook to finish.
  let indexed = 0;
  for (let i = 0; i < 20 && indexed === 0; i++) {
    await new Promise((r) => setTimeout(r, 700));
    const { count } = await s.from('knowledge_embeddings').select('*', { count: 'exact', head: true }).eq('source_id', articleId);
    indexed = count ?? 0;
  }
  console.log('  fragmentos embebidos automáticamente:', indexed);
  if (indexed === 0) throw new Error('el hook de embedding no indexó el artículo (¿OPENAI_API_KEY?)');

  // 2. Seed a case + customer message asking about the article's topic.
  await s.from('cases').insert({ id: CASE_ID, case_number: 'FIN-ING-1', tenant_id: scope.tenantId, workspace_id: scope.workspaceId, type: 'question', status: 'open', priority: 'medium', created_at: now, updated_at: now, conversation_id: CONV_ID, last_activity_at: now });
  await s.from('conversations').insert({ id: CONV_ID, case_id: CASE_ID, tenant_id: scope.tenantId, workspace_id: scope.workspaceId, channel: 'chat', status: 'open', created_at: now, updated_at: now });
  await s.from('messages').insert({ id: crypto.randomUUID(), conversation_id: CONV_ID, case_id: CASE_ID, type: 'message', direction: 'inbound', content: '¿En cuánto tiempo me devolvéis el dinero de una devolución?', content_type: 'text', channel: 'chat', sent_at: now, created_at: now, tenant_id: scope.tenantId, author_type: 'customer', is_private: false });

  await patchFinConfig(scope, { enabled: true, channels: { chat: { enabled: true, reply_modes: { '*': 'draft_only' } } } });

  // 3. Run the REAL pipeline.
  console.log('\n→ Ejecutando el pipeline real…\n');
  const result = await runFinPipeline({ scope, caseId: CASE_ID, conversationId: CONV_ID, channel: 'chat' });
  console.log('─'.repeat(66));
  console.log('STATUS:', result.status, '· confianza:', result.reply?.confidence);
  console.log('CITAS:', JSON.stringify(result.reply?.citations));
  console.log('RESPUESTA:\n' + (result.reply?.text ?? '(sin respuesta)'));
  console.log('─'.repeat(66));

  const citedArticle = (result.reply?.citations ?? []).some((c) => String(c).startsWith(articleId));
  const mentions = /5-7|5 a 7|siete|hábiles|30 días/i.test(result.reply?.text ?? '');
  if (result.status !== 'draft_created') throw new Error('esperaba draft_created: ' + JSON.stringify(result.triage));
  if (!citedArticle && !mentions) throw new Error('Fin no usó el artículo recién creado');
  console.log('✓ Fin respondió usando el conocimiento creado desde la UI', citedArticle ? '(citado)' : '(contenido presente)');
};

run().then(cleanup, async (e) => { await cleanup().catch(() => {}); throw e; })
  .catch((err) => { console.error('✗ FALLÓ:', err?.message ?? err); process.exit(1); });
