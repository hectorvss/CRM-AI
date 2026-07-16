/**
 * tests/fin-agent/run-outcome-smoke.ts
 *
 * Outcome Engine smoke (spec §7) without LLM keys:
 *  1. sweep: last public message = AI reply older than 24h → resolution_assumed (billable)
 *  2. customer returns asking for more help → the assumed resolution is REVERTED
 *  3. customer later confirms ("gracias, solucionado") → resolution_confirmed (billable)
 *  4. one-billable-per-conversation: a second confirmation does not double-bill
 *
 * Run: npx tsx tests/fin-agent/run-outcome-smoke.ts
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getSupabaseAdmin } from '../../server/db/supabase.js';
import { _setProvidersForTests } from '../../server/agents/chatAgent/providers/index.js';
import type { ChatLLMProvider, StreamChatResult } from '../../server/agents/chatAgent/providers/types.js';
import {
  handleInboundOutcome, sweepAssumedResolutions, hasActiveBillableOutcome,
  type FinScope,
} from '../../server/agents/finAgent/index.js';

const scope: FinScope = { tenantId: 'org_default', workspaceId: 'ws_default' };
const CASE_ID = `fin-outcome-case-${crypto.randomUUID().slice(0, 8)}`;
const CONV_ID = `fin-outcome-conv-${crypto.randomUUID().slice(0, 8)}`;

const fakeProvider: ChatLLMProvider = {
  async streamChat(): Promise<StreamChatResult> { throw new Error('streamChat must not be called'); },
  async completeUtility(opts) {
    // Outcome classification: "necesito más ayuda…" → more_help
    assert.ok(opts.system.includes('outcome-detection'), 'only the outcome classifier may run');
    return { text: '{"verdict":"more_help"}', usage: { inputTokens: 20, outputTokens: 6 }, model: 'fake-mini' };
  },
};
_setProvidersForTests(fakeProvider, fakeProvider);

async function seed() {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const old = new Date(Date.now() - 25 * 3_600_000).toISOString(); // 25h ago

  let r = await supabase.from('cases').insert({
    id: CASE_ID, case_number: CASE_ID, tenant_id: scope.tenantId, workspace_id: scope.workspaceId,
    type: 'question', status: 'open', priority: 'medium', created_at: old, updated_at: now,
    conversation_id: CONV_ID,
    ai_triage: { outcome: 'replied', run_id: 'fin-run-test' },
  });
  if (r.error) throw new Error('seed case: ' + r.error.message);

  r = await supabase.from('conversations').insert({
    id: CONV_ID, case_id: CASE_ID, tenant_id: scope.tenantId, workspace_id: scope.workspaceId,
    channel: 'chat', status: 'open', created_at: old, updated_at: now,
  });
  if (r.error) throw new Error('seed conversation: ' + r.error.message);

  // Customer question + published AI reply, both >24h old.
  for (const [i, m] of ([
    { direction: 'inbound', content: '¿Cómo exporto mis datos?', author_type: 'customer', is_private: false },
    { direction: 'outbound', content: 'Puedes exportar desde Ajustes → Datos.', author_type: 'ai', is_private: false },
  ] as const).entries()) {
    r = await supabase.from('messages').insert({
      id: crypto.randomUUID(), conversation_id: CONV_ID, case_id: CASE_ID,
      type: 'message', direction: m.direction, content: m.content, content_type: 'text',
      channel: 'chat', sent_at: new Date(Date.parse(old) + i * 60000).toISOString(),
      created_at: old, tenant_id: scope.tenantId,
      author_type: m.author_type, is_private: m.is_private,
    });
    if (r.error) throw new Error('seed message: ' + r.error.message);
  }
}

async function cleanup() {
  const supabase = getSupabaseAdmin();
  await supabase.from('messages').delete().eq('conversation_id', CONV_ID);
  await supabase.from('fin_outcomes').delete().eq('case_id', CASE_ID);
  await supabase.from('conversations').delete().eq('id', CONV_ID);
  await supabase.from('cases').delete().eq('id', CASE_ID);
}

const run = async () => {
  await seed();
  const supabase = getSupabaseAdmin();

  // 1. Sweep → assumed resolution (billable), ai_resolved=true.
  const sweep = await sweepAssumedResolutions({ limit: 100 });
  console.log('sweep:', JSON.stringify(sweep));
  const { data: afterSweep } = await supabase.from('fin_outcomes').select('*').eq('case_id', CASE_ID);
  assert.equal(afterSweep!.length, 1, 'sweep must record exactly one outcome');
  assert.equal(afterSweep![0].outcome, 'resolution_assumed');
  assert.equal(afterSweep![0].billable, true);
  const { data: c1 } = await supabase.from('cases').select('ai_resolved, ai_triage').eq('id', CASE_ID).maybeSingle();
  assert.equal(c1!.ai_resolved, true);
  assert.equal((c1!.ai_triage as any).outcome, 'resolution_assumed');

  // Idempotence: a second sweep must not double-bill.
  await sweepAssumedResolutions({ limit: 100 });
  const { data: afterSweep2 } = await supabase.from('fin_outcomes').select('*').eq('case_id', CASE_ID);
  assert.equal(afterSweep2!.length, 1, 'second sweep must be a no-op');

  // 2. Customer returns needing more help → reverted (refund semantics).
  const action1 = await handleInboundOutcome({
    scope, caseId: CASE_ID, conversationId: CONV_ID,
    latestInboundText: 'necesito más ayuda, no encuentro esa opción en Ajustes',
  });
  assert.equal(action1, 'continue', 'more_help must continue into a normal run');
  const { data: reverted } = await supabase.from('fin_outcomes').select('*').eq('case_id', CASE_ID);
  assert.equal(reverted![0].reverted, true, 'assumed resolution must be reverted');
  assert.ok(await hasActiveBillableOutcome(scope, CONV_ID) === false, 'no active billable after revert');
  const { data: c2 } = await supabase.from('cases').select('ai_resolved').eq('id', CASE_ID).maybeSingle();
  assert.equal(c2!.ai_resolved, false, 'revert must clear ai_resolved');

  // 3. Customer confirms (heuristic path, no LLM) → confirmed resolution (billable).
  const action2 = await handleInboundOutcome({
    scope, caseId: CASE_ID, conversationId: CONV_ID,
    latestInboundText: '¡Muchas gracias!',
  });
  assert.equal(action2, 'skip_run', 'confirmation must skip the answer pipeline');
  const { data: confirmed } = await supabase.from('fin_outcomes').select('*').eq('case_id', CASE_ID).order('created_at');
  assert.equal(confirmed!.length, 2);
  assert.equal(confirmed![1].outcome, 'resolution_confirmed');
  assert.equal(confirmed![1].billable, true);
  assert.equal(confirmed![1].reverted, false);

  // 4. One billable per conversation: another confirmation is a no-op.
  await handleInboundOutcome({
    scope, caseId: CASE_ID, conversationId: CONV_ID,
    latestInboundText: 'gracias',
  });
  const { data: final } = await supabase.from('fin_outcomes').select('*').eq('case_id', CASE_ID);
  assert.equal(final!.filter((o: any) => o.billable && !o.reverted).length, 1, 'exactly one active billable outcome');

  console.log('✓ fin-agent outcome engine smoke passed');
};

run()
  .then(cleanup, async (err) => { await cleanup().catch(() => {}); throw err; })
  .catch((err) => { console.error('✗ FAILED:', err); process.exit(1); });
