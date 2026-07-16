/**
 * tests/fin-agent/validate-live.ts
 *
 * REAL end-to-end validation (uses the actual ANTHROPIC_API_KEY + OPENAI_API_KEY
 * from .env.local — NO fake providers). Seeds a knowledge chunk (with a real
 * OpenAI embedding) + a case with an inbound customer message, enables Fin for
 * chat, and runs the real pipeline. Proves both providers work:
 *   - OpenAI: query + chunk embeddings (hybrid retrieval)
 *   - Anthropic: refine/validate (Haiku) + generate (Sonnet)
 *
 * Run: SEED_TENANT=… SEED_WS=… npx tsx tests/fin-agent/validate-live.ts
 */
import crypto from 'node:crypto';
import { getSupabaseAdmin } from '../../server/db/supabase.js';
import { runFinPipeline, patchFinConfig, embedQuery, type FinScope } from '../../server/agents/finAgent/index.js';

const scope: FinScope = {
  tenantId: process.env.SEED_TENANT || 'org_default',
  workspaceId: process.env.SEED_WS || 'ws_default',
};
const CASE_ID = 'fin-live-case';
const CONV_ID = 'fin-live-conv';
const CHUNK_ID = 'fin-live-chunk';

const CHUNK_TEXT =
  'Para cambiar la dirección de envío de un pedido, entra en Pedidos → abre el detalle del pedido → pulsa "Editar dirección de envío". ' +
  'Solo se puede cambiar mientras el pedido no haya salido del almacén. Una vez enviado, contacta con soporte para gestionar la reexpedición.';
const CUSTOMER_MSG = 'Hola, me he equivocado de dirección en mi pedido, ¿cómo la cambio?';

const s = getSupabaseAdmin();

async function cleanup() {
  await s.from('messages').delete().eq('conversation_id', CONV_ID);
  await s.from('fin_outcomes').delete().eq('case_id', CASE_ID);
  await s.from('fin_knowledge_gaps').delete().eq('case_id', CASE_ID);
  await s.from('conversations').delete().eq('id', CONV_ID);
  await s.from('cases').delete().eq('id', CASE_ID);
  await s.from('knowledge_embeddings').delete().eq('id', CHUNK_ID);
}

const run = async () => {
  await cleanup();
  const now = new Date().toISOString();

  // 1. Real OpenAI embedding for the knowledge chunk → proves OpenAI works.
  console.log('→ Generando embedding real del chunk (OpenAI)…');
  const emb = await embedQuery(CHUNK_TEXT);
  if (!emb) throw new Error('embedQuery devolvió null — la OPENAI_API_KEY no funciona');
  console.log(`  ✓ embedding OK (${emb.length} dims)`);

  let r: any = await s.from('knowledge_embeddings').insert({
    id: CHUNK_ID, tenant_id: scope.tenantId, workspace_id: scope.workspaceId,
    source_type: 'knowledge_article', source_id: CHUNK_ID, chunk_index: 0,
    chunk_text: CHUNK_TEXT, embedding: JSON.stringify(emb), model: 'text-embedding-3-small', metadata: {},
  });
  if (r.error) throw new Error('seed chunk: ' + r.error.message);

  // 2. Case + conversation + inbound customer message.
  r = await s.from('cases').insert({
    id: CASE_ID, case_number: 'FIN-LIVE-1', tenant_id: scope.tenantId, workspace_id: scope.workspaceId,
    type: 'question', status: 'open', priority: 'medium', created_at: now, updated_at: now,
    conversation_id: CONV_ID, last_activity_at: now,
  });
  if (r.error) throw new Error('seed case: ' + r.error.message);
  r = await s.from('conversations').insert({
    id: CONV_ID, case_id: CASE_ID, tenant_id: scope.tenantId, workspace_id: scope.workspaceId,
    channel: 'chat', status: 'open', created_at: now, updated_at: now,
  });
  if (r.error) throw new Error('seed conv: ' + r.error.message);
  r = await s.from('messages').insert({
    id: crypto.randomUUID(), conversation_id: CONV_ID, case_id: CASE_ID, type: 'message',
    direction: 'inbound', content: CUSTOMER_MSG, content_type: 'text', channel: 'chat',
    sent_at: now, created_at: now, tenant_id: scope.tenantId, author_type: 'customer', is_private: false,
  });
  if (r.error) throw new Error('seed msg: ' + r.error.message);

  // 3. Enable Fin for chat (draft_only — safe, nothing auto-sent to customers).
  await patchFinConfig(scope, {
    enabled: true,
    channels: { chat: { enabled: true, reply_modes: { '*': 'draft_only' } } },
  });

  // 4. Run the REAL pipeline.
  console.log('\n→ Ejecutando el pipeline REAL (Claude + OpenAI)…\n');
  const t0 = Date.now();
  const result = await runFinPipeline({ scope, caseId: CASE_ID, conversationId: CONV_ID, channel: 'chat' });
  const ms = Date.now() - t0;

  console.log('─'.repeat(70));
  console.log('PREGUNTA DEL CLIENTE:', CUSTOMER_MSG);
  console.log('─'.repeat(70));
  console.log('STATUS:', result.status, `(${ms} ms)`);
  console.log('CLASIFICACIÓN:', JSON.stringify((result.triage as any).classification));
  console.log('CONFIANZA:', result.reply?.confidence);
  console.log('CITAS:', JSON.stringify(result.reply?.citations));
  console.log('ETAPAS:', ((result.triage as any).stages ?? []).map((x: any) => `${x.stage}:${x.status}`).join(' → '));
  console.log('─'.repeat(70));
  console.log('BORRADOR DE FIN:\n');
  console.log(result.reply?.text ?? '(sin respuesta)');
  console.log('─'.repeat(70));

  // Verify it persisted as a private draft in the thread.
  const { data: draft } = await s.from('messages')
    .select('is_private, author_type, confidence')
    .eq('id', result.reply?.messageId ?? '').maybeSingle();
  console.log('PERSISTIDO EN EL HILO:', JSON.stringify(draft));

  console.log('\nCASE_ID para verlo en el navegador:', CASE_ID);
  console.log('NOTA: Fin queda habilitado en draft_only para este workspace (nada se envía solo al cliente).');
};

run().catch((err) => { console.error('✗ FALLÓ:', err?.message ?? err); process.exit(1); });
