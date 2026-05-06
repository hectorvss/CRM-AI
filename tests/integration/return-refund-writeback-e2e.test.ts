/**
 * tests/integration/return-refund-writeback-e2e.test.ts
 *
 * Closes the connector loop on return refunds:
 *
 *   PATCH /api/returns/:id/status with status='refunded' (or
 *   refund_status='refunded') → looks up the linked payment via
 *   return.order_id → calls Stripe createRefund (idempotency
 *   key=`return-{id}-refund`) → mutates BOTH the return row AND the
 *   linked payment row with reconciliation_details.
 *
 * Plus: when Stripe later sends `charge.refunded` for that same payment,
 * the refund-reconciliation sweep also flips the linked return's
 * refund_status to 'refunded' so the UI shows the closed loop.
 *
 * Scenarios (all against live Supabase):
 *   1. Direct refund flow (no approval gate)
 *      - PATCH return.status='refunded' → Stripe writeback attempted
 *      - Return + payment rows updated coherently
 *      - Audit RETURN_REFUNDED_VIA_STATUS_UPDATE captured
 *   2. Idempotency
 *      - Re-PATCHing the already-refunded return doesn't double-refund
 *   3. Webhook reconciliation of returns
 *      - Plant payment in writeback_pending with reconciliation_details
 *        pointing at a return → fire charge.refunded → return flips to
 *        refunded
 *   4. No linked payment fallback
 *      - Return without an order_id → writeback returns db-only with
 *        explicit error, return still updates to refunded locally
 *
 * Run:
 *   node --env-file=.env.local node_modules/tsx/dist/cli.mjs \
 *        tests/integration/return-refund-writeback-e2e.test.ts
 */

import express from 'express';
import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../../server/db/supabase.js';
import { returnsRouter } from '../../server/routes/payments.js';
import { reconcileStripeChargeRefunded } from '../../server/services/refundReconciliation.js';

const TENANT = 'org_default';
const WS = 'ws_default';
const RUN = randomUUID().slice(0, 6);
const supabase = getSupabaseAdmin();

const cleanup = {
  customerIds: [] as string[], orderIds: [] as string[],
  paymentIds: [] as string[], returnIds: [] as string[],
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
  const customerId = `cust_rrwb_${RUN}`;
  cleanup.customerIds.push(customerId);
  const { error } = await supabase.from('customers').insert({
    id: customerId, tenant_id: TENANT, workspace_id: WS,
    canonical_name: `RR ${RUN}`, canonical_email: `rr+${RUN}@test.com`,
  });
  if (error) throw new Error(`customer: ${error.message}`);
  return { customerId };
}

async function plantOrderPaymentReturn(customerId: string, opts: { paymentAmount?: number; returnValue?: number; returnStatus?: string; refundStatus?: string | null } = {}) {
  const orderId = randomUUID();
  const paymentId = randomUUID();
  const returnId = randomUUID();
  cleanup.orderIds.push(orderId);
  cleanup.paymentIds.push(paymentId);
  cleanup.returnIds.push(returnId);
  const ins = async (t: string, r: any) => { const { error } = await supabase.from(t).insert(r); if (error) throw new Error(`${t}: ${error.message}`); };

  await ins('orders', {
    id: orderId, tenant_id: TENANT, workspace_id: WS, customer_id: customerId,
    external_order_id: `SHOP-RR-${RUN}-${orderId.slice(0,4)}`,
    status: 'fulfilled', fulfillment_status: 'delivered',
    total_amount: opts.paymentAmount ?? 80, currency: 'EUR',
  });
  await ins('payments', {
    id: paymentId, tenant_id: TENANT, workspace_id: WS, customer_id: customerId, order_id: orderId,
    external_payment_id: `pi_rr_${RUN}_${paymentId.slice(0,4)}`, psp: 'stripe',
    status: 'captured', amount: opts.paymentAmount ?? 80, currency: 'EUR', risk_level: 'low',
  });
  await ins('returns', {
    id: returnId, tenant_id: TENANT, workspace_id: WS, customer_id: customerId, order_id: orderId,
    external_return_id: `RMA-RR-${RUN}-${returnId.slice(0,4)}`,
    status: opts.returnStatus ?? 'inspected',
    refund_status: opts.refundStatus ?? null,
    return_value: opts.returnValue ?? 80, currency: 'EUR', return_reason: 'damaged',
  });

  return { orderId, paymentId, returnId };
}

async function doCleanup() {
  if (cleanup.returnIds.length) await supabase.from('returns').delete().in('id', cleanup.returnIds);
  if (cleanup.paymentIds.length) await supabase.from('payments').delete().in('id', cleanup.paymentIds);
  if (cleanup.orderIds.length) await supabase.from('orders').delete().in('id', cleanup.orderIds);
  if (cleanup.customerIds.length) await supabase.from('customers').delete().in('id', cleanup.customerIds);
}

const app = express();
app.use(express.json());
app.use('/api/returns', returnsRouter);
const server = app.listen(0);
const port = (server.address() as any).port;
const base = `http://127.0.0.1:${port}`;
async function patch(p: string, payload: any) { const r = await fetch(`${base}${p}`, { method: 'PATCH', headers: { ...HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const t = await r.text(); let body: any; try { body = JSON.parse(t); } catch { body = { raw: t }; } return { status: r.status, body }; }

(async () => {
  console.log(`\n▶ Return refund writeback E2E (run ${RUN})\n`);
  try {
    const { customerId } = await plantBase();

    // ─────────────────────────────────────────────────────────────
    section('Scenario 1 — Direct PATCH status=refunded triggers writeback');
    {
      const { paymentId, returnId } = await plantOrderPaymentReturn(customerId);
      const r = await patch(`/api/returns/${returnId}/status`, { status: 'refunded', refund_status: 'refunded', amount: 80, reason: 'audit refund' });
      record('PATCH /returns/:id/status refunded (200)', r.status === 200 ? 'pass' : 'fail', `status=${r.status}`);
      record('Response includes writeback object', !!r.body?.writeback ? 'pass' : 'fail');
      record('writeback.executedVia is stripe|db-only', ['stripe', 'db-only'].includes(r.body?.writeback?.executedVia) ? 'pass' : 'fail', r.body?.writeback?.executedVia);
      record('writeback.paymentId resolved correctly', r.body?.writeback?.paymentId === paymentId ? 'pass' : 'fail');

      // Return row state
      const { data: returnRow } = await supabase.from('returns').select('*').eq('id', returnId).maybeSingle();
      record('Return.status = refunded', returnRow?.status === 'refunded' ? 'pass' : 'fail', returnRow?.status);
      record('Return.refund_status = refunded', returnRow?.refund_status === 'refunded' ? 'pass' : 'fail');
      const ssr: any = returnRow?.system_states ?? {};
      record('Return.system_states.canonical = refunded', ssr.canonical === 'refunded' ? 'pass' : 'fail');

      // Linked payment state
      const { data: paymentRow } = await supabase.from('payments').select('*').eq('id', paymentId).maybeSingle();
      record('Linked Payment.status = refunded', paymentRow?.status === 'refunded' ? 'pass' : 'fail');
      record('Linked Payment.refund_amount = 80', Number(paymentRow?.refund_amount) === 80 ? 'pass' : 'fail');
      record('Linked Payment.refund_type = full', paymentRow?.refund_type === 'full' ? 'pass' : 'fail');
      const recon: any = paymentRow?.reconciliation_details ?? {};
      record('Payment.reconciliation_details.return_id wired', recon.return_id === returnId ? 'pass' : 'fail');
      record('Payment.reconciliation_details.writeback_source = return-refund', recon.writeback_source === 'return-refund' ? 'pass' : 'fail');
      record('Payment.refund_status reflects connector outcome', ['succeeded', 'writeback_pending'].includes(paymentRow?.refund_status) ? 'pass' : 'fail', paymentRow?.refund_status);

      // Audit
      const { data: audit } = await supabase.from('audit_events')
        .select('action, metadata').eq('entity_id', returnId)
        .in('action', ['RETURN_REFUNDED_VIA_STATUS_UPDATE', 'RETURN_REFUND_WRITEBACK_FAILED'])
        .order('occurred_at', { ascending: false }).limit(1);
      const auditRow: any = audit?.[0];
      record('Audit RETURN_REFUNDED_VIA_STATUS_UPDATE captured', !!auditRow ? 'pass' : 'fail', auditRow?.action);
      record('Audit metadata.executed_via populated', !!auditRow?.metadata?.executed_via ? 'pass' : 'fail');
      record('Audit metadata.idempotency_key = return-{id}-refund', auditRow?.metadata?.idempotency_key === `return-${returnId}-refund` ? 'pass' : 'fail');
    }

    // ─────────────────────────────────────────────────────────────
    section('Scenario 2 — Idempotency: re-PATCH same status is safe');
    {
      const { paymentId, returnId } = await plantOrderPaymentReturn(customerId, { paymentAmount: 50, returnValue: 50 });
      // First PATCH
      const r1 = await patch(`/api/returns/${returnId}/status`, { status: 'refunded', refund_status: 'refunded', amount: 50 });
      record('First PATCH refunded (200)', r1.status === 200 ? 'pass' : 'fail');
      const { data: payment1 } = await supabase.from('payments').select('refund_ids, refund_amount').eq('id', paymentId).maybeSingle();
      const firstCount = (payment1?.refund_ids ?? []).length;

      // Second PATCH — return already refunded, writeback should NOT fire again
      const r2 = await patch(`/api/returns/${returnId}/status`, { status: 'refunded', refund_status: 'refunded' });
      record('Second PATCH refunded (200)', r2.status === 200 ? 'pass' : 'fail');
      record('Second PATCH did NOT trigger writeback', !r2.body?.writeback ? 'pass' : 'fail', `writeback=${JSON.stringify(r2.body?.writeback)}`);

      const { data: payment2 } = await supabase.from('payments').select('refund_ids, refund_amount').eq('id', paymentId).maybeSingle();
      const secondCount = (payment2?.refund_ids ?? []).length;
      record('refund_ids did NOT grow on re-PATCH', firstCount === secondCount ? 'pass' : 'fail', `before=${firstCount} after=${secondCount}`);
      record('refund_amount stable at 50', Number(payment2?.refund_amount) === 50 ? 'pass' : 'fail');
    }

    // ─────────────────────────────────────────────────────────────
    section('Scenario 3 — Stripe webhook reconciles linked return');
    {
      const { paymentId, returnId } = await plantOrderPaymentReturn(customerId, { paymentAmount: 100, returnValue: 100 });
      // Plant payment in writeback_pending state with return_id link
      await supabase.from('payments').update({
        status: 'refunded',
        refund_status: 'writeback_pending',
        refund_amount: 100,
        refund_type: 'full',
        refund_ids: [`rf_synth_${RUN}`],
        system_states: { canonical: 'refunded', psp: 'pending_writeback' },
        reconciliation_details: {
          return_id: returnId,
          writeback_executed_via: 'db-only',
          writeback_at: new Date().toISOString(),
          writeback_source: 'return-refund',
        },
      }).eq('id', paymentId);
      await supabase.from('returns').update({ refund_status: 'pending', status: 'inspected' }).eq('id', returnId);

      // Look up payment to get external_payment_id
      const { data: payment } = await supabase.from('payments').select('external_payment_id').eq('id', paymentId).maybeSingle();
      const stripeRefundId = `re_recon_${RUN}_3`;
      const body = {
        type: 'charge.refunded',
        data: {
          object: {
            id: payment?.external_payment_id,
            object: 'charge',
            amount_refunded: 10_000,  // 100 EUR in cents
            currency: 'eur',
            refunds: { object: 'list', data: [{ id: stripeRefundId, status: 'succeeded' }] },
          },
        },
      };
      const result = await reconcileStripeChargeRefunded({ tenantId: TENANT, workspaceId: WS }, body);
      record('Reconciler matched payment', result.matched ? 'pass' : 'fail');

      // Return row should have flipped to refunded
      const { data: returnAfter } = await supabase.from('returns').select('*').eq('id', returnId).maybeSingle();
      record('Linked return.refund_status = refunded after reconcile', returnAfter?.refund_status === 'refunded' ? 'pass' : 'fail', returnAfter?.refund_status);
      record('Linked return.status = refunded', returnAfter?.status === 'refunded' ? 'pass' : 'fail', returnAfter?.status);
      record('Linked return.linked_refund_id = stripe id', returnAfter?.linked_refund_id === stripeRefundId ? 'pass' : 'fail', returnAfter?.linked_refund_id);
    }

    // ─────────────────────────────────────────────────────────────
    section('Scenario 4 — Order-level reconciliation of pending returns');
    {
      // Plant 2 returns on the same order. Mark one as writeback_pending,
      // the other as already refunded. The reconciler should flip the
      // pending one without touching the already-refunded one.
      const { orderId, paymentId } = await plantOrderPaymentReturn(customerId, { paymentAmount: 200, returnValue: 50 });
      const pendingReturn = randomUUID();
      const refundedReturn = randomUUID();
      cleanup.returnIds.push(pendingReturn, refundedReturn);
      await supabase.from('returns').insert([
        { id: pendingReturn, tenant_id: TENANT, workspace_id: WS, order_id: orderId, customer_id: customerId, external_return_id: `RMA-P-${RUN}`, status: 'inspected', refund_status: 'writeback_pending', return_value: 50, currency: 'EUR' },
        { id: refundedReturn, tenant_id: TENANT, workspace_id: WS, order_id: orderId, customer_id: customerId, external_return_id: `RMA-R-${RUN}`, status: 'refunded', refund_status: 'refunded', return_value: 100, currency: 'EUR' },
      ]);

      const { data: payment } = await supabase.from('payments').select('external_payment_id').eq('id', paymentId).maybeSingle();
      // Set payment writeback_pending for the order-link path
      await supabase.from('payments').update({ status: 'refunded', refund_status: 'writeback_pending' }).eq('id', paymentId);

      const stripeRefundId = `re_order_${RUN}`;
      await reconcileStripeChargeRefunded({ tenantId: TENANT, workspaceId: WS }, {
        type: 'charge.refunded',
        data: { object: { id: payment?.external_payment_id, amount_refunded: 5_000, currency: 'eur', refunds: { data: [{ id: stripeRefundId }] } } },
      });

      const { data: pendingAfter } = await supabase.from('returns').select('refund_status').eq('id', pendingReturn).maybeSingle();
      record('Pending return → refunded via order-link path', pendingAfter?.refund_status === 'refunded' ? 'pass' : 'fail', pendingAfter?.refund_status);

      const { data: refundedAfter } = await supabase.from('returns').select('refund_status').eq('id', refundedReturn).maybeSingle();
      record('Already-refunded return untouched', refundedAfter?.refund_status === 'refunded' ? 'pass' : 'fail');
    }

    // ─────────────────────────────────────────────────────────────
    section('Scenario 5 — Return without order_id (no payment to refund)');
    {
      const orphanReturn = randomUUID();
      cleanup.returnIds.push(orphanReturn);
      await supabase.from('returns').insert({
        id: orphanReturn, tenant_id: TENANT, workspace_id: WS, customer_id: customerId,
        external_return_id: `RMA-ORPHAN-${RUN}`, status: 'inspected', return_value: 30, currency: 'EUR',
      });
      const r = await patch(`/api/returns/${orphanReturn}/status`, { status: 'refunded', refund_status: 'refunded', amount: 30 });
      record('PATCH on orphan return still 200', r.status === 200 ? 'pass' : 'fail');
      record('writeback.executedVia = db-only', r.body?.writeback?.executedVia === 'db-only' ? 'pass' : 'fail');
      record('writeback.paymentId = null (no link)', r.body?.writeback?.paymentId === null ? 'pass' : 'fail');
      record('writeback.error explains no order_id', String(r.body?.writeback?.error || '').includes('order_id') ? 'pass' : 'fail', r.body?.writeback?.error);

      const { data: returnAfter } = await supabase.from('returns').select('status, refund_status').eq('id', orphanReturn).maybeSingle();
      record('Orphan return still flipped to refunded locally', returnAfter?.status === 'refunded' ? 'pass' : 'fail');
    }

  } catch (err: any) {
    console.error(`\n  ✗✗ suite threw: ${err?.message ?? String(err)}\n`);
    record('audit-suite', 'fail', err?.message ?? String(err));
  } finally {
    await doCleanup().catch((e) => console.warn('cleanup warn:', e?.message));
    server.close();
  }

  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  console.log(`\n${'─'.repeat(76)}`);
  console.log(`Return refund writeback E2E: ${pass} pass · ${fail} fail / ${results.length} checks`);
  console.log(`${'─'.repeat(76)}\n`);
  if (fail > 0) {
    console.log('Failures:');
    for (const r of results.filter((x) => x.status === 'fail')) console.log(`  ✗ ${r.feature.padEnd(64)} ${r.detail}`);
  }
  process.exit(fail > 0 ? 1 : 0);
})().catch((err) => { console.error('Suite crashed:', err); server.close(); process.exit(2); });
