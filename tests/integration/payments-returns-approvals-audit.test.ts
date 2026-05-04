/**
 * tests/integration/payments-returns-approvals-audit.test.ts
 *
 * Wall-to-wall audit of the three pages that mirror the Orders structure:
 *   /payments  · /returns · /approvals
 *
 * Each page exposes the same UI shell (left list · centre workspace · right
 * copilot) but exercises a different domain. This test plants a synthetic
 * payment, return, approval and case, then drives every endpoint each page
 * calls to ensure:
 *   - the list endpoint works (no duplicates, planted row visible)
 *   - the detail endpoint returns real fields (no hardcoded shape)
 *   - the context endpoint either resolves or 404s gracefully (never 500)
 *   - every action button maps to a real backend mutation
 *
 * Run:
 *   node --env-file=.env.local node_modules/tsx/dist/cli.mjs \
 *        tests/integration/payments-returns-approvals-audit.test.ts
 */

import express from 'express';
import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../../server/db/supabase.js';

import paymentsRouter, { returnsRouter } from '../../server/routes/payments.js';
import approvalsRouter from '../../server/routes/approvals.js';
import casesRouter from '../../server/routes/cases.js';
import commerceRouter from '../../server/routes/commerce.js';

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
  console.log(`  ${tag} ${feature.padEnd(60)} ${detail}`);
};
const section = (t: string) => console.log(`\n  ── ${t} ${'─'.repeat(Math.max(0, 60 - t.length))}`);

const HEADERS = { 'x-tenant-id': TENANT, 'x-workspace-id': WS, 'x-user-id': 'system', 'x-permissions': '*' };

async function plant() {
  const customerId = `cust_pra_${RUN}`;
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
    canonical_name: `PRA Audit ${RUN}`, canonical_email: `pra+${RUN}@test.com`,
    segment: 'vip', risk_level: 'medium', lifetime_value: 1500,
  });
  await ins('orders', {
    id: orderId, tenant_id: TENANT, workspace_id: WS, customer_id: customerId,
    external_order_id: `SHOP-PRA-${RUN}`, status: 'fulfilled', fulfillment_status: 'delivered',
    total_amount: 200, currency: 'EUR',
  });
  await ins('payments', {
    id: paymentId, tenant_id: TENANT, workspace_id: WS, customer_id: customerId, order_id: orderId,
    external_payment_id: `pi_pra_${RUN}`, psp: 'stripe',
    status: 'captured', amount: 200, currency: 'EUR', risk_level: 'low',
  });
  await ins('returns', {
    id: returnId, tenant_id: TENANT, workspace_id: WS, customer_id: customerId, order_id: orderId,
    external_return_id: `RMA-PRA-${RUN}`, status: 'pending_review', return_reason: 'damaged',
    return_value: 200, currency: 'EUR',
  });
  await ins('cases', {
    id: caseId, case_number: `PRA-${RUN}`,
    tenant_id: TENANT, workspace_id: WS, customer_id: customerId,
    type: 'refund_request', status: 'open', priority: 'high',
    source_system: 'manual', source_channel: 'test',
    order_ids: [orderId], payment_ids: [paymentId], return_ids: [returnId],
  });
  await ins('approval_requests', {
    id: approvalId, tenant_id: TENANT, workspace_id: WS, case_id: caseId,
    action_type: 'refund', requested_by: 'system', requested_by_type: 'system',
    risk_level: 'medium',
    action_payload: { payment_id: paymentId, amount: 200, reason: 'audit' },
    evidence_package: {},
    status: 'pending',
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

const app = express();
app.use(express.json());
app.use('/api/payments', paymentsRouter);
app.use('/api/returns', returnsRouter);
app.use('/api/approvals', approvalsRouter);
app.use('/api/cases', casesRouter);
app.use('/api/commerce', commerceRouter);
const server = app.listen(0);
const port = (server.address() as any).port;
const base = `http://127.0.0.1:${port}`;
async function get(p: string) { const r = await fetch(`${base}${p}`, { headers: HEADERS }); const t = await r.text(); let body: any; try { body = JSON.parse(t); } catch { body = { raw: t }; } return { status: r.status, body }; }
async function post(p: string, payload: any) { const r = await fetch(`${base}${p}`, { method: 'POST', headers: { ...HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const t = await r.text(); let body: any; try { body = JSON.parse(t); } catch { body = { raw: t }; } return { status: r.status, body }; }
async function patch(p: string, payload: any) { const r = await fetch(`${base}${p}`, { method: 'PATCH', headers: { ...HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const t = await r.text(); let body: any; try { body = JSON.parse(t); } catch { body = { raw: t }; } return { status: r.status, body }; }

(async () => {
  console.log(`\n▶ Payments / Returns / Approvals FULL audit (run ${RUN})\n`);
  let paymentId = '', returnId = '', approvalId = '', caseId = '';
  try {
    ({ paymentId, returnId, approvalId, caseId } = await plant());
    console.log(`  · planted payment=${paymentId.slice(0, 8)} return=${returnId.slice(0, 8)} approval=${approvalId.slice(0, 8)}\n`);

    // ── PAYMENTS ─────────────────────────────────────────────
    section('PAYMENTS · list / detail / context');
    {
      const { status, body } = await get('/api/payments');
      const list = Array.isArray(body) ? body : body?.data || [];
      record('GET /api/payments (200)', status === 200 ? 'pass' : 'fail', `rows=${list.length}`);
      const found = list.find((p: any) => p.id === paymentId);
      record('Plant present in list', !!found ? 'pass' : 'fail');
      record('No duplicate canonical row', list.filter((p: any) => p.id === paymentId).length === 1 ? 'pass' : 'fail');
      record('Column: status real', String(found?.status).toLowerCase() === 'captured' ? 'pass' : 'fail', found?.status);
      record('Column: amount real', Number(found?.amount) === 200 ? 'pass' : 'fail');
      record('Column: currency real', found?.currency === 'EUR' ? 'pass' : 'fail');
      record('Column: psp real', found?.psp === 'stripe' ? 'pass' : 'fail');
    }
    {
      const { status, body } = await get(`/api/payments/${paymentId}`);
      record('GET /api/payments/:id (200)', status === 200 ? 'pass' : 'fail');
      record('Detail.systemStates populated', !!(body?.system_states ?? body?.systemStates) ? 'pass' : 'fail');
      record('Detail.events array exists', Array.isArray(body?.events) ? 'pass' : 'fail');
    }
    {
      const { status } = await get(`/api/payments/${paymentId}/context`);
      record('GET /api/payments/:id/context (200|404)', [200, 404].includes(status) ? 'pass' : 'fail', `status=${status}`);
    }

    section('PAYMENTS · actions');
    {
      const r = await post(`/api/payments/${paymentId}/refund-advanced`, { mode: 'partial', amount: 50, reason: `audit ${RUN}` });
      record('POST /refund-advanced partial=50', r.status === 200 ? 'pass' : 'fail', `status=${r.status}`);
      record('Refund applied amount', Number(r.body?.amount) === 50 ? 'pass' : 'fail');
    }
    {
      // Open Stripe gateway is a window.open in the UI — no backend call,
      // but we still verify the dashboard URL builder logic by checking the
      // payment's external id is exposed.
      const { body } = await get(`/api/payments/${paymentId}`);
      const ext = body?.external_payment_id || body?.externalPaymentId;
      record('Stripe gateway link source (external_payment_id)', !!ext ? 'pass' : 'fail', ext || '');
    }

    // ── RETURNS ──────────────────────────────────────────────
    section('RETURNS · list / detail / context');
    {
      const { status, body } = await get('/api/returns');
      const list = Array.isArray(body) ? body : body?.data || [];
      record('GET /api/returns (200)', status === 200 ? 'pass' : 'fail', `rows=${list.length}`);
      const found = list.find((r: any) => r.id === returnId);
      record('Plant present in list', !!found ? 'pass' : 'fail');
      record('Column: status real', found?.status === 'pending_review' ? 'pass' : 'fail');
      record('Column: return_reason real', (found?.return_reason ?? found?.returnReason) === 'damaged' ? 'pass' : 'fail');
      record('Column: return_value real', Number(found?.return_value ?? found?.returnValue) === 200 ? 'pass' : 'fail');
    }
    {
      const { status, body } = await get(`/api/returns/${returnId}`);
      record('GET /api/returns/:id (200)', status === 200 ? 'pass' : 'fail');
      record('Detail has external_return_id', !!(body?.external_return_id ?? body?.externalReturnId) ? 'pass' : 'fail');
    }
    {
      const { status } = await get(`/api/returns/${returnId}/context`);
      record('GET /api/returns/:id/context (200|404)', [200, 404].includes(status) ? 'pass' : 'fail', `status=${status}`);
    }

    section('RETURNS · actions (every modal button)');
    {
      const r = await patch(`/api/returns/${returnId}/status`, { status: 'received', reason: 'audit received' });
      record('PATCH /returns/:id/status received', r.status === 200 ? 'pass' : 'fail', `status=${r.status} body=${JSON.stringify(r.body).slice(0, 80)}`);
    }
    {
      // RETURN_STATUSES enum has 'inspected' (not 'received_inspected').
      const r = await patch(`/api/returns/${returnId}/status`, { status: 'inspected', inspection_status: 'inspected', reason: 'audit inspect' });
      record('PATCH inspection_status=inspected', r.status === 200 ? 'pass' : 'fail', `status=${r.status}`);
    }
    {
      const r = await patch(`/api/returns/${returnId}/status`, { status: 'refunded', refund_status: 'refunded', reason: 'audit refunded' });
      record('PATCH refund_status=refunded', r.status === 200 ? 'pass' : 'fail', `status=${r.status}`);
    }
    {
      const r = await patch(`/api/returns/${returnId}/status`, { status: 'rejected', reason: 'audit reject' });
      record('PATCH status=rejected', r.status === 200 ? 'pass' : 'fail', `status=${r.status}`);
    }
    {
      const r = await patch(`/api/returns/${returnId}/status`, { status: 'blocked', approval_status: 'blocked', reason: 'audit block' });
      record('PATCH status=blocked', r.status === 200 ? 'pass' : 'fail', `status=${r.status}`);
    }
    {
      // Validation: invalid status must reject
      const r = await patch(`/api/returns/${returnId}/status`, { status: 'NOT_A_VALID_STATUS' });
      record('PATCH rejects invalid status', r.status === 400 ? 'pass' : 'fail', `status=${r.status}`);
    }

    // ── APPROVALS ────────────────────────────────────────────
    section('APPROVALS · list / detail / context');
    {
      const { status, body } = await get('/api/approvals?limit=100');
      const list = Array.isArray(body) ? body : (Array.isArray(body?.items) ? body.items : []);
      record('GET /api/approvals (200)', status === 200 ? 'pass' : 'fail', `rows=${list.length}`);
      const found = list.find((a: any) => a.id === approvalId);
      record('Plant present in list', !!found ? 'pass' : 'fail');
      record('Column: action_type real', (found?.action_type ?? found?.actionType ?? found?.request_type ?? found?.requestType) === 'refund' ? 'pass' : 'fail');
      record('Column: risk_level real', (found?.risk_level ?? found?.riskLevel) === 'medium' ? 'pass' : 'fail');
      record('Column: status real (pending)', found?.status === 'pending' ? 'pass' : 'fail');
    }
    {
      const { status, body } = await get(`/api/approvals/${approvalId}`);
      record('GET /api/approvals/:id (200)', status === 200 ? 'pass' : 'fail');
      const payloadId = body?.action_payload?.payment_id ?? body?.actionPayload?.paymentId ?? body?.metadata?.payment_id;
      record('Detail.action_payload has payment_id', !!payloadId ? 'pass' : 'fail');
    }
    {
      const { status } = await get(`/api/approvals/${approvalId}/context`);
      record('GET /api/approvals/:id/context (200|404)', [200, 404].includes(status) ? 'pass' : 'fail', `status=${status}`);
    }

    section('APPROVALS · actions');
    {
      // Use a fresh approval for each decision so the test is order-independent.
      const reject = randomUUID(); cleanup.approvalIds.push(reject);
      await supabase.from('approval_requests').insert({
        id: reject, tenant_id: TENANT, workspace_id: WS, case_id: caseId,
        action_type: 'refund', requested_by: 'system', requested_by_type: 'system',
        risk_level: 'low', action_payload: {}, evidence_package: {}, status: 'pending',
      });
      const r = await post(`/api/approvals/${reject}/decide`, { decision: 'rejected', note: 'audit reject', decided_by: 'audit-system' });
      record('POST /approvals/:id/decide rejected', r.status === 200 ? 'pass' : 'fail', `status=${r.status}`);
    }
    {
      const r = await post(`/api/approvals/${approvalId}/decide`, { decision: 'approved', note: 'audit approve', decided_by: 'audit-system' });
      record('POST /approvals/:id/decide approved', r.status === 200 ? 'pass' : 'fail', `status=${r.status}`);
    }
    {
      // Already-decided approval should reject second decision.
      const r = await post(`/api/approvals/${approvalId}/decide`, { decision: 'rejected', decided_by: 'audit' });
      record('Re-decide rejected (idempotency / already-decided)', [400, 409, 422].includes(r.status) ? 'pass' : 'fail', `status=${r.status}`);
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
  console.log(`\n${'─'.repeat(74)}`);
  console.log(`Payments+Returns+Approvals audit: ${pass} pass · ${partial} partial · ${fail} fail / ${results.length} checks`);
  console.log(`${'─'.repeat(74)}\n`);
  if (fail > 0) {
    console.log('Failures:');
    for (const r of results.filter((x) => x.status === 'fail')) console.log(`  ✗ ${r.feature.padEnd(60)} ${r.detail}`);
  }
  process.exit(fail > 0 ? 1 : 0);
})().catch((err) => { console.error('Suite crashed:', err); server.close(); process.exit(2); });
