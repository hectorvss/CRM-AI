/**
 * tests/integration/approval-writeback-ui-e2e.test.ts
 *
 * Verifies the writeback status field flows end-to-end from
 * postApproval → DB → approvals.list / approvals.get → UI badge.
 *
 * Plant 4 approvals in different writeback states and assert each row
 * carries the right `writeback.status` so the UI badge renders the
 * correct colour.
 *
 *   1. PENDING approval                  → writeback.status = 'not_applicable'
 *   2. REJECTED approval                 → writeback.status = 'not_applicable'
 *   3. APPROVED refund, no Stripe creds  → writeback.status = 'pending'
 *   4. APPROVED refund, simulated Stripe → writeback.status = 'completed'
 *   5. APPROVED refund w/ failed Stripe  → writeback.status = 'failed'
 *   6. APPROVED order_cancel, db-only    → writeback.status = 'pending'
 *   7. APPROVED order_cancel, completed  → writeback.status = 'completed'
 *
 * Run:
 *   node --env-file=.env.local node_modules/tsx/dist/cli.mjs \
 *        tests/integration/approval-writeback-ui-e2e.test.ts
 */

import express from 'express';
import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../../server/db/supabase.js';
import approvalsRouter from '../../server/routes/approvals.js';

const TENANT = 'org_default';
const WS = 'ws_default';
const RUN = randomUUID().slice(0, 6);
const supabase = getSupabaseAdmin();

const cleanup = {
  customerIds: [] as string[], orderIds: [] as string[],
  paymentIds: [] as string[], caseIds: [] as string[], approvalIds: [] as string[],
};

interface AR { feature: string; status: 'pass' | 'fail' | 'partial'; detail: string; }
const results: AR[] = [];
const record = (feature: string, status: AR['status'], detail = '') => {
  results.push({ feature, status, detail });
  const tag = status === 'pass' ? '✓' : status === 'partial' ? '◐' : '✗';
  console.log(`  ${tag} ${feature.padEnd(64)} ${detail}`);
};
const section = (t: string) => console.log(`\n  ── ${t} ${'─'.repeat(Math.max(0, 60 - t.length))}`);

const HEADERS = { 'x-tenant-id': TENANT, 'x-workspace-id': WS, 'x-user-id': 'system', 'x-permissions': '*' };

async function plantBase() {
  const customerId = `cust_wbui_${RUN}`;
  const caseId = randomUUID();
  cleanup.customerIds.push(customerId);
  cleanup.caseIds.push(caseId);
  const ins = async (t: string, r: any) => { const { error } = await supabase.from(t).insert(r); if (error) throw new Error(`${t}: ${error.message}`); };
  await ins('customers', { id: customerId, tenant_id: TENANT, workspace_id: WS, canonical_name: `WB UI ${RUN}`, canonical_email: `wbui+${RUN}@test.com` });
  await ins('cases', {
    id: caseId, case_number: `WBUI-${RUN}`, tenant_id: TENANT, workspace_id: WS, customer_id: customerId,
    type: 'refund_request', status: 'open', priority: 'high', source_system: 'manual', source_channel: 'test',
  });
  return { customerId, caseId };
}

async function plantPayment(customerId: string, refundStatus: string, reconciliation: any | null = null) {
  const id = randomUUID();
  cleanup.paymentIds.push(id);
  await supabase.from('payments').insert({
    id, tenant_id: TENANT, workspace_id: WS, customer_id: customerId,
    external_payment_id: `pi_wb_${RUN}_${id.slice(0, 4)}`, psp: 'stripe',
    status: refundStatus === 'succeeded' ? 'refunded' : 'captured',
    amount: 100, currency: 'EUR',
    refund_status: refundStatus,
    reconciliation_details: reconciliation,
  });
  return id;
}

async function plantOrder(customerId: string, systemStates: any) {
  const id = randomUUID();
  cleanup.orderIds.push(id);
  await supabase.from('orders').insert({
    id, tenant_id: TENANT, workspace_id: WS, customer_id: customerId,
    external_order_id: `SHOP-WB-${RUN}-${id.slice(0, 4)}`,
    status: 'cancelled', total_amount: 100, currency: 'EUR',
    system_states: systemStates,
    last_update: 'audit',
  });
  return id;
}

async function plantApproval(caseId: string, opts: {
  status: 'pending' | 'approved' | 'rejected';
  action_type: 'refund' | 'order_cancel';
  paymentId?: string; orderId?: string;
}) {
  const id = randomUUID();
  cleanup.approvalIds.push(id);
  const payload: any = {
    id, tenant_id: TENANT, workspace_id: WS, case_id: caseId,
    action_type: opts.action_type, requested_by: 'system', requested_by_type: 'system',
    risk_level: 'medium',
    action_payload: opts.paymentId
      ? { payment_id: opts.paymentId, amount: 100 }
      : opts.orderId
        ? { order_id: opts.orderId, reason: 'test' }
        : {},
    evidence_package: {},
    status: opts.status,
    decision_by: opts.status !== 'pending' ? 'manager-test' : null,
    decision_at: opts.status !== 'pending' ? new Date().toISOString() : null,
  };
  await supabase.from('approval_requests').insert(payload);
  return id;
}

async function doCleanup() {
  if (cleanup.approvalIds.length) await supabase.from('approval_requests').delete().in('id', cleanup.approvalIds);
  if (cleanup.caseIds.length) await supabase.from('cases').delete().in('id', cleanup.caseIds);
  if (cleanup.paymentIds.length) await supabase.from('payments').delete().in('id', cleanup.paymentIds);
  if (cleanup.orderIds.length) await supabase.from('orders').delete().in('id', cleanup.orderIds);
  if (cleanup.customerIds.length) await supabase.from('customers').delete().in('id', cleanup.customerIds);
}

const app = express();
app.use(express.json());
app.use('/api/approvals', approvalsRouter);
const server = app.listen(0);
const port = (server.address() as any).port;
const base = `http://127.0.0.1:${port}`;
async function get(p: string) { const r = await fetch(`${base}${p}`, { headers: HEADERS }); const t = await r.text(); let body: any; try { body = JSON.parse(t); } catch { body = { raw: t }; } return { status: r.status, body }; }

(async () => {
  console.log(`\n▶ Approval writeback UI E2E (run ${RUN})\n`);
  try {
    const { customerId, caseId } = await plantBase();

    // Plant 7 approvals covering every writeback state
    section('Planting 7 approval rows in different writeback states');

    const a1_pending = await plantApproval(caseId, { status: 'pending', action_type: 'refund', paymentId: await plantPayment(customerId, null as any) });
    const a2_rejected = await plantApproval(caseId, { status: 'rejected', action_type: 'refund', paymentId: await plantPayment(customerId, null as any) });

    // Approved refund, no Stripe writeback yet
    const p3 = await plantPayment(customerId, 'writeback_pending', { writeback_executed_via: 'db-only', writeback_at: new Date().toISOString(), approval_request_id: 'placeholder' });
    const a3_pending_writeback = await plantApproval(caseId, { status: 'approved', action_type: 'refund', paymentId: p3 });

    // Approved refund, Stripe completed
    const p4 = await plantPayment(customerId, 'succeeded', { writeback_executed_via: 'stripe', writeback_external_id: `re_${RUN}_4`, writeback_at: new Date().toISOString(), approval_request_id: 'placeholder' });
    const a4_completed = await plantApproval(caseId, { status: 'approved', action_type: 'refund', paymentId: p4 });

    // Approved refund, Stripe failed
    const p5 = await plantPayment(customerId, 'writeback_pending', { writeback_executed_via: 'db-only', writeback_error: 'Stripe error: charge already refunded', writeback_at: new Date().toISOString(), approval_request_id: 'placeholder' });
    const a5_failed = await plantApproval(caseId, { status: 'approved', action_type: 'refund', paymentId: p5 });

    // Approved order_cancel db-only (oms not synced)
    const o6 = await plantOrder(customerId, { canonical: 'cancelled', oms: 'pending_writeback' });
    const a6_cancel_pending = await plantApproval(caseId, { status: 'approved', action_type: 'order_cancel', orderId: o6 });

    // Approved order_cancel completed (oms synced)
    const o7 = await plantOrder(customerId, { canonical: 'cancelled', oms: 'cancelled' });
    const a7_cancel_completed = await plantApproval(caseId, { status: 'approved', action_type: 'order_cancel', orderId: o7 });

    record('Planted 7 approval rows', 'pass', `pending=1 rejected=1 approved=5`);

    section('GET /api/approvals — list endpoint exposes writeback per row');
    const { status, body } = await get('/api/approvals?limit=200');
    record('GET /api/approvals (200)', status === 200 ? 'pass' : 'fail');
    const list: any[] = Array.isArray(body) ? body : (body?.items ?? []);

    const expectations: Array<{ id: string; expected: string; label: string }> = [
      { id: a1_pending, expected: 'not_applicable', label: 'pending → not_applicable' },
      { id: a2_rejected, expected: 'not_applicable', label: 'rejected → not_applicable' },
      { id: a3_pending_writeback, expected: 'pending', label: 'approved refund, no Stripe → pending' },
      { id: a4_completed, expected: 'completed', label: 'approved refund, Stripe ok → completed' },
      { id: a5_failed, expected: 'failed', label: 'approved refund, Stripe error → failed' },
      { id: a6_cancel_pending, expected: 'pending', label: 'approved cancel, oms not synced → pending' },
      { id: a7_cancel_completed, expected: 'completed', label: 'approved cancel, oms synced → completed' },
    ];

    for (const exp of expectations) {
      const row = list.find((r) => r.id === exp.id);
      const wb = row?.writeback;
      const ok = wb?.status === exp.expected;
      record(exp.label, ok ? 'pass' : 'fail', `got=${wb?.status} executed=${wb?.executedVia ?? 'n/a'}`);
    }

    section('GET /api/approvals/:id — detail endpoint also enriches');
    for (const exp of expectations) {
      const r = await get(`/api/approvals/${exp.id}`);
      const ok = r.status === 200 && r.body?.writeback?.status === exp.expected;
      record(`detail: ${exp.label}`, ok ? 'pass' : 'fail', `got=${r.body?.writeback?.status}`);
    }

    section('Writeback metadata propagation');
    const completedRow = list.find((r) => r.id === a4_completed);
    record('completed.writeback.executedVia = stripe', completedRow?.writeback?.executedVia === 'stripe' ? 'pass' : 'fail');
    record('completed.writeback.externalId populated', !!completedRow?.writeback?.externalId ? 'pass' : 'fail', completedRow?.writeback?.externalId);

    const failedRow = list.find((r) => r.id === a5_failed);
    record('failed.writeback.error captured', !!failedRow?.writeback?.error ? 'pass' : 'fail', failedRow?.writeback?.error?.slice(0, 50));

  } catch (err: any) {
    console.error(`\n  ✗✗ suite threw: ${err?.message ?? String(err)}\n`);
    record('audit-suite', 'fail', err?.message ?? String(err));
  } finally {
    await doCleanup().catch((e) => console.warn('cleanup warn:', e?.message));
    server.close();
  }

  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  console.log(`\n${'─'.repeat(72)}`);
  console.log(`Approval writeback UI E2E: ${pass} pass · ${fail} fail / ${results.length} checks`);
  console.log(`${'─'.repeat(72)}\n`);
  if (fail > 0) {
    console.log('Failures:');
    for (const r of results.filter((x) => x.status === 'fail')) console.log(`  ✗ ${r.feature.padEnd(64)} ${r.detail}`);
  }
  process.exit(fail > 0 ? 1 : 0);
})().catch((err) => { console.error('Suite crashed:', err); server.close(); process.exit(2); });
