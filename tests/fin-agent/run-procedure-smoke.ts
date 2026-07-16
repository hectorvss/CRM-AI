/**
 * tests/fin-agent/run-procedure-smoke.ts
 *
 * F4 smoke without LLM keys — full procedure lifecycle through the REAL
 * pipeline entry point:
 *  1. intent match → run created, executor asks for the missing variable
 *     (waiting_customer)
 *  2. customer provides it → executor runs a write_approval connector action
 *     → fin_pending_actions row + run waiting_approval
 *  3. decidePendingAction(approve) executes the action (internal tool) and
 *     resumeRunAfterApproval reactivates the run
 *  4. next turn → handoff → run completed + billable procedure_handoff outcome
 *
 * Run: npx tsx tests/fin-agent/run-procedure-smoke.ts
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getSupabaseAdmin } from '../../server/db/supabase.js';
import { registerAllTools } from '../../server/agents/planEngine/tools/index.js';
import { toolRegistry } from '../../server/agents/planEngine/registry.js';
import { _setProvidersForTests } from '../../server/agents/chatAgent/providers/index.js';
import type { ChatLLMProvider, StreamChatResult } from '../../server/agents/chatAgent/providers/types.js';
import {
  runFinPipeline, patchFinConfig, decidePendingAction, resumeRunAfterApproval,
  _setEmbedderForTests, type FinScope,
} from '../../server/agents/finAgent/index.js';

toolRegistry._resetForTests();
registerAllTools();
const READ_TOOL = ['case.list', 'case.search', 'case.get'].find((n) => toolRegistry.get(n))!;

const scope: FinScope = { tenantId: 'org_default', workspaceId: 'ws_default' };
const sfx = crypto.randomUUID().slice(0, 8);
const CASE_ID = `fin-proc-case-${sfx}`;
const CONV_ID = `fin-proc-conv-${sfx}`;
let PROC_ID = '';
let CONNECTOR_ID = '';
let ACTION_ID = '';

_setEmbedderForTests(async () => null);

// ── Scripted providers ────────────────────────────────────────────────────────
let turnNo = 0;
const fake: ChatLLMProvider = {
  async streamChat(opts): Promise<StreamChatResult> {
    // The procedure-turn executor is the only streamChat caller in this test.
    assert.ok(opts.system.includes('PROCEDURE'), 'only the procedure executor should call streamChat');
    turnNo++;
    let payload: any;
    if (turnNo === 1) {
      // First turn: order number missing → ask.
      payload = { say: '¿Me indicas tu número de pedido?', set_variables: {}, goto_step: 0, op: 'ask', otp_code: null, handoff_note: null };
    } else if (turnNo === 2) {
      // Customer gave the order number → move to the action step and run it.
      payload = { say: null, set_variables: { order_number: 'PED-1001' }, goto_step: 1, op: 'run_action', otp_code: null, handoff_note: null };
    } else {
      // Post-approval turn → hand off.
      payload = { say: 'He solicitado el reembolso. Te paso con el equipo para confirmarlo.', set_variables: {}, goto_step: 2, op: 'handoff', otp_code: null, handoff_note: 'refund requested' };
    }
    return { text: JSON.stringify(payload), toolCalls: [], usage: { inputTokens: 100, outputTokens: 50 }, stopReason: 'end_turn', model: 'fake-sonnet' };
  },
  async completeUtility(opts) {
    if (opts.system.includes('query-refinement')) {
      return {
        text: JSON.stringify({ safe: true, unsafe_reason: null, language: 'es', refined_query: 'quiero un reembolso de mi pedido', ticket_type: 'account_billing', needs_clarification: false, clarifying_question: null }),
        usage: { inputTokens: 40, outputTokens: 30 }, model: 'fake-mini',
      };
    }
    if (opts.system.includes('route customer-support requests')) {
      assert.ok(opts.prompt.includes(PROC_ID), 'matcher must see the live procedure');
      return { text: JSON.stringify({ procedure_id: PROC_ID }), usage: { inputTokens: 30, outputTokens: 10 }, model: 'fake-mini' };
    }
    if (opts.system.includes('outcome-detection')) {
      return { text: '{"verdict":"more_help"}', usage: { inputTokens: 20, outputTokens: 5 }, model: 'fake-mini' };
    }
    throw new Error('unexpected utility call: ' + opts.system.slice(0, 50));
  },
};
_setProvidersForTests(fake, fake);

// ── Seed / cleanup ────────────────────────────────────────────────────────────
async function seed() {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  let r = await supabase.from('fin_connectors').insert({
    tenant_id: scope.tenantId, workspace_id: scope.workspaceId,
    name: 'CRM interno', kind: 'internal', active: true,
  }).select('id').single();
  if (r.error) throw new Error('seed connector: ' + r.error.message);
  CONNECTOR_ID = r.data.id;

  r = await supabase.from('fin_connector_actions').insert({
    connector_id: CONNECTOR_ID, tenant_id: scope.tenantId, workspace_id: scope.workspaceId,
    name: 'Solicitar reembolso', description: 'Solicita un reembolso para un pedido',
    tool_name: READ_TOOL, // a real registry tool so approve→execute works keylessly
    policy: 'write_approval', requires_identity: false,
  }).select('id').single();
  if (r.error) throw new Error('seed action: ' + r.error.message);
  ACTION_ID = r.data.id;

  r = await supabase.from('fin_procedures').insert({
    tenant_id: scope.tenantId, workspace_id: scope.workspaceId,
    name: 'Reembolso de pedido',
    description: 'Gestiona solicitudes de reembolso',
    trigger_criteria: 'El cliente pide un reembolso o devolución de dinero de un pedido',
    status: 'live',
    steps: [
      { type: 'collect', variable: 'order_number', prompt: 'Pide el número de pedido' },
      { type: 'action', action_id: ACTION_ID, args_template: { limit: '1' }, preview: 'Solicitar reembolso {{order_number}}' },
      { type: 'handoff', team: 'billing', note: 'Confirmar reembolso' },
    ],
  }).select('id').single();
  if (r.error) throw new Error('seed procedure: ' + r.error.message);
  PROC_ID = r.data.id;

  r = await supabase.from('cases').insert({
    id: CASE_ID, case_number: CASE_ID, tenant_id: scope.tenantId, workspace_id: scope.workspaceId,
    type: 'billing', status: 'new', priority: 'medium', created_at: now, updated_at: now, conversation_id: CONV_ID,
  }) as any;
  if (r.error) throw new Error('seed case: ' + r.error.message);
  r = await supabase.from('conversations').insert({
    id: CONV_ID, case_id: CASE_ID, tenant_id: scope.tenantId, workspace_id: scope.workspaceId,
    channel: 'chat', status: 'open', created_at: now, updated_at: now,
  }) as any;
  if (r.error) throw new Error('seed conversation: ' + r.error.message);
}

async function addInbound(content: string) {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await supabase.from('messages').insert({
    id: crypto.randomUUID(), conversation_id: CONV_ID, case_id: CASE_ID,
    type: 'message', direction: 'inbound', content, content_type: 'text',
    channel: 'chat', sent_at: now, created_at: now, tenant_id: scope.tenantId,
  });
  if (error) throw new Error('addInbound: ' + error.message);
}

async function cleanup() {
  const supabase = getSupabaseAdmin();
  await supabase.from('messages').delete().eq('conversation_id', CONV_ID);
  await supabase.from('fin_pending_actions').delete().eq('case_id', CASE_ID);
  await supabase.from('fin_procedure_runs').delete().eq('case_id', CASE_ID);
  await supabase.from('fin_outcomes').delete().eq('case_id', CASE_ID);
  if (PROC_ID) await supabase.from('fin_procedures').delete().eq('id', PROC_ID);
  if (CONNECTOR_ID) await supabase.from('fin_connectors').delete().eq('id', CONNECTOR_ID);
  await supabase.from('conversations').delete().eq('id', CONV_ID);
  await supabase.from('cases').delete().eq('id', CASE_ID);
  await patchFinConfig(scope, { enabled: false, channels: { chat: { enabled: false } } });
}

// ── Run ───────────────────────────────────────────────────────────────────────
const run = async () => {
  await seed();
  await patchFinConfig(scope, { enabled: true, channels: { chat: { enabled: true } } });
  const supabase = getSupabaseAdmin();

  // Turn 1: intent match → run created, executor asks for the order number.
  await addInbound('Hola, quiero un reembolso de mi pedido');
  const r1 = await runFinPipeline({ scope, caseId: CASE_ID, conversationId: CONV_ID, channel: 'chat' });
  assert.equal(r1.status, 'draft_created', `t1: ${JSON.stringify(r1.triage)}`);
  assert.ok(r1.reply?.text?.includes('número de pedido'), 't1 must ask for the order number');
  const { data: runs1 } = await supabase.from('fin_procedure_runs').select('*').eq('case_id', CASE_ID);
  assert.equal(runs1!.length, 1);
  assert.equal(runs1![0].status, 'waiting_customer');

  // Turn 2: customer provides it → action step → pending approval.
  await addInbound('Es el PED-1001');
  const r2 = await runFinPipeline({ scope, caseId: CASE_ID, conversationId: CONV_ID, channel: 'chat' });
  const { data: runs2 } = await supabase.from('fin_procedure_runs').select('*').eq('case_id', CASE_ID);
  assert.equal(runs2![0].status, 'waiting_approval', `t2 run: ${JSON.stringify(runs2![0])} · result ${JSON.stringify(r2.triage)}`);
  assert.equal(runs2![0].state.order_number, 'PED-1001', 'variable must be captured');
  const { data: pend } = await supabase.from('fin_pending_actions').select('*').eq('case_id', CASE_ID).eq('status', 'pending');
  assert.equal(pend!.length, 1, 'one pending approval');

  // While waiting_approval a new customer message must NOT advance the run.
  await addInbound('¿va todo bien?');
  const r2b = await runFinPipeline({ scope, caseId: CASE_ID, conversationId: CONV_ID, channel: 'chat' });
  const { data: runs2b } = await supabase.from('fin_procedure_runs').select('*').eq('case_id', CASE_ID);
  assert.equal(runs2b![0].status, 'waiting_approval', 'approval gate must hold');

  // 3. Approve → executes the internal tool + resumes the run.
  const decided = await decidePendingAction(scope, pend![0].id, 'approved', 'smoke-operator');
  assert.equal(decided.ok, true, `approve failed: ${decided.error}`);
  await resumeRunAfterApproval(scope, runs2![0].id, true, decided.result ?? null);
  const { data: pendAfter } = await supabase.from('fin_pending_actions').select('status').eq('id', pend![0].id).maybeSingle();
  assert.equal(pendAfter!.status, 'executed');
  const { data: runs3 } = await supabase.from('fin_procedure_runs').select('*').eq('case_id', CASE_ID);
  assert.equal(runs3![0].status, 'active', 'run must reactivate after approval');

  // 4. Next turn → handoff → completed + billable procedure_handoff.
  await addInbound('¿ya está entonces?');
  const r4 = await runFinPipeline({ scope, caseId: CASE_ID, conversationId: CONV_ID, channel: 'chat' });
  assert.equal(r4.status, 'escalated', `t4: ${JSON.stringify(r4.triage)}`);
  const { data: runs4 } = await supabase.from('fin_procedure_runs').select('*').eq('case_id', CASE_ID);
  assert.equal(runs4![0].status, 'completed');
  const { data: outcomes } = await supabase.from('fin_outcomes').select('*').eq('case_id', CASE_ID).eq('outcome', 'procedure_handoff');
  assert.equal(outcomes!.length, 1, 'billable procedure_handoff recorded');
  assert.equal(outcomes![0].billable, true);
  const { data: caseRow } = await supabase.from('cases').select('escalation_reason').eq('id', CASE_ID).maybeSingle();
  assert.ok(String(caseRow!.escalation_reason).startsWith('fin_procedure_handoff'), 'escalation reason set');

  console.log('✓ fin-agent procedure lifecycle smoke passed');
};

run()
  .then(cleanup, async (err) => { await cleanup().catch(() => {}); throw err; })
  .catch((err) => { console.error('✗ FAILED:', err); process.exit(1); });
