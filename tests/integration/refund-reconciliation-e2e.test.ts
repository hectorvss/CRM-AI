/**
 * tests/integration/refund-reconciliation-e2e.test.ts
 *
 * Verifies the closing arc of the approval cycle: when Stripe confirms
 * the refund via webhook (`charge.refunded`), the local payment row
 * flips from `writeback_pending` to `succeeded`, the Approvals UI badge
 * recomputes to "completed", and the audit trail captures the
 * reconciliation source (approval-writeback vs external).
 *
 * Scenarios covered (all against live Supabase):
 *
 *   1. PENDING → SUCCEEDED (approval writeback):
 *        Plant a payment with refund_status='writeback_pending' (mimics
 *        an approval that approved locally because Stripe wasn't reachable
 *        at decide-time). Send a synthetic `charge.refunded` body with
 *        the same external_payment_id. Assert:
 *          - payment.refund_status = 'succeeded'
 *          - payment.system_states.psp = 'refunded'
 *          - payment.refund_ids includes the Stripe refund id
 *          - reconciliation_details.writeback_executed_via = 'stripe'
 *          - reconciliation_details.writeback_error = null
 *          - reconciliation_details.writeback_source = 'approval-writeback'
 *          - audit row PAYMENT_REFUND_WRITEBACK_RECONCILED exists
 *
 *   2. EXTERNAL refund (no prior approval):
 *        Plant a captured payment with no prior writeback state. Receive a
 *        Stripe webhook initiated from the dashboard. Assert:
 *          - payment.refund_status = 'succeeded'
 *          - reconciliation_details.writeback_source = 'external'
 *          - audit row PAYMENT_REFUND_EXTERNAL_RECONCILED exists
 *
 *   3. Approval list endpoint reflects the change:
 *        Plant a decided approval pointing at the writeback_pending payment
 *        from scenario 1. After reconciliation, GET /api/approvals returns
 *        writeback.status='completed' for that approval (the badge flips).
 *
 *   4. No-match payment (UNKNOWN external_id):
 *        Webhook arrives with a charge id we don't have. The reconciler
 *        returns matched:false without throwing. No audit row written.
 *
 *   5. Idempotency:
 *        Send the SAME webhook body twice. The refund_ids array still has
 *        only one Stripe refund id (no duplicates).
 *
 * Run:
 *   node --env-file=.env.local node_modules/tsx/dist/cli.mjs \
 *        tests/integration/refund-reconciliation-e2e.test.ts
 */

import express from 'express';
import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../../server/db/supabase.js';
import approvalsRouter from '../../server/routes/approvals.js';
import { reconcileStripeChargeRefunded } from '../../server/services/refundReconciliation.js';

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
  const customerId = `cust_recon_${RUN}`;
  const caseId = randomUUID();
  cleanup.customerIds.push(customerId);
  cleanup.caseIds.push(caseId);
  const ins = async (t: string, r: any) => { const { error } = await supabase.from(t).insert(r); if (error) throw new Error(`${t}: ${error.message}`); };
  await ins('customers', { id: customerId, tenant_id: TENANT, workspace_id: WS, canonical_name: `Recon ${RUN}`, canonical_email: `recon+${RUN}@test.com` });
  await ins('cases', {
    id: caseId, case_number: `RECON-${RUN}`, tenant_id: TENANT, workspace_id: WS, customer_id: customerId,
    type: 'refund_request', status: 'open', priority: 'medium', source_system: 'manual', source_channel: 'test',
  });
  return { customerId, caseId };
}

async function plantPaymentInWritebackPending(customerId: string, externalChargeId: string, amount = 100) {
  const id = randomUUID();
  cleanup.paymentIds.push(id);
  await supabase.from('payments').insert({
    id, tenant_id: TENANT, workspace_id: WS, customer_id: customerId,
    external_payment_id: externalChargeId, psp: 'stripe',
    status: 'refunded',  // approval flipped it
    refund_status: 'writeback_pending',
    refund_amount: amount, refund_type: 'full',
    refund_ids: [`rf_synthetic_${RUN}`],  // synthetic id from approval (will be merged with real Stripe id)
    amount, currency: 'EUR',
    system_states: { canonical: 'refunded', crm_ai: 'refunded', psp: 'pending_writeback' },
    reconciliation_details: { writeback_executed_via: 'db-only', writeback_at: new Date().toISOString(), approval_request_id: 'placeholder' },
  });
  return id;
}

async function plantPaymentCaptured(customerId: string, externalChargeId: string, amount = 50) {
  const id = randomUUID();
  cleanup.paymentIds.push(id);
  await supabase.from('payments').insert({
    id, tenant_id: TENANT, workspace_id: WS, customer_id: customerId,
    external_payment_id: externalChargeId, psp: 'stripe',
    status: 'captured', amount, currency: 'EUR',
  });
  return id;
}

function buildStripeRefundedBody(chargeId: string, refundAmountCents: number, refundId: string) {
  return {
    type: 'charge.refunded',
    data: {
      object: {
        id: chargeId,
        object: 'charge',
        amount: refundAmountCents,
        amount_refunded: refundAmountCents,
        currency: 'eur',
        refunds: {
          object: 'list',
          data: [
            { id: refundId, object: 'refund', amount: refundAmountCents, status: 'succeeded', charge: chargeId },
          ],
        },
      },
    },
  };
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
  console.log(`\n▶ Refund reconciliation E2E (run ${RUN})\n`);
  try {
    const { customerId, caseId } = await plantBase();

    // ─────────────────────────────────────────────────────────────
    section('Scenario 1 — PENDING writeback → SUCCEEDED (approval flow)');
    const externalChargeId1 = `ch_recon_${RUN}_1`;
    const paymentId1 = await plantPaymentInWritebackPending(customerId, externalChargeId1, 100);
    const stripeRefundId1 = `re_recon_${RUN}_1`;

    // Plant a decided approval that points at this payment
    const approvalId = randomUUID();
    cleanup.approvalIds.push(approvalId);
    await supabase.from('approval_requests').insert({
      id: approvalId, tenant_id: TENANT, workspace_id: WS, case_id: caseId,
      action_type: 'refund', requested_by: 'system', requested_by_type: 'system',
      risk_level: 'medium', status: 'approved',
      action_payload: { payment_id: paymentId1, amount: 100 },
      evidence_package: {},
      decision_by: 'manager-recon', decision_at: new Date().toISOString(),
    });

    // BEFORE: list endpoint says writeback=pending
    const before = await get('/api/approvals?limit=200');
    const approvalBefore = (before.body?.items ?? []).find((a: any) => a.id === approvalId);
    record('Before: approval writeback = pending', approvalBefore?.writeback?.status === 'pending' ? 'pass' : 'fail', `got=${approvalBefore?.writeback?.status}`);

    // Reconcile
    const body1 = buildStripeRefundedBody(externalChargeId1, 10_000, stripeRefundId1);  // 10000 cents = €100
    const r1 = await reconcileStripeChargeRefunded({ tenantId: TENANT, workspaceId: WS }, body1);
    record('reconcileStripeChargeRefunded matched', r1.matched ? 'pass' : 'fail', `paymentId=${r1.paymentId?.slice(0,8)}`);
    record('Source classified as approval-writeback', r1.source === 'approval-writeback' ? 'pass' : 'fail', r1.source);
    record('Returned refundId equals Stripe id', r1.refundId === stripeRefundId1 ? 'pass' : 'fail');

    // AFTER DB state
    const { data: paymentAfter } = await supabase.from('payments').select('*').eq('id', paymentId1).maybeSingle();
    record('Payment.refund_status = succeeded', paymentAfter?.refund_status === 'succeeded' ? 'pass' : 'fail', paymentAfter?.refund_status);
    record('Payment.status = refunded', paymentAfter?.status === 'refunded' ? 'pass' : 'fail');
    const ssa: any = paymentAfter?.system_states ?? {};
    record('system_states.psp = refunded', ssa.psp === 'refunded' ? 'pass' : 'fail', ssa.psp);
    record('refund_ids includes Stripe refund id', Array.isArray(paymentAfter?.refund_ids) && paymentAfter.refund_ids.includes(stripeRefundId1) ? 'pass' : 'fail');
    const recon: any = paymentAfter?.reconciliation_details ?? {};
    record('reconciliation_details.writeback_executed_via = stripe', recon.writeback_executed_via === 'stripe' ? 'pass' : 'fail');
    record('reconciliation_details.writeback_error cleared', recon.writeback_error === null ? 'pass' : 'fail');
    record('reconciliation_details.writeback_source = approval-writeback', recon.writeback_source === 'approval-writeback' ? 'pass' : 'fail');
    record('reconciliation_details.writeback_reconciled_at populated', !!recon.writeback_reconciled_at ? 'pass' : 'fail');

    // Audit log captures RECONCILED action
    const { data: auditRows } = await supabase.from('audit_events')
      .select('action, metadata')
      .eq('entity_id', paymentId1)
      .eq('action', 'PAYMENT_REFUND_WRITEBACK_RECONCILED')
      .limit(1);
    const auditRow: any = auditRows?.[0];
    record('Audit PAYMENT_REFUND_WRITEBACK_RECONCILED exists', !!auditRow ? 'pass' : 'fail');
    record('Audit metadata.stripe_charge_id = our charge', auditRow?.metadata?.stripe_charge_id === externalChargeId1 ? 'pass' : 'fail');
    record('Audit metadata.source = approval-writeback', auditRow?.metadata?.source === 'approval-writeback' ? 'pass' : 'fail');

    // AFTER: approval list says completed
    const after = await get('/api/approvals?limit=200');
    const approvalAfter = (after.body?.items ?? []).find((a: any) => a.id === approvalId);
    record('After: approval writeback = completed', approvalAfter?.writeback?.status === 'completed' ? 'pass' : 'fail', `got=${approvalAfter?.writeback?.status}`);
    record('After: writeback.executedVia = stripe', approvalAfter?.writeback?.executedVia === 'stripe' ? 'pass' : 'fail');

    // ─────────────────────────────────────────────────────────────
    section('Scenario 2 — EXTERNAL refund (no approval, dashboard-initiated)');
    const externalChargeId2 = `ch_recon_${RUN}_2`;
    const paymentId2 = await plantPaymentCaptured(customerId, externalChargeId2, 50);
    const stripeRefundId2 = `re_recon_${RUN}_2`;

    const r2 = await reconcileStripeChargeRefunded({ tenantId: TENANT, workspaceId: WS }, buildStripeRefundedBody(externalChargeId2, 5_000, stripeRefundId2));
    record('reconcileStripeChargeRefunded matched', r2.matched ? 'pass' : 'fail');
    record('Source classified as external', r2.source === 'external' ? 'pass' : 'fail', r2.source);

    const { data: payment2After } = await supabase.from('payments').select('refund_status, status, refund_amount, reconciliation_details').eq('id', paymentId2).maybeSingle();
    record('External: refund_status = succeeded', payment2After?.refund_status === 'succeeded' ? 'pass' : 'fail');
    record('External: status = refunded', payment2After?.status === 'refunded' ? 'pass' : 'fail');
    record('External: refund_amount populated from webhook (50)', Number(payment2After?.refund_amount) === 50 ? 'pass' : 'fail', `${payment2After?.refund_amount}`);
    const recon2: any = payment2After?.reconciliation_details ?? {};
    record('External: writeback_source = external', recon2.writeback_source === 'external' ? 'pass' : 'fail');

    const { data: audit2 } = await supabase.from('audit_events')
      .select('action').eq('entity_id', paymentId2).eq('action', 'PAYMENT_REFUND_EXTERNAL_RECONCILED').limit(1);
    record('External: audit PAYMENT_REFUND_EXTERNAL_RECONCILED exists', (audit2?.length ?? 0) > 0 ? 'pass' : 'fail');

    // ─────────────────────────────────────────────────────────────
    section('Scenario 3 — UNKNOWN charge id (no local payment)');
    const r3 = await reconcileStripeChargeRefunded({ tenantId: TENANT, workspaceId: WS }, buildStripeRefundedBody(`ch_unknown_${RUN}`, 1_000, `re_x_${RUN}`));
    record('Unknown charge: matched = false (no throw)', r3.matched === false ? 'pass' : 'fail');
    record('Unknown charge: paymentId = null', r3.paymentId === null ? 'pass' : 'fail');

    // ─────────────────────────────────────────────────────────────
    section('Scenario 4 — Idempotency (same webhook twice)');
    // Re-fire the webhook for paymentId1 with the same body — refund_ids must
    // not get duplicate entries.
    const r4 = await reconcileStripeChargeRefunded({ tenantId: TENANT, workspaceId: WS }, body1);
    record('Idempotent re-run: matched still true', r4.matched ? 'pass' : 'fail');

    const { data: payment1Final } = await supabase.from('payments').select('refund_ids').eq('id', paymentId1).maybeSingle();
    const refundIds = Array.isArray(payment1Final?.refund_ids) ? payment1Final.refund_ids : [];
    const stripeIdCount = refundIds.filter((x: string) => x === stripeRefundId1).length;
    record('Idempotent: Stripe refund id appears exactly once', stripeIdCount === 1 ? 'pass' : 'fail', `count=${stripeIdCount} (full=${JSON.stringify(refundIds)})`);

    // ─────────────────────────────────────────────────────────────
    section('Scenario 5 — Empty/malformed webhook body');
    const r5a = await reconcileStripeChargeRefunded({ tenantId: TENANT, workspaceId: WS }, {} as any);
    record('Empty body: matched = false (no throw)', r5a.matched === false ? 'pass' : 'fail');
    const r5b = await reconcileStripeChargeRefunded({ tenantId: TENANT, workspaceId: WS }, { data: {} } as any);
    record('Body without object: matched = false', r5b.matched === false ? 'pass' : 'fail');

  } catch (err: any) {
    console.error(`\n  ✗✗ suite threw: ${err?.message ?? String(err)}\n`);
    record('audit-suite', 'fail', err?.message ?? String(err));
  } finally {
    await doCleanup().catch((e) => console.warn('cleanup warn:', e?.message));
    server.close();
  }

  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  console.log(`\n${'─'.repeat(74)}`);
  console.log(`Refund reconciliation E2E: ${pass} pass · ${fail} fail / ${results.length} checks`);
  console.log(`${'─'.repeat(74)}\n`);
  if (fail > 0) {
    console.log('Failures:');
    for (const r of results.filter((x) => x.status === 'fail')) console.log(`  ✗ ${r.feature.padEnd(64)} ${r.detail}`);
  }
  process.exit(fail > 0 ? 1 : 0);
})().catch((err) => { console.error('Suite crashed:', err); server.close(); process.exit(2); });
