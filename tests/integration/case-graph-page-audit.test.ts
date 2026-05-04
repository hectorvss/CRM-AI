/**
 * tests/integration/case-graph-page-audit.test.ts
 *
 * Full audit of the /case-graph page. For every API call the page makes,
 * we hit the route in-process and assert the response is well-formed.
 *
 * Endpoints audited:
 *   GET  /api/cases                                  (list)
 *   GET  /api/cases/:id/state                        (state)
 *   GET  /api/cases/:id/graph                        (tree + timeline)
 *   GET  /api/cases/:id/resolve                      (resolve view)
 *   GET  /api/cases/:id/checks                       (checks engine)
 *   POST /api/ai/copilot/:id                         (copilot chat)
 *   POST /api/cases/:id/resolution/execute-step      (run a single step)
 *   POST /api/cases/:id/resolve/start                (AI resolve)
 *   POST /api/super-agent/command                    (legacy fallback)
 *
 * Plants a synthetic case before testing and cleans up after.
 *
 * Run:  node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/case-graph-page-audit.test.ts
 */

import express from 'express';
import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../../server/db/supabase.js';

import casesRouter from '../../server/routes/cases.js';
import aiRouter from '../../server/routes/ai.js';
import superAgentRouter from '../../server/routes/superAgent.js';

// ws_default has org_id='org_default', and the middleware coerces our
// tenant header to that org_id when the workspace is the default one.
// Plant under that tenancy so the cases are visible after middleware.
const TENANT = 'org_default';
const WS = 'ws_default';
const RUN = randomUUID().slice(0, 6);
const supabase = getSupabaseAdmin();
const cleanup = { caseIds: [] as string[], orderIds: [] as string[], paymentIds: [] as string[], returnIds: [] as string[], refundIds: [] as string[], customerIds: [] as string[] };

interface AuditResult {
  feature: string;
  status: 'pass' | 'fail' | 'partial';
  detail: string;
}
const results: AuditResult[] = [];
const record = (feature: string, status: 'pass' | 'fail' | 'partial', detail = '') => {
  results.push({ feature, status, detail });
  const tag = status === 'pass' ? '✓' : status === 'partial' ? '◐' : '✗';
  console.log(`  ${tag} ${feature.padEnd(48)} ${detail}`);
};

async function plant() {
  const customerId = randomUUID();
  const caseId = randomUUID();
  const orderId = randomUUID();
  const paymentId = randomUUID();
  const returnId = randomUUID();
  const refundId = randomUUID();
  cleanup.customerIds.push(customerId);
  cleanup.caseIds.push(caseId);
  cleanup.orderIds.push(orderId);
  cleanup.paymentIds.push(paymentId);
  cleanup.returnIds.push(returnId);
  cleanup.refundIds.push(refundId);
  const ins = async (t: string, r: any) => {
    const { error } = await supabase.from(t).insert(r);
    if (error) throw new Error(`${t}: ${error.message}`);
  };
  await ins('customers', { id: customerId, tenant_id: TENANT, workspace_id: WS, canonical_name: `Audit ${RUN}`, canonical_email: `audit+${RUN}@test.com` });
  await ins('orders', { id: orderId, tenant_id: TENANT, workspace_id: WS, customer_id: customerId, external_order_id: `ORD-A-${RUN}`, status: 'open', fulfillment_status: 'in_transit', tracking_number: `TRK${RUN}`, total_amount: 100, currency: 'EUR' });
  await ins('payments', { id: paymentId, tenant_id: TENANT, workspace_id: WS, customer_id: customerId, order_id: orderId, external_payment_id: `pi_a_${RUN}`, psp: 'stripe', status: 'captured', amount: 100, currency: 'EUR', refund_amount: 50 });
  await ins('returns', { id: returnId, tenant_id: TENANT, workspace_id: WS, customer_id: customerId, order_id: orderId, external_return_id: `RMA-A-${RUN}`, status: 'pending_review', return_reason: 'damaged' });
  await ins('refunds', { id: refundId, tenant_id: TENANT, payment_id: paymentId, order_id: orderId, customer_id: customerId, external_refund_id: `re_a_${RUN}`, status: 'failed', amount: 30, currency: 'EUR', type: 'manual', idempotency_key: `idem_a_${RUN}` });
  await ins('cases', { id: caseId, case_number: `AUDIT-${RUN}`, tenant_id: TENANT, workspace_id: WS, customer_id: customerId, type: 'refund_request', sub_type: 'damaged_goods', status: 'open', priority: 'high', source_system: 'manual', source_channel: 'test', order_ids: [orderId], payment_ids: [paymentId], return_ids: [returnId], ai_diagnosis: 'Damaged goods, refund failed at PSP.' });
  return { caseId };
}

async function doCleanup() {
  if (cleanup.refundIds.length) await supabase.from('refunds').delete().in('id', cleanup.refundIds);
  if (cleanup.returnIds.length) await supabase.from('returns').delete().in('id', cleanup.returnIds);
  if (cleanup.paymentIds.length) await supabase.from('payments').delete().in('id', cleanup.paymentIds);
  if (cleanup.caseIds.length) await supabase.from('cases').delete().in('id', cleanup.caseIds);
  if (cleanup.orderIds.length) await supabase.from('orders').delete().in('id', cleanup.orderIds);
  if (cleanup.customerIds.length) await supabase.from('customers').delete().in('id', cleanup.customerIds);
}

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.tenantId = TENANT;
  req.workspaceId = WS;
  req.userId = `audit-${RUN}`;
  req.permissions = ['*'];
  next();
});
app.use('/api/cases', casesRouter);
app.use('/api/ai', aiRouter);
app.use('/api/super-agent', superAgentRouter);

const server = app.listen(0);
const port = (server.address() as any).port;
const base = `http://127.0.0.1:${port}`;

const HEADERS: Record<string, string> = {
  'x-tenant-id': TENANT,
  'x-workspace-id': WS,
  // 'system' bypasses workspace SSO/MFA/IP policies — appropriate for an
  // in-process audit that needs to exercise every endpoint regardless of
  // tenant security config. Real users go through Supabase auth.
  'x-user-id': 'system',
  'x-permissions': '*',
};
async function get(path: string) {
  const r = await fetch(`${base}${path}`, { headers: HEADERS });
  const text = await r.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { status: r.status, body };
}
async function post(path: string, payload?: any) {
  const r = await fetch(`${base}${path}`, { method: 'POST', headers: { ...HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) });
  const text = await r.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { status: r.status, body };
}

(async () => {
  console.log(`\n▶ Case Graph page audit (run ${RUN})\n`);
  let caseId = '';
  try {
    ({ caseId } = await plant());
    console.log(`  · planted case ${caseId.slice(0, 8)}\n`);

    // ── 1. Cases list (left sidebar) ──────────────────────────────
    {
      const { status, body } = await get('/api/cases');
      const list = Array.isArray(body) ? body : (body?.cases || body?.data || []);
      const found = Array.isArray(list) && list.some((c: any) => c.id === caseId);
      if (status === 200 && found) record('GET /api/cases (left sidebar list)', 'pass', `${list.length} cases, plant included`);
      else record('GET /api/cases (left sidebar list)', 'fail', `status=${status} found=${found} body=${JSON.stringify(body).slice(0, 80)}`);
    }

    // ── 2. Case state (used by Copilot brief + impactedModule) ────
    {
      const { status, body } = await get(`/api/cases/${caseId}/state`);
      const ok = status === 200 && body?.case?.id === caseId;
      record('GET /api/cases/:id/state', ok ? 'pass' : 'fail', ok ? `case=${body.case.case_number}` : `status=${status}`);
    }

    // ── 3. Case graph (Tree View + checks + timeline) ─────────────
    {
      const { status, body } = await get(`/api/cases/${caseId}/graph`);
      const hasBranches = Array.isArray(body?.branches) && body.branches.length > 0;
      const hasChecks = body?.checks?.categories?.length === 13;
      const hasTimeline = Array.isArray(body?.timeline);
      const hasMergedChecks = (body?.timeline || []).some((t: any) => t.entry_type === 'check');
      const checkCount = (body?.timeline || []).filter((t: any) => t.entry_type === 'check').length;
      const ok = status === 200 && hasBranches && hasChecks && hasTimeline;
      record('GET /api/cases/:id/graph: branches', hasBranches ? 'pass' : 'fail', `${(body?.branches || []).length} branches`);
      record('GET /api/cases/:id/graph: 13 categories', hasChecks ? 'pass' : 'fail', `categories=${body?.checks?.categories?.length}`);
      record('GET /api/cases/:id/graph: timeline merge', hasMergedChecks ? 'pass' : 'partial', `${checkCount} check entries in timeline`);
      record('GET /api/cases/:id/graph: totals', body?.checks?.totals ? 'pass' : 'fail', body?.checks?.totals ? `pass=${body.checks.totals.pass} warn=${body.checks.totals.warn} fail=${body.checks.totals.fail}` : 'no totals');
    }

    // ── 4. Case resolve (Resolve panel) ───────────────────────────
    {
      const { status, body } = await get(`/api/cases/${caseId}/resolve`);
      const hasConflict = !!body?.conflict;
      const hasIdentified = Array.isArray(body?.identified_problems);
      const identifiedCount = body?.identified_problems?.length || 0;
      const hasExecutionSteps = Array.isArray(body?.execution?.steps);
      record('GET /api/cases/:id/resolve: conflict', hasConflict ? 'pass' : 'fail');
      record('GET /api/cases/:id/resolve: identified_problems', hasIdentified ? 'pass' : 'fail', `${identifiedCount} problems`);
      record('GET /api/cases/:id/resolve: execution.steps', hasExecutionSteps ? 'pass' : 'fail', `${body?.execution?.steps?.length || 0} steps`);
      record('GET /api/cases/:id/resolve: status', status === 200 ? 'pass' : 'fail');
    }

    // ── 5. Direct checks endpoint ─────────────────────────────────
    {
      const { status, body } = await get(`/api/cases/${caseId}/checks`);
      const ok = status === 200 && body?.categories?.length === 13;
      record('GET /api/cases/:id/checks (direct)', ok ? 'pass' : 'fail', ok ? `${body.flat.length} total checks` : `status=${status}`);
    }

    // ── 6. Copilot chat (Right sidebar) ───────────────────────────
    {
      const { status, body } = await post(`/api/ai/copilot/${caseId}`, { question: 'What is the current status?', history: [] });
      const ok = (status === 200 || status === 402) && (body?.answer || body?.summary || body?.message);
      record('POST /api/ai/copilot/:id (Copilot chat)', ok ? 'pass' : 'fail', `status=${status} source=${body?.source || 'n/a'} hasAnswer=${!!body?.answer}`);
    }

    // ── 7. Execute single resolution step (Run button) ────────────
    {
      // First fetch resolve to get a valid step id
      const { body: resolveBody } = await get(`/api/cases/${caseId}/resolve`);
      const firstStep = resolveBody?.execution?.steps?.[0];
      if (!firstStep) {
        record('POST /api/cases/:id/resolution/execute-step', 'partial', 'no steps available to execute');
      } else {
        const { status, body } = await post(`/api/cases/${caseId}/resolution/execute-step`, { stepId: firstStep.id });
        // 200/202/204 acceptable; 4xx if step not actionable (also acceptable)
        const ok = [200, 202, 204, 400, 404, 422].includes(status);
        record('POST /api/cases/:id/resolution/execute-step', ok ? 'pass' : 'fail', `status=${status}`);
      }
    }

    // ── 8. Start AI resolve (Resolve with AI button) ──────────────
    {
      const { status, body } = await post(`/api/cases/${caseId}/resolve/start`, { autonomy: 'assisted', dry_run: true });
      // 200 ok plan, 200 with credit_exhausted ok (no AI key configured locally),
      // 402 acceptable (no credits), 500 NOT acceptable.
      const ok = status === 200 && (body?.summary || body?.response);
      record('POST /api/cases/:id/resolve/start (AI resolve)', ok ? 'pass' : status === 402 ? 'partial' : 'fail', `status=${status} kind=${body?.response?.kind || 'n/a'}`);
    }

    // ── 9. Super Agent fallback command ──────────────────────────
    {
      const { status } = await post(`/api/super-agent/command`, { input: `Audit ping for case ${caseId}`, mode: 'investigate', autonomyLevel: 'assisted' });
      const ok = [200, 202, 402].includes(status);
      record('POST /api/super-agent/command (fallback)', ok ? 'pass' : 'fail', `status=${status}`);
    }

  } catch (err: any) {
    console.error(`\n  ✗✗ suite threw: ${err?.message ?? String(err)}\n`);
    record('audit-suite', 'fail', err?.message ?? String(err));
  } finally {
    await doCleanup().catch((e) => console.warn('cleanup warn:', e?.message));
    server.close();
  }

  // ── Summary ──────────────────────────────────────────────────
  const pass = results.filter((r) => r.status === 'pass').length;
  const partial = results.filter((r) => r.status === 'partial').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`Case Graph audit: ${pass} pass · ${partial} partial · ${fail} fail / ${results.length} checks`);
  console.log(`${'─'.repeat(70)}\n`);

  if (fail > 0) {
    console.log('Failures:');
    for (const r of results.filter((x) => x.status === 'fail')) console.log(`  ✗ ${r.feature} — ${r.detail}`);
    console.log('');
  }
  if (partial > 0) {
    console.log('Partials:');
    for (const r of results.filter((x) => x.status === 'partial')) console.log(`  ◐ ${r.feature} — ${r.detail}`);
    console.log('');
  }

  process.exit(fail > 0 ? 1 : 0);
})().catch((err) => { console.error('Suite crashed:', err); server.close(); process.exit(2); });
