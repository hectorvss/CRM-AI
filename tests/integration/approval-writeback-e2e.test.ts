/**
 * tests/integration/approval-writeback-e2e.test.ts
 *
 * Proves the approval cycle closes the connector loop end-to-end:
 *
 *   POST /api/payments/:id/refund (sensitive amount)
 *     → creates approval_request status=pending
 *     → payment.approval_status=approval_needed (no DB refund yet)
 *
 *   POST /api/approvals/:id/decide approved
 *     → applyPostApprovalDecision runs
 *     → attempts Stripe writeback FIRST (idempotency: approval-{id}-refund)
 *     → updates payment.status=refunded with real refund_id when Stripe ok
 *     → audit_events row PAYMENT_REFUNDED_VIA_APPROVAL with executed_via
 *     → reconciliation_details captures writeback metadata for sweeper
 *
 * Same pattern for order_cancel:
 *   approval pending → decide approved → Shopify cancelOrder (or Woo
 *   updateOrder status=cancelled) → DB synced → audit ORDER_CANCELLED_VIA_APPROVAL
 *
 * Both paths degrade gracefully when no connector is configured:
 *   writeback.executedVia = 'db-only', refund_status = 'writeback_pending',
 *   audit metadata flags connector_writeback = 'pending'
 *
 * Run:
 *   node --env-file=.env.local node_modules/tsx/dist/cli.mjs \
 *        tests/integration/approval-writeback-e2e.test.ts
 */

import express from 'express';
import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../../server/db/supabase.js';
import paymentsRouter from '../../server/routes/payments.js';
import approvalsRouter from '../../server/routes/approvals.js';
import ordersRouter from '../../server/routes/orders.js';
import { applyPostApprovalDecision } from '../../server/services/postApproval.js';

const TENANT = 'org_default';
const WS = 'ws_default';
const RUN = randomUUID().slice(0, 6);
const supabase = getSupabaseAdmin();

const cleanup = {
  customerIds: [] as string[], orderIds: [] as string[],
  paymentIds:  [] as string[], caseIds:  [] as string[],
  approvalIds: [] as string[], refundIds: [] as string[],
  auditEventIds: [] as string[],
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

async function plant() {
  const customerId = `cust_aw_${RUN}`;
  const orderId = randomUUID();
  const paymentId = randomUUID();
  const caseId = randomUUID();
  cleanup.customerIds.push(customerId);
  cleanup.orderIds.push(orderId);
  cleanup.paymentIds.push(paymentId);
  cleanup.caseIds.push(caseId);

  const ins = async (t: string, r: any) => { const { error } = await supabase.from(t).insert(r); if (error) throw new Error(`${t}: ${error.message}`); };

  await ins('customers', {
    id: customerId, tenant_id: TENANT, workspace_id: WS,
    canonical_name: `Approval WB ${RUN}`, canonical_email: `aw+${RUN}@test.com`,
    segment: 'vip',
  });
  await ins('orders', {
    id: orderId, tenant_id: TENANT, workspace_id: WS, customer_id: customerId,
    external_order_id: `SHOP-AW-${RUN}`,  // numeric-ish but Shopify will reject without real shop
    status: 'pending', fulfillment_status: 'awaiting_payment',
    total_amount: 500, currency: 'EUR',
  });
  await ins('payments', {
    id: paymentId, tenant_id: TENANT, workspace_id: WS, customer_id: customerId, order_id: orderId,
    external_payment_id: `pi_aw_${RUN}`, psp: 'stripe',
    // Non-sensitive base; we'll trigger sensitive flow by choosing a high refund amount.
    status: 'captured', amount: 500, currency: 'EUR', risk_level: 'high',  // high risk → forces approval gate
  });
  await ins('cases', {
    id: caseId, case_number: `AW-${RUN}`,
    tenant_id: TENANT, workspace_id: WS, customer_id: customerId,
    type: 'refund_request', status: 'open', priority: 'high',
    source_system: 'manual', source_channel: 'test',
    order_ids: [orderId], payment_ids: [paymentId],
  });

  return { customerId, orderId, paymentId, caseId };
}

async function doCleanup() {
  if (cleanup.refundIds.length) await supabase.from('refunds').delete().in('id', cleanup.refundIds);
  if (cleanup.approvalIds.length) await supabase.from('approval_requests').delete().in('id', cleanup.approvalIds);
  if (cleanup.caseIds.length) {
    await supabase.from('case_status_history').delete().in('case_id', cleanup.caseIds);
    await supabase.from('cases').delete().in('id', cleanup.caseIds);
  }
  if (cleanup.paymentIds.length) {
    await supabase.from('payment_events').delete().in('payment_id', cleanup.paymentIds);
    await supabase.from('payments').delete().in('id', cleanup.paymentIds);
  }
  if (cleanup.orderIds.length) {
    await supabase.from('order_events').delete().in('order_id', cleanup.orderIds);
    await supabase.from('orders').delete().in('id', cleanup.orderIds);
  }
  if (cleanup.customerIds.length) await supabase.from('customers').delete().in('id', cleanup.customerIds);
}

const app = express();
app.use(express.json());
app.use('/api/payments', paymentsRouter);
app.use('/api/approvals', approvalsRouter);
app.use('/api/orders', ordersRouter);
const server = app.listen(0);
const port = (server.address() as any).port;
const base = `http://127.0.0.1:${port}`;
async function get(p: string) { const r = await fetch(`${base}${p}`, { headers: HEADERS }); const t = await r.text(); let body: any; try { body = JSON.parse(t); } catch { body = { raw: t }; } return { status: r.status, body }; }
async function post(p: string, payload: any) { const r = await fetch(`${base}${p}`, { method: 'POST', headers: { ...HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const t = await r.text(); let body: any; try { body = JSON.parse(t); } catch { body = { raw: t }; } return { status: r.status, body }; }

(async () => {
  console.log(`\n▶ Approval writeback E2E (run ${RUN})\n`);
  let paymentId = '', orderId = '', caseId = '', approvalId = '';
  try {
    ({ paymentId, orderId, caseId } = await plant());
    console.log(`  · planted payment=${paymentId.slice(0, 8)} order=${orderId.slice(0, 8)} case=${caseId.slice(0, 8)}\n`);

    // ─────────────────────────────────────────────────────────────
    section('Phase A — Sensitive refund creates pending approval');
    {
      // amount=500 + risk_level=high → backend should route through approval queue
      const r = await post(`/api/payments/${paymentId}/refund`, { amount: 500, reason: `audit ${RUN}` });
      const ok = r.status === 202 && r.body?.requiresApproval === true;
      record('POST /payments/:id/refund returns 202 requiresApproval', ok ? 'pass' : 'fail', `status=${r.status} requiresApproval=${r.body?.requiresApproval}`);
      approvalId = r.body?.approvalRequestId || '';
      cleanup.approvalIds.push(approvalId);
      record('Approval request created with id', !!approvalId ? 'pass' : 'fail', `id=${approvalId.slice(0, 8)}`);
    }
    {
      const { data: approvalRow } = await supabase.from('approval_requests').select('*').eq('id', approvalId).maybeSingle();
      record('approval_requests.status = pending', approvalRow?.status === 'pending' ? 'pass' : 'fail', approvalRow?.status);
      record('action_type = refund', approvalRow?.action_type === 'refund' ? 'pass' : 'fail');
      const ap: any = approvalRow?.action_payload ?? {};
      record('action_payload.payment_id wired', ap.payment_id === paymentId ? 'pass' : 'fail', ap.payment_id?.slice(0, 8));
      record('action_payload.amount = 500', Number(ap.amount) === 500 ? 'pass' : 'fail');
    }
    {
      const { data: paymentRow } = await supabase.from('payments').select('status, approval_status, refund_amount').eq('id', paymentId).maybeSingle();
      record('Payment NOT refunded yet (status=captured)', paymentRow?.status === 'captured' ? 'pass' : 'fail', paymentRow?.status);
      record('Payment marked approval_needed', paymentRow?.approval_status === 'approval_needed' ? 'pass' : 'fail', paymentRow?.approval_status);
    }

    // ─────────────────────────────────────────────────────────────
    section('Phase B — Manager approves → connector writeback attempted');
    let writebackExecutedVia: string | null = null;
    {
      const r = await post(`/api/approvals/${approvalId}/decide`, { decision: 'approved', note: 'audit approve', decided_by: 'manager-audit' });
      record('POST /approvals/:id/decide approved', r.status === 200 ? 'pass' : 'fail', `status=${r.status}`);
    }
    {
      // Verify approval row updated
      const { data: approvalRow } = await supabase.from('approval_requests').select('status, decision_by, decision_at').eq('id', approvalId).maybeSingle();
      record('approval_requests.status = approved', approvalRow?.status === 'approved' ? 'pass' : 'fail', approvalRow?.status);
      record('decision_by populated', !!approvalRow?.decision_by ? 'pass' : 'fail', approvalRow?.decision_by);
      record('decision_at populated', !!approvalRow?.decision_at ? 'pass' : 'fail');
    }
    {
      // Verify payment was actually refunded in DB
      const { data: paymentRow } = await supabase.from('payments').select('status, refund_status, refund_amount, refund_type, refund_ids, reconciliation_details').eq('id', paymentId).maybeSingle();
      record('Payment status = refunded after approval', paymentRow?.status === 'refunded' ? 'pass' : 'fail', paymentRow?.status);
      record('Payment refund_amount = 500', Number(paymentRow?.refund_amount) === 500 ? 'pass' : 'fail');
      record('Payment refund_type = full', paymentRow?.refund_type === 'full' ? 'pass' : 'fail');
      const refundIds = Array.isArray(paymentRow?.refund_ids) ? paymentRow.refund_ids : [];
      record('Payment.refund_ids has new refund id', refundIds.length > 0 ? 'pass' : 'fail', `count=${refundIds.length}`);

      const recon: any = paymentRow?.reconciliation_details ?? {};
      writebackExecutedVia = recon.writeback_executed_via;
      record('reconciliation_details.writeback_executed_via populated',
        ['stripe', 'db-only'].includes(writebackExecutedVia ?? '') ? 'pass' : 'fail',
        `via=${writebackExecutedVia}`);
      record('reconciliation_details.writeback_at timestamp', !!recon.writeback_at ? 'pass' : 'fail');
      record('reconciliation_details.approval_request_id wired', recon.approval_request_id === approvalId ? 'pass' : 'fail');

      // refund_status reflects connector outcome
      if (writebackExecutedVia === 'stripe') {
        record('refund_status = succeeded (Stripe live)', paymentRow?.refund_status === 'succeeded' ? 'pass' : 'fail');
      } else {
        record('refund_status = writeback_pending (no Stripe)', paymentRow?.refund_status === 'writeback_pending' ? 'pass' : 'fail');
      }
    }
    {
      // Audit log captured the action with executed_via metadata
      const { data: audit } = await supabase.from('audit_events')
        .select('id, action, metadata')
        .eq('entity_id', paymentId)
        .in('action', ['PAYMENT_REFUNDED_VIA_APPROVAL', 'PAYMENT_REFUND_APPROVAL_WRITEBACK_FAILED'])
        .order('occurred_at', { ascending: false })
        .limit(1);
      const row: any = audit?.[0];
      cleanup.auditEventIds.push(row?.id);
      record('Audit log captured approval refund action', !!row ? 'pass' : 'fail', row?.action);
      record('Audit metadata.executed_via populated', !!row?.metadata?.executed_via ? 'pass' : 'fail', row?.metadata?.executed_via);
      record('Audit metadata.idempotency_key populated', String(row?.metadata?.idempotency_key ?? '').includes(approvalId) ? 'pass' : 'fail');
      const expectedWriteback = writebackExecutedVia === 'stripe' ? 'completed' : 'pending';
      record(`Audit metadata.connector_writeback = ${expectedWriteback}`, row?.metadata?.connector_writeback === expectedWriteback ? 'pass' : 'fail');
    }
    {
      // Idempotency: re-deciding must fail (already decided)
      const r = await post(`/api/approvals/${approvalId}/decide`, { decision: 'rejected', decided_by: 'manager-audit' });
      record('Re-decide rejected (idempotency 409)', r.status === 409 ? 'pass' : 'fail', `status=${r.status}`);
    }

    // ─────────────────────────────────────────────────────────────
    section('Phase C — Order cancel approval writeback (separate approval)');
    let orderApprovalId = '';
    {
      // Plant a separate order_cancel approval directly
      orderApprovalId = randomUUID();
      cleanup.approvalIds.push(orderApprovalId);
      const { error } = await supabase.from('approval_requests').insert({
        id: orderApprovalId, tenant_id: TENANT, workspace_id: WS, case_id: caseId,
        action_type: 'order_cancel', requested_by: 'system', requested_by_type: 'system',
        risk_level: 'medium',
        action_payload: { order_id: orderId, reason: 'audit cancel writeback' },
        evidence_package: {},
        status: 'pending',
      });
      if (error) throw new Error(`order approval insert: ${error.message}`);
      record('Planted order_cancel approval (pending)', !error ? 'pass' : 'fail');
    }
    let cancelWritebackVia: string | null = null;
    {
      const r = await post(`/api/approvals/${orderApprovalId}/decide`, { decision: 'approved', note: 'cancel approve', decided_by: 'manager-audit' });
      record('Decide approved (order_cancel)', r.status === 200 ? 'pass' : 'fail', `status=${r.status}`);
    }
    {
      const { data: orderRow } = await supabase.from('orders').select('status, approval_status, system_states, last_update, recommended_action').eq('id', orderId).maybeSingle();
      record('Order status = cancelled', orderRow?.status === 'cancelled' ? 'pass' : 'fail', orderRow?.status);
      record('Order approval_status = approved', orderRow?.approval_status === 'approved' ? 'pass' : 'fail');
      const systemStates: any = orderRow?.system_states ?? {};
      record('system_states.canonical = cancelled', systemStates.canonical === 'cancelled' ? 'pass' : 'fail');
    }
    {
      const { data: audit } = await supabase.from('audit_events')
        .select('id, action, metadata')
        .eq('entity_id', orderId)
        .in('action', ['ORDER_CANCELLED_VIA_APPROVAL', 'ORDER_CANCEL_APPROVAL_WRITEBACK_FAILED'])
        .order('occurred_at', { ascending: false })
        .limit(1);
      const row: any = audit?.[0];
      cancelWritebackVia = row?.metadata?.executed_via;
      record('Audit captured order cancel via approval', !!row ? 'pass' : 'fail', row?.action);
      record('Audit metadata.executed_via populated',
        ['shopify', 'woocommerce', 'db-only'].includes(cancelWritebackVia ?? '') ? 'pass' : 'fail',
        `via=${cancelWritebackVia}`);
    }

    // ─────────────────────────────────────────────────────────────
    section('Phase D — Direct unit check of helpers (no real PSP needed)');
    {
      // Call applyPostApprovalDecision directly with a fresh approval where
      // the connector is guaranteed not configured → must return 'db-only'
      // gracefully and NOT throw.
      const directApprovalId = randomUUID();
      cleanup.approvalIds.push(directApprovalId);

      // Plant a fresh payment so the test is independent.
      const directPaymentId = randomUUID();
      cleanup.paymentIds.push(directPaymentId);
      await supabase.from('payments').insert({
        id: directPaymentId, tenant_id: TENANT, workspace_id: WS,
        customer_id: cleanup.customerIds[0], order_id: orderId,
        external_payment_id: null,  // ← no external_id forces 'no external_payment_id'
        psp: 'stripe', status: 'captured', amount: 100, currency: 'EUR', risk_level: 'low',
      });
      await supabase.from('approval_requests').insert({
        id: directApprovalId, tenant_id: TENANT, workspace_id: WS, case_id: caseId,
        action_type: 'refund', requested_by: 'system', requested_by_type: 'system',
        risk_level: 'low', status: 'pending',
        action_payload: { payment_id: directPaymentId, amount: 100, reason: 'direct unit' },
        evidence_package: {},
      });

      const { data: approvalRow } = await supabase.from('approval_requests').select('*').eq('id', directApprovalId).maybeSingle();
      const result = await applyPostApprovalDecision(
        { tenantId: TENANT, workspaceId: WS },
        approvalRow,
        'approved',
        'direct-unit',
      );
      record('applyPostApprovalDecision returns shape', result?.caseId === caseId ? 'pass' : 'fail');
      record('Result.shouldEnqueueExecution defined', typeof result?.shouldEnqueueExecution === 'boolean' ? 'pass' : 'fail');
      record('Result.affected.payments includes target', (result?.affected?.payments ?? []).includes(directPaymentId) ? 'pass' : 'fail');

      // Verify the no-external-id path produced a writeback_pending status
      const { data: directPayment } = await supabase.from('payments').select('refund_status, reconciliation_details').eq('id', directPaymentId).maybeSingle();
      const recon: any = directPayment?.reconciliation_details ?? {};
      record('No-external-id payment → writeback_pending', directPayment?.refund_status === 'writeback_pending' ? 'pass' : 'fail');
      record('No-external-id error captured', recon.writeback_error === 'no external_payment_id' ? 'pass' : 'fail', recon.writeback_error);
    }

  } catch (err: any) {
    console.error(`\n  ✗✗ suite threw: ${err?.message ?? String(err)}\n`);
    record('audit-suite', 'fail', err?.message ?? String(err));
  } finally {
    await doCleanup().catch((e) => console.warn('cleanup warn:', e?.message));
    server.close();
  }

  const pass = results.filter((r) => r.status === 'pass').length;
  const partial = results.filter((r) => r.status === 'partial').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  console.log(`\n${'─'.repeat(80)}`);
  console.log(`Approval writeback E2E: ${pass} pass · ${partial} partial · ${fail} fail / ${results.length} checks`);
  console.log(`${'─'.repeat(80)}\n`);
  if (fail > 0) {
    console.log('Failures:');
    for (const r of results.filter((x) => x.status === 'fail')) console.log(`  ✗ ${r.feature.padEnd(64)} ${r.detail}`);
  }
  process.exit(fail > 0 ? 1 : 0);
})().catch((err) => { console.error('Suite crashed:', err); server.close(); process.exit(2); });
