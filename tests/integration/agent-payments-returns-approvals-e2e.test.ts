/**
 * tests/integration/agent-payments-returns-approvals-e2e.test.ts
 *
 * Proves the AI agent / Super Agent / connected integrations can execute
 * actions on the same payments/returns/approvals categories the UI uses,
 * with NO hardcoded paths.
 *
 * For each domain:
 *   1. Plant a synthetic row in Supabase
 *   2. Have the Plan Engine invoke the tool (same path the LLM would use)
 *   3. Read the row back and assert the DB state mutated as expected
 *   4. Verify the audit log captured the action with source=plan-engine
 *
 * Tools exercised:
 *   - payment.get / payment.refund
 *   - return.get / return.approve / return.reject / return.update_status
 *   - approval.get / approval.list / approval.decide (approved + rejected)
 *   - order.cancel  (for completeness — same agent pattern)
 *
 * Run:
 *   node --env-file=.env.local node_modules/tsx/dist/cli.mjs \
 *        tests/integration/agent-payments-returns-approvals-e2e.test.ts
 */

import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../../server/db/supabase.js';
import { invokeTool } from '../../server/agents/planEngine/invokeTool.js';
import { planEngine } from '../../server/agents/planEngine/index.js';

planEngine.init();

const TENANT = 'org_default';
const WS = 'ws_default';
const RUN = randomUUID().slice(0, 6);
const supabase = getSupabaseAdmin();

const cleanup = {
  customerIds: [] as string[],
  orderIds:    [] as string[],
  paymentIds:  [] as string[],
  returnIds:   [] as string[],
  approvalIds: [] as string[],
  caseIds:     [] as string[],
};

interface AR { feature: string; status: 'pass' | 'fail' | 'partial'; detail: string; }
const results: AR[] = [];
const record = (feature: string, status: AR['status'], detail = '') => {
  results.push({ feature, status, detail });
  const tag = status === 'pass' ? '✓' : status === 'partial' ? '◐' : '✗';
  console.log(`  ${tag} ${feature.padEnd(64)} ${detail}`);
};
const section = (t: string) => console.log(`\n  ── ${t} ${'─'.repeat(Math.max(0, 60 - t.length))}`);

// Mimic what the Super Agent / Copilot / API route passes to invokeTool.
const callerCtx = {
  tenantId: TENANT,
  workspaceId: WS,
  userId: 'agent-e2e-test',
  hasPermission: (_perm: string) => true,
  dryRun: false,
  planId: `agent-e2e-${RUN}`,
};

async function plant() {
  const customerId = `cust_aprx_${RUN}`;
  const orderId = randomUUID();
  const paymentId = randomUUID();
  const returnId = randomUUID();
  const approvalId = randomUUID();
  const caseId = randomUUID();

  cleanup.customerIds.push(customerId);
  cleanup.orderIds.push(orderId);
  cleanup.paymentIds.push(paymentId);
  cleanup.returnIds.push(returnId);
  cleanup.approvalIds.push(approvalId);
  cleanup.caseIds.push(caseId);

  const ins = async (t: string, r: any) => { const { error } = await supabase.from(t).insert(r); if (error) throw new Error(`${t}: ${error.message}`); };

  await ins('customers', {
    id: customerId, tenant_id: TENANT, workspace_id: WS,
    canonical_name: `Agent E2E ${RUN}`, canonical_email: `agent+${RUN}@test.com`,
    segment: 'standard', risk_level: 'low',
  });
  await ins('orders', {
    id: orderId, tenant_id: TENANT, workspace_id: WS, customer_id: customerId,
    external_order_id: `SHOP-AGT-${RUN}`,
    status: 'pending', fulfillment_status: 'awaiting_payment',
    total_amount: 100, currency: 'EUR',
  });
  await ins('payments', {
    id: paymentId, tenant_id: TENANT, workspace_id: WS, customer_id: customerId, order_id: orderId,
    external_payment_id: `pi_agt_${RUN}`, psp: 'stripe',
    status: 'captured', amount: 30, currency: 'EUR', risk_level: 'low',
  });
  await ins('returns', {
    id: returnId, tenant_id: TENANT, workspace_id: WS, customer_id: customerId, order_id: orderId,
    external_return_id: `RMA-AGT-${RUN}`, status: 'pending_review', return_reason: 'damaged',
    return_value: 30, currency: 'EUR',
  });
  await ins('cases', {
    id: caseId, case_number: `AGT-${RUN}`,
    tenant_id: TENANT, workspace_id: WS, customer_id: customerId,
    type: 'refund_request', status: 'open', priority: 'medium',
    source_system: 'manual', source_channel: 'test',
    order_ids: [orderId], payment_ids: [paymentId], return_ids: [returnId],
  });
  await ins('approval_requests', {
    id: approvalId, tenant_id: TENANT, workspace_id: WS, case_id: caseId,
    action_type: 'refund', requested_by: 'system', requested_by_type: 'system',
    risk_level: 'low', action_payload: {}, evidence_package: {}, status: 'pending',
  });
  return { customerId, orderId, paymentId, returnId, approvalId, caseId };
}

async function doCleanup() {
  if (cleanup.approvalIds.length) await supabase.from('approval_requests').delete().in('id', cleanup.approvalIds);
  if (cleanup.caseIds.length) await supabase.from('cases').delete().in('id', cleanup.caseIds);
  if (cleanup.returnIds.length) await supabase.from('returns').delete().in('id', cleanup.returnIds);
  if (cleanup.paymentIds.length) await supabase.from('payments').delete().in('id', cleanup.paymentIds);
  if (cleanup.orderIds.length) await supabase.from('orders').delete().in('id', cleanup.orderIds);
  if (cleanup.customerIds.length) await supabase.from('customers').delete().in('id', cleanup.customerIds);
}

async function callTool(name: string, args: any) {
  return invokeTool({
    toolName: name,
    args,
    tenantId: TENANT,
    workspaceId: WS,
    userId: callerCtx.userId,
    hasPermission: callerCtx.hasPermission,
    dryRun: false,
    planId: callerCtx.planId,
  });
}

(async () => {
  console.log(`\n▶ Agent → Payments / Returns / Approvals E2E (run ${RUN})\n`);
  let paymentId = '', returnId = '', approvalId = '', orderId = '', caseId = '';
  try {
    ({ paymentId, returnId, approvalId, orderId, caseId } = await plant());
    console.log(`  · planted payment=${paymentId.slice(0, 8)} return=${returnId.slice(0, 8)} approval=${approvalId.slice(0, 8)} order=${orderId.slice(0, 8)}\n`);

    section('PAYMENTS — agent invokes payment.* tools');
    {
      const r = await callTool('payment.get', { paymentId });
      record('payment.get returns the planted row', r.ok ? 'pass' : 'fail', JSON.stringify(r).slice(0, 80));
    }
    {
      const r = await callTool('payment.refund', { paymentId, amount: 30, reason: `agent e2e ${RUN}` });
      record('payment.refund executed by agent', r.ok ? 'pass' : 'fail', JSON.stringify(r.value || r.error).slice(0, 80));
    }
    {
      // DB state must reflect the agent's action (the most important assertion)
      const { data } = await supabase.from('payments').select('status, refund_amount, refund_status').eq('id', paymentId).maybeSingle();
      record('Payment DB row updated by agent (status=refunded)', data?.status === 'refunded' ? 'pass' : 'fail', `status=${data?.status} refund_amount=${data?.refund_amount}`);
      record('Payment DB row updated (refund_amount=30)', Number(data?.refund_amount) === 30 ? 'pass' : 'fail');
    }
    {
      const { data: audit } = await supabase.from('audit_events').select('action').eq('entity_id', paymentId).eq('action', 'PLAN_ENGINE_PAYMENT_REFUNDED').limit(1);
      record('Audit log captured plan-engine refund', (audit?.length ?? 0) > 0 ? 'pass' : 'fail', `entries=${audit?.length ?? 0}`);
    }

    section('RETURNS — agent invokes return.* tools');
    {
      const r = await callTool('return.get', { returnId });
      record('return.get returns planted row', r.ok ? 'pass' : 'fail');
    }
    {
      const r = await callTool('return.approve', { returnId, reason: 'agent approved damaged' });
      record('return.approve executed by agent', r.ok ? 'pass' : 'fail', JSON.stringify(r.value || r.error).slice(0, 80));
    }
    {
      const { data } = await supabase.from('returns').select('status').eq('id', returnId).maybeSingle();
      record('Return DB row status=approved', data?.status === 'approved' ? 'pass' : 'fail', data?.status || 'null');
    }
    {
      const r = await callTool('return.update_status', { returnId, status: 'received', note: 'arrived at warehouse' });
      record('return.update_status received', r.ok ? 'pass' : 'fail');
      const { data } = await supabase.from('returns').select('status').eq('id', returnId).maybeSingle();
      record('Return DB row status=received after update', data?.status === 'received' ? 'pass' : 'fail');
    }
    {
      const r = await callTool('return.update_status', { returnId, status: 'inspected' });
      record('return.update_status inspected', r.ok ? 'pass' : 'fail');
    }
    {
      const r = await callTool('return.update_status', { returnId, status: 'refunded' });
      record('return.update_status refunded', r.ok ? 'pass' : 'fail');
      const { data } = await supabase.from('returns').select('status').eq('id', returnId).maybeSingle();
      record('Return DB row final status=refunded', data?.status === 'refunded' ? 'pass' : 'fail');
    }
    {
      // Plant a fresh return so we can prove rejection too
      const reject = randomUUID();
      cleanup.returnIds.push(reject);
      await supabase.from('returns').insert({
        id: reject, tenant_id: TENANT, workspace_id: WS, customer_id: cleanup.customerIds[0], order_id: orderId,
        external_return_id: `RMA-AGT-REJ-${RUN}`, status: 'pending_review', return_reason: 'agent reject test',
        return_value: 30, currency: 'EUR',
      });
      const r = await callTool('return.reject', { returnId: reject, reason: 'fraud signals detected by agent' });
      record('return.reject executed by agent', r.ok ? 'pass' : 'fail');
      const { data } = await supabase.from('returns').select('status').eq('id', reject).maybeSingle();
      record('Rejected return DB row status=rejected', data?.status === 'rejected' ? 'pass' : 'fail');
    }

    section('APPROVALS — agent invokes approval.* tools');
    {
      const r = await callTool('approval.list', { limit: 10 });
      record('approval.list returns rows', r.ok && Array.isArray((r.value as any)?.items ?? r.value) ? 'pass' : 'fail');
    }
    {
      const r = await callTool('approval.get', { approvalId });
      record('approval.get returns planted row', r.ok ? 'pass' : 'fail');
    }
    {
      // Plant a separate approval to test the rejected path
      const reject = randomUUID();
      cleanup.approvalIds.push(reject);
      await supabase.from('approval_requests').insert({
        id: reject, tenant_id: TENANT, workspace_id: WS, case_id: caseId,
        action_type: 'refund', requested_by: 'system', requested_by_type: 'system',
        risk_level: 'low', action_payload: {}, evidence_package: {}, status: 'pending',
      });
      const r = await callTool('approval.decide', { approvalId: reject, decision: 'rejected', note: 'agent rejection' });
      record('approval.decide(rejected) executed by agent', r.ok ? 'pass' : 'fail');
    }
    {
      const r = await callTool('approval.decide', { approvalId, decision: 'approved', note: 'agent approval e2e' });
      record('approval.decide(approved) executed by agent', r.ok ? 'pass' : 'fail');
      const { data } = await supabase.from('approval_requests').select('status, decision_by, decision_at').eq('id', approvalId).maybeSingle();
      record('Approval DB row reflects agent decision (status changed)', data?.status && data.status !== 'pending' ? 'pass' : 'fail', `status=${data?.status} by=${data?.decision_by}`);
    }
    {
      // Re-decide should fail (idempotency at the repo layer)
      const r = await callTool('approval.decide', { approvalId, decision: 'rejected' });
      record('Re-decide blocked at repo layer', !r.ok ? 'pass' : 'fail');
    }

    section('ORDERS — agent invokes order.cancel (same shell)');
    {
      const r = await callTool('order.cancel', { orderId, reason: `agent cancel ${RUN}` });
      record('order.cancel executed by agent', r.ok ? 'pass' : 'fail', JSON.stringify(r.value || r.error).slice(0, 80));
      const { data } = await supabase.from('orders').select('status').eq('id', orderId).maybeSingle();
      record('Order DB row reflects cancel intent', data?.status && data.status !== 'pending' ? 'pass' : 'fail', `status=${data?.status}`);
    }

    section('Verification — no mocks, all writes hit DB');
    {
      // Roll up: how many audit entries with source=plan-engine did this run produce?
      const { data } = await supabase.from('audit_events')
        .select('id, action, entity_id')
        .like('action', 'PLAN_ENGINE_%')
        .gte('occurred_at', new Date(Date.now() - 60_000).toISOString())
        .limit(50);
      const count = data?.length ?? 0;
      record(`PLAN_ENGINE_* audit entries created in last minute`, count >= 4 ? 'pass' : 'fail', `entries=${count}`);
    }

  } catch (err: any) {
    console.error(`\n  ✗✗ suite threw: ${err?.message ?? String(err)}\n`);
    record('audit-suite', 'fail', err?.message ?? String(err));
  } finally {
    await doCleanup().catch((e) => console.warn('cleanup warn:', e?.message));
  }

  const pass = results.filter((r) => r.status === 'pass').length;
  const partial = results.filter((r) => r.status === 'partial').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  console.log(`\n${'─'.repeat(78)}`);
  console.log(`Agent → P/R/A E2E: ${pass} pass · ${partial} partial · ${fail} fail / ${results.length} checks`);
  console.log(`${'─'.repeat(78)}\n`);
  if (fail > 0) {
    console.log('Failures:');
    for (const r of results.filter((x) => x.status === 'fail')) console.log(`  ✗ ${r.feature.padEnd(64)} ${r.detail}`);
  }
  process.exit(fail > 0 ? 1 : 0);
})().catch((err) => { console.error('Suite crashed:', err); process.exit(2); });
