/**
 * tests/fin-agent/run-pipeline-smoke.ts
 *
 * End-to-end smoke of the Fin AI Agent pipeline WITHOUT LLM/embedding keys:
 * scripted fake providers for refine/generate/validate, fake embedder (null →
 * full-text-only retrieval), seeded knowledge chunk + case/conversation/message.
 * Asserts: draft persisted privately with citations, ai_triage per stage,
 * fin_outcomes event, config deep-merge contract, multi-tenant isolation.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (from .env.local / .env).
 * Run: npx tsx tests/fin-agent/run-pipeline-smoke.ts
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getSupabaseAdmin } from '../../server/db/supabase.js';
import { _setProvidersForTests } from '../../server/agents/chatAgent/providers/index.js';
import type { ChatLLMProvider, StreamChatResult } from '../../server/agents/chatAgent/providers/types.js';
import {
  runFinPipeline, parseFinConfig, patchFinConfig, loadFinConfig,
  _setEmbedderForTests, type FinScope,
} from '../../server/agents/finAgent/index.js';

const scope: FinScope = { tenantId: 'org_default', workspaceId: 'ws_default' };
const CHUNK_ID = `fin-smoke-chunk-${crypto.randomUUID().slice(0, 8)}`;
const CASE_ID = `fin-smoke-case-${crypto.randomUUID().slice(0, 8)}`;
const CONV_ID = `fin-smoke-conv-${crypto.randomUUID().slice(0, 8)}`;

// ── Fakes ─────────────────────────────────────────────────────────────────────

_setEmbedderForTests(async () => null); // force full-text-only (degraded) path

const calls: string[] = [];
const fakeProvider: ChatLLMProvider = {
  async streamChat(opts): Promise<StreamChatResult> {
    calls.push('generate');
    assert.ok(opts.system.includes('Fin'), 'generate system must carry the identity name');
    assert.ok(opts.system.includes('WORKSPACE GUIDANCE'), 'generate system must carry guidance section');
    const user = opts.messages[0];
    assert.ok(user.role === 'user' && user.content.includes(CHUNK_ID), 'sources must include the seeded chunk');
    const payload = {
      type: 'answer',
      text: 'Para resetear tu contraseña, ve a Ajustes → Seguridad y pulsa "Restablecer contraseña".',
      citations: [CHUNK_ID],
    };
    return {
      text: JSON.stringify(payload),
      toolCalls: [], usage: { inputTokens: 200, outputTokens: 60 },
      stopReason: 'end_turn', model: 'fake-sonnet',
    };
  },
  async completeUtility(opts) {
    if (opts.system.includes('query-refinement')) {
      calls.push('refine');
      return {
        text: JSON.stringify({
          safe: true, unsafe_reason: null, language: 'es',
          refined_query: 'como resetear la contraseña de la cuenta',
          ticket_type: 'how_to', needs_clarification: false, clarifying_question: null,
        }),
        usage: { inputTokens: 50, outputTokens: 40 }, model: 'fake-mini',
      };
    }
    if (opts.system.includes('validation stage')) {
      calls.push('validate');
      assert.ok(opts.prompt.includes('Restablecer contraseña'), 'validator must see the draft');
      return {
        text: JSON.stringify({ score: 0.9, grounded: true, safe: true, missing: [], feedback: '' }),
        usage: { inputTokens: 60, outputTokens: 30 }, model: 'fake-mini',
      };
    }
    if (opts.system.includes('retrieval reranker')) {
      calls.push('rerank');
      return { text: `[{"id":"${CHUNK_ID}","score":9}]`, usage: { inputTokens: 30, outputTokens: 10 }, model: 'fake-mini' };
    }
    throw new Error('unexpected utility call: ' + opts.system.slice(0, 60));
  },
};
_setProvidersForTests(fakeProvider, fakeProvider);

// ── Seed / cleanup ────────────────────────────────────────────────────────────

async function seed() {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  let r = await supabase.from('knowledge_embeddings').insert({
    id: CHUNK_ID, tenant_id: scope.tenantId, workspace_id: scope.workspaceId,
    source_type: 'knowledge_article', source_id: CHUNK_ID, chunk_index: 0,
    chunk_text: 'Para resetear la contraseña de tu cuenta ve a Ajustes → Seguridad y pulsa Restablecer contraseña. Recibirás un email de confirmación.',
    model: 'none', metadata: {},
  });
  if (r.error) throw new Error('seed embeddings: ' + r.error.message);

  r = await supabase.from('cases').insert({
    id: CASE_ID, case_number: CASE_ID, tenant_id: scope.tenantId, workspace_id: scope.workspaceId,
    type: 'question', status: 'new', priority: 'medium', created_at: now, updated_at: now,
  });
  if (r.error) throw new Error('seed case: ' + r.error.message);

  r = await supabase.from('conversations').insert({
    id: CONV_ID, case_id: CASE_ID, tenant_id: scope.tenantId, workspace_id: scope.workspaceId,
    channel: 'chat', status: 'open', created_at: now, updated_at: now,
  });
  if (r.error) throw new Error('seed conversation: ' + r.error.message);

  r = await supabase.from('messages').insert({
    id: crypto.randomUUID(), conversation_id: CONV_ID, case_id: CASE_ID,
    type: 'message', direction: 'inbound', content: '¿Cómo reseteo mi contraseña?',
    content_type: 'text', channel: 'chat', sent_at: now, created_at: now, tenant_id: scope.tenantId,
  });
  if (r.error) throw new Error('seed message: ' + r.error.message);
}

async function cleanup() {
  const supabase = getSupabaseAdmin();
  await supabase.from('messages').delete().eq('conversation_id', CONV_ID);
  await supabase.from('fin_outcomes').delete().eq('case_id', CASE_ID);
  await supabase.from('fin_knowledge_gaps').delete().eq('case_id', CASE_ID);
  await supabase.from('conversations').delete().eq('id', CONV_ID);
  await supabase.from('cases').delete().eq('id', CASE_ID);
  await supabase.from('knowledge_embeddings').delete().eq('id', CHUNK_ID);
  // Leave Fin disabled on the shared default workspace.
  await patchFinConfig(scope, { enabled: false, channels: { chat: { enabled: false } } });
}

// ── Run ───────────────────────────────────────────────────────────────────────

const run = async () => {
  // Config contract first (pure).
  const defaults = parseFinConfig({});
  assert.equal(defaults.enabled, false);
  assert.equal(defaults.identity.name, 'Fin');
  assert.equal(defaults.channels.chat.reply_modes['*'], 'draft_only');
  assert.equal(defaults.validation.confidence_threshold, 0.6);

  await seed();

  // Deep-merge contract: enabling chat must not clobber identity defaults,
  // and adding guidance must survive a later unrelated patch.
  await patchFinConfig(scope, {
    enabled: true,
    channels: { chat: { enabled: true } },
    guidance: [{ id: 'g1', category: 'communication_style', text: 'Responde siempre con cortesía.', active: true }],
  });
  await patchFinConfig(scope, { identity: { tone: 'professional' } });
  const cfg = await loadFinConfig(scope);
  assert.equal(cfg.enabled, true, 'enabled must survive the second patch');
  assert.equal(cfg.identity.tone, 'professional');
  assert.equal(cfg.identity.name, 'Fin', 'identity.name default preserved');
  assert.equal(cfg.guidance.length, 1, 'guidance must survive unrelated patches');

  // Pipeline end-to-end.
  const result = await runFinPipeline({ scope, caseId: CASE_ID, conversationId: CONV_ID, channel: 'chat' });
  console.log('pipeline calls:', calls.join(' → '));
  console.log('status:', result.status, '· confidence:', result.reply?.confidence);

  assert.equal(result.status, 'draft_created', `expected draft_created, got ${result.status}: ${JSON.stringify(result.triage)}`);
  assert.ok(calls.includes('refine') && calls.includes('generate') && calls.includes('validate'), 'all stages must run');
  assert.ok(result.reply, 'must produce a reply');
  assert.equal(result.reply!.isPrivate, true, 'draft_only mode → private draft');
  assert.deepEqual(result.reply!.citations, [CHUNK_ID]);
  assert.equal(result.reply!.confidence, 0.9);

  const supabase = getSupabaseAdmin();

  // Draft persisted with AI columns.
  const { data: draft } = await supabase
    .from('messages').select('*')
    .eq('id', result.reply!.messageId!).maybeSingle();
  assert.ok(draft, 'draft message row must exist');
  assert.equal(draft!.is_private, true);
  assert.equal(draft!.author_type, 'ai');
  assert.equal(draft!.direction, 'outbound');
  assert.deepEqual(draft!.citations, [CHUNK_ID]);
  assert.ok(Number(draft!.confidence) === 0.9);

  // ai_triage persisted per stage.
  const { data: caseRow } = await supabase
    .from('cases').select('ai_triage').eq('id', CASE_ID).maybeSingle();
  const triage: any = caseRow!.ai_triage;
  assert.equal(triage.outcome, 'draft_created');
  assert.equal(triage.classification.ticket_type, 'how_to');
  const stageNames = triage.stages.map((s: any) => s.stage);
  for (const st of ['e1_refine', 'e2_retrieve', 'e3_generate_a1', 'e4_validate_a1', 'e5_deliver']) {
    assert.ok(stageNames.includes(st), `stage ${st} must be logged, got ${stageNames.join(',')}`);
  }
  assert.equal(triage.retrieval.degraded, true, 'no embedder → degraded flag');

  // Outcome event.
  const { data: outcomes } = await supabase
    .from('fin_outcomes').select('*').eq('case_id', CASE_ID);
  assert.equal(outcomes!.length, 1);
  assert.equal(outcomes![0].outcome, 'draft_created');
  assert.equal(outcomes![0].billable, false);

  // Multi-tenant isolation: another tenant retrieves nothing for this query.
  const other: FinScope = { tenantId: 'org_isolation_test', workspaceId: 'ws_isolation_test' };
  const { retrieveKnowledge } = await import('../../server/agents/finAgent/retrieval.js');
  const foreign = await retrieveKnowledge(other, 'resetear contraseña', defaults);
  assert.equal(foreign.chunks.length, 0, 'cross-tenant retrieval must be empty');

  console.log('✓ fin-agent pipeline smoke passed');
};

run()
  .then(cleanup, async (err) => { await cleanup().catch(() => {}); throw err; })
  .catch((err) => { console.error('✗ FAILED:', err); process.exit(1); });
