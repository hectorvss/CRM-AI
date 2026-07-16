/**
 * tests/fin-agent/run-escalation-smoke.ts
 *
 * P1.2: a deterministic escalation rule (finAttribute.Sentimiento is Negativo)
 * makes Fin hand off to a human instead of answering. Also unit-checks the
 * evaluator directly. Fake providers, no keys.
 *
 * Run: npx tsx tests/fin-agent/run-escalation-smoke.ts
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getSupabaseAdmin } from '../../server/db/supabase.js';
import { _setProvidersForTests } from '../../server/agents/chatAgent/providers/index.js';
import type { ChatLLMProvider, StreamChatResult } from '../../server/agents/chatAgent/providers/types.js';
import { runFinPipeline, patchFinConfig, _setEmbedderForTests, type FinScope } from '../../server/agents/finAgent/index.js';
import { evaluateEscalation } from '../../server/agents/finAgent/escalation.js';

// ── Unit: evaluator ───────────────────────────────────────────────────────────
{
  const rules = [{ id: 'r1', title: 'Frustración alta', conditions: [{ field: 'finAttribute.Sentimiento', operator: 'is', value: 'Negativo' }] }];
  assert.ok(evaluateEscalation(rules, { attributes: { Sentimiento: 'negativo' } })?.ruleId === 'r1', 'is match (case-insensitive)');
  assert.equal(evaluateEscalation(rules, { attributes: { Sentimiento: 'positivo' } }), null, 'no match');
  const multi = [{ id: 'r2', title: 'billing urgente', conditions: [
    { field: 'conversation.category', operator: 'is', value: 'account_billing' },
    { field: 'finAttribute.Urgencia', operator: 'is', value: 'Alta' },
  ] }];
  assert.ok(evaluateEscalation(multi, { attributes: { Urgencia: 'alta' }, ticketType: 'account_billing' })?.ruleId === 'r2', 'AND of conditions');
  assert.equal(evaluateEscalation(multi, { attributes: { Urgencia: 'baja' }, ticketType: 'account_billing' }), null, 'AND fails when one fails');
  assert.equal(evaluateEscalation([{ id: 'empty', title: 'x', conditions: [] }], { attributes: {} }), null, 'empty rule never fires');
  assert.ok(evaluateEscalation([{ id: 'c', title: 'contiene', conditions: [{ field: 'messageData.text', operator: 'contains', value: 'reembolso' }] }], { attributes: {}, message: 'quiero un REEMBOLSO ya' })?.ruleId === 'c', 'contains on message');
  console.log('✓ evaluator unit checks passed');
}

// ── Integration: escalation short-circuits the answer ─────────────────────────
const scope: FinScope = { tenantId: 'org_default', workspaceId: 'ws_default' };
const sfx = crypto.randomUUID().slice(0, 8);
const CASE_ID = `fin-esc-case-${sfx}`;
const CONV_ID = `fin-esc-conv-${sfx}`;
const s = getSupabaseAdmin();
_setEmbedderForTests(async () => null);

let streamCalled = false;
const fake: ChatLLMProvider = {
  async streamChat(): Promise<StreamChatResult> { streamCalled = true; return { text: '{}', toolCalls: [], usage: { inputTokens: 0, outputTokens: 0 }, stopReason: 'end_turn', model: 'fake' }; },
  async completeUtility(opts) {
    if (opts.system.includes('query-refinement'))
      return { text: JSON.stringify({ safe: true, unsafe_reason: null, language: 'es', refined_query: 'muy enfadado', ticket_type: 'diagnostic', needs_clarification: false, clarifying_question: null }), usage: { inputTokens: 0, outputTokens: 0 }, model: 'fake' };
    if (opts.system.includes('configured attributes'))
      return { text: JSON.stringify({ Sentimiento: 'negativo' }), usage: { inputTokens: 0, outputTokens: 0 }, model: 'fake' };
    return { text: '{}', usage: { inputTokens: 0, outputTokens: 0 }, model: 'fake' };
  },
};
_setProvidersForTests(fake, fake);

async function cleanup() {
  await s.from('messages').delete().eq('conversation_id', CONV_ID);
  await s.from('fin_outcomes').delete().eq('case_id', CASE_ID);
  await s.from('conversations').delete().eq('id', CONV_ID);
  await s.from('cases').delete().eq('id', CASE_ID);
  await patchFinConfig(scope, { enabled: false, channels: { chat: { enabled: false } }, attributes: [], escalation: { rules: [] } });
}

const run = async () => {
  await cleanup();
  const now = new Date().toISOString();
  await s.from('cases').insert({ id: CASE_ID, case_number: CASE_ID, tenant_id: scope.tenantId, workspace_id: scope.workspaceId, type: 'question', status: 'open', priority: 'medium', created_at: now, updated_at: now, conversation_id: CONV_ID });
  await s.from('conversations').insert({ id: CONV_ID, case_id: CASE_ID, tenant_id: scope.tenantId, workspace_id: scope.workspaceId, channel: 'chat', status: 'open', created_at: now, updated_at: now });
  await s.from('messages').insert({ id: crypto.randomUUID(), conversation_id: CONV_ID, case_id: CASE_ID, type: 'message', direction: 'inbound', content: 'Estoy MUY enfadado', content_type: 'text', channel: 'chat', sent_at: now, created_at: now, tenant_id: scope.tenantId, author_type: 'customer', is_private: false });

  await patchFinConfig(scope, {
    enabled: true,
    channels: { chat: { enabled: true, reply_modes: { '*': 'draft_only' } } },
    attributes: [{ name: 'Sentimiento', description: 'Estado emocional', type: 'select', options: ['positivo', 'negativo'], enabled: true }],
    escalation: { rules: [{ id: 'esc1', title: 'Cliente muy frustrado', active: true, conditions: [{ field: 'finAttribute.Sentimiento', operator: 'is', value: 'Negativo' }] }], default_team: 'team_support' },
  });

  const result = await runFinPipeline({ scope, caseId: CASE_ID, conversationId: CONV_ID, channel: 'chat' });
  console.log('status:', result.status, '· triage.outcome:', (result.triage as any).outcome, '· escalation:', JSON.stringify((result.triage as any).escalation));

  assert.equal(result.status, 'escalated', 'must escalate');
  assert.equal((result.triage as any).outcome, 'escalated_by_rule');
  assert.equal(streamCalled, false, 'must NOT generate an answer when escalating');
  const { data: caseRow } = await s.from('cases').select('escalation_reason, assigned_team_id').eq('id', CASE_ID).maybeSingle();
  assert.ok(String(caseRow!.escalation_reason).includes('Cliente muy frustrado'), 'escalation_reason set');
  assert.equal(caseRow!.assigned_team_id, 'team_support', 'routed to default_team');
  const { data: outcomes } = await s.from('fin_outcomes').select('outcome, billable').eq('case_id', CASE_ID);
  assert.ok(outcomes!.some((o: any) => o.outcome === 'escalated' && !o.billable), 'non-billable escalated outcome recorded');

  console.log('✓ fin-agent escalation smoke passed');
};

run().then(cleanup, async (e) => { await cleanup().catch(() => {}); throw e; })
  .catch((err) => { console.error('✗ FAILED:', err); process.exit(1); });
