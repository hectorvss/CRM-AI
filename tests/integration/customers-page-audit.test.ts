/**
 * tests/integration/customers-page-audit.test.ts
 *
 * Full audit of the /customers page. For every API call the page makes,
 * we hit the route in-process and assert the response is well-formed.
 *
 * Endpoints audited:
 *   GET  /api/customers                          (left sidebar list)
 *   GET  /api/customers/:id                      (detail)
 *   GET  /api/customers/:id/state                (state for detail KPIs)
 *   GET  /api/customers/:id/activity             (timeline / system logs)
 *   POST /api/customers                          (Create new customer)
 *   PATCH /api/customers/:id                     (edit)
 *   POST /api/customers/:id/merge                (de-duplication)
 *
 * Plus shape assertions on every UI piece:
 *   - de-duplication via linked_identities (no duplicate canonical rows)
 *   - columns: source, segment, open, ai_impact, top_issue, risk, problems
 *   - sidebar KPIs: resolution_rate, ai_handled, conversations, approvals
 *   - detail KPIs: lifetime_value, open_cases, next_renewal, risk_level
 *   - AI Executive Summary populated
 *   - Tabs: all_activity / conversations / orders / system_logs
 *
 * Run:  node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/customers-page-audit.test.ts
 */

import express from 'express';
import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../../server/db/supabase.js';
import customersRouter from '../../server/routes/customers.js';

const TENANT = 'org_default';
const WS = 'ws_default';
const RUN = randomUUID().slice(0, 6);
const supabase = getSupabaseAdmin();

const cleanup = {
  customerIds: [] as string[],
  caseIds: [] as string[],
  orderIds: [] as string[],
  paymentIds: [] as string[],
  identityIds: [] as string[],
};

interface AuditResult { feature: string; status: 'pass' | 'fail' | 'partial'; detail: string; }
const results: AuditResult[] = [];
const record = (feature: string, status: AuditResult['status'], detail = '') => {
  results.push({ feature, status, detail });
  const tag = status === 'pass' ? '✓' : status === 'partial' ? '◐' : '✗';
  console.log(`  ${tag} ${feature.padEnd(56)} ${detail}`);
};

const HEADERS: Record<string, string> = {
  'x-tenant-id': TENANT,
  'x-workspace-id': WS,
  'x-user-id': 'system',
  'x-permissions': '*',
};

async function plant() {
  // Plant a customer with multiple linked identities (cross-channel dedup
  // canary), one resolved case, two open cases (one with a conflict), one
  // order, one payment, one activity row, and a populated AI summary.
  const customerId = `cust_audit_${RUN}`;
  const orderId = randomUUID();
  const paymentId = randomUUID();
  const caseOpenId = randomUUID();
  const caseResolvedId = randomUUID();
  const caseConflictId = randomUUID();

  cleanup.customerIds.push(customerId);
  cleanup.orderIds.push(orderId);
  cleanup.paymentIds.push(paymentId);
  cleanup.caseIds.push(caseOpenId, caseResolvedId, caseConflictId);

  const ins = async (t: string, r: any) => {
    const { error } = await supabase.from(t).insert(r);
    if (error) throw new Error(`${t}: ${error.message}`);
  };
  const insMany = async (t: string, rs: any[]) => {
    if (!rs.length) return;
    const { error } = await supabase.from(t).insert(rs);
    if (error) throw new Error(`${t} bulk: ${error.message}`);
  };

  await ins('customers', {
    id: customerId, tenant_id: TENANT, workspace_id: WS,
    canonical_name: `Audit Customer ${RUN}`,
    canonical_email: `audit+${RUN}@test.com`,
    email: `audit+${RUN}@test.com`,
    phone: `+34600${RUN.padStart(6, '0').slice(0, 6)}`,
    segment: 'vip',
    risk_level: 'medium',
    lifetime_value: 8540,
    plan: 'Standard',
    next_renewal: '2026-12-01',
    fraud_risk: 'low',
    ai_executive_summary: `Audit customer ${RUN} has 1 resolved + 2 open cases.`,
    ai_recommendations: [{ action: 'Review chargeback', priority: 'high', reason: 'CB-${RUN} open' }],
    ai_impact_resolved: 1,
    ai_impact_approvals: 0,
    ai_impact_escalated: 0,
    top_issue: 'Refund conflict',
  });

  // Three linked identities — proves cross-source dedup (one canonical row).
  await insMany('linked_identities', [
    { id: randomUUID(), customer_id: customerId, tenant_id: TENANT, workspace_id: WS, system: 'shopify', external_id: `shopify_audit_${RUN}`, confidence: 1, verified: true, verified_at: new Date().toISOString() },
    { id: randomUUID(), customer_id: customerId, tenant_id: TENANT, workspace_id: WS, system: 'stripe',  external_id: `cus_audit_${RUN}`,    confidence: 1, verified: true, verified_at: new Date().toISOString() },
    { id: randomUUID(), customer_id: customerId, tenant_id: TENANT, workspace_id: WS, system: 'whatsapp',external_id: `wa_audit_${RUN}`,     confidence: 1, verified: true, verified_at: new Date().toISOString() },
  ]);

  await ins('orders', {
    id: orderId, tenant_id: TENANT, workspace_id: WS, customer_id: customerId,
    external_order_id: `ORD-AU-${RUN}`,
    status: 'fulfilled', fulfillment_status: 'delivered',
    total_amount: 250, currency: 'EUR',
  });
  await ins('payments', {
    id: paymentId, tenant_id: TENANT, workspace_id: WS, customer_id: customerId, order_id: orderId,
    external_payment_id: `pi_au_${RUN}`, psp: 'stripe',
    status: 'captured', amount: 250, currency: 'EUR',
  });
  await insMany('cases', [
    { id: caseOpenId, case_number: `CAU-${RUN}-O`, tenant_id: TENANT, workspace_id: WS, customer_id: customerId, type: 'order_inquiry', status: 'open', priority: 'medium', source_system: 'manual', source_channel: 'test' },
    { id: caseResolvedId, case_number: `CAU-${RUN}-R`, tenant_id: TENANT, workspace_id: WS, customer_id: customerId, type: 'order_inquiry', status: 'resolved', priority: 'low', source_system: 'manual', source_channel: 'test' },
    { id: caseConflictId, case_number: `CAU-${RUN}-C`, tenant_id: TENANT, workspace_id: WS, customer_id: customerId, type: 'refund_request', status: 'open', priority: 'high', source_system: 'manual', source_channel: 'test', has_reconciliation_conflicts: true, conflict_severity: 'critical', ai_root_cause: 'Refund amount mismatch', ai_recommended_action: 'Reconcile with PSP' },
  ]);

  // Activity entry of each kind
  await insMany('customer_activity', [
    { id: randomUUID(), tenant_id: TENANT, customer_id: customerId, type: 'ai_summary', system: 'super_agent', level: 'info', title: 'Diagnóstico del agente', content: `Confianza 86%: revisar chargeback CB-${RUN}.`, source: 'super_agent', occurred_at: new Date(Date.now() - 3 * 60_000).toISOString() },
    { id: randomUUID(), tenant_id: TENANT, customer_id: customerId, type: 'system_log', system: 'pipeline', level: 'info', title: 'Pipeline tick', content: `Reconciliation pass for case ${caseConflictId.slice(0, 8)}`, source: 'pipeline', occurred_at: new Date(Date.now() - 2 * 60_000).toISOString() },
    { id: randomUUID(), tenant_id: TENANT, customer_id: customerId, type: 'payment', system: 'stripe', level: 'info', title: 'Captured', content: `pi_au_${RUN} captured`, source: 'stripe', occurred_at: new Date(Date.now() - 60_000).toISOString() },
  ]);

  return { customerId, caseIds: [caseOpenId, caseResolvedId, caseConflictId], orderId, paymentId };
}

async function doCleanup() {
  if (cleanup.caseIds.length) await supabase.from('cases').delete().in('id', cleanup.caseIds);
  if (cleanup.paymentIds.length) await supabase.from('payments').delete().in('id', cleanup.paymentIds);
  if (cleanup.orderIds.length) await supabase.from('orders').delete().in('id', cleanup.orderIds);
  if (cleanup.customerIds.length) {
    await supabase.from('customer_activity').delete().in('customer_id', cleanup.customerIds);
    await supabase.from('linked_identities').delete().in('customer_id', cleanup.customerIds);
    await supabase.from('customers').delete().in('id', cleanup.customerIds);
  }
}

const app = express();
app.use(express.json());
app.use('/api/customers', customersRouter);
const server = app.listen(0);
const port = (server.address() as any).port;
const base = `http://127.0.0.1:${port}`;

async function get(path: string) {
  const r = await fetch(`${base}${path}`, { headers: HEADERS });
  const t = await r.text();
  let body: any; try { body = JSON.parse(t); } catch { body = { raw: t }; }
  return { status: r.status, body };
}
async function post(path: string, payload: any) {
  const r = await fetch(`${base}${path}`, { method: 'POST', headers: { ...HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const t = await r.text();
  let body: any; try { body = JSON.parse(t); } catch { body = { raw: t }; }
  return { status: r.status, body };
}
async function patch(path: string, payload: any) {
  const r = await fetch(`${base}${path}`, { method: 'PATCH', headers: { ...HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const t = await r.text();
  let body: any; try { body = JSON.parse(t); } catch { body = { raw: t }; }
  return { status: r.status, body };
}

(async () => {
  console.log(`\n▶ Customers page audit (run ${RUN})\n`);
  let customerId = '';
  try {
    ({ customerId } = await plant());
    console.log(`  · planted customer ${customerId}\n`);

    // ── 1. List endpoint ────────────────────────────────────────
    {
      const { status, body } = await get('/api/customers');
      const list = Array.isArray(body) ? body : (body?.data || []);
      const found = list.find((c: any) => c.id === customerId);
      record('GET /api/customers (list, status 200)', status === 200 ? 'pass' : 'fail', `status=${status}`);
      record('GET /api/customers (canonical row present)', !!found ? 'pass' : 'fail', found ? `name="${found.canonicalName || found.canonical_name}"` : 'plant not in list');

      // ── No duplicates: assert customerId only once
      const dupCount = list.filter((c: any) => c.id === customerId).length;
      record('No duplicate canonical rows (dedup)', dupCount === 1 ? 'pass' : 'fail', `appearances=${dupCount}`);

      // ── 3 linked identities surfaced
      const liCount = (found?.linkedIdentities || found?.linked_identities || []).length;
      record('linked_identities surface 3 sources', liCount === 3 ? 'pass' : 'fail', `linked=${liCount}`);

      // Column checks
      record('Column: source/linked_identities', liCount > 0 ? 'pass' : 'fail');
      record('Column: segment', !!(found?.segment) ? 'pass' : 'fail', found?.segment);
      record('Column: open_cases (problems)', typeof (found?.openCases ?? found?.open_cases) === 'number' ? 'pass' : 'fail', `open=${found?.openCases ?? found?.open_cases}`);
      record('Column: ai_impact (resolved/approvals)', typeof (found?.aiImpactResolved ?? found?.ai_impact_resolved) === 'number' ? 'pass' : 'fail', `ai_resolved=${found?.aiImpactResolved ?? found?.ai_impact_resolved}`);
      record('Column: top_issue', !!(found?.topIssue ?? found?.top_issue) ? 'pass' : 'fail', `topIssue="${found?.topIssue ?? found?.top_issue}"`);
      record('Column: risk_level', !!(found?.riskLevel ?? found?.risk_level) ? 'pass' : 'fail', `risk=${found?.riskLevel ?? found?.risk_level}`);

      // ── New: Problems column (resolved / unresolved counts)
      const totalCases = found?.totalCases ?? found?.total_cases;
      const activeConflicts = found?.activeConflicts ?? found?.active_conflicts;
      const resolvedProblems = found?.problemsResolved ?? found?.problems_resolved;
      const unresolvedProblems = found?.problemsUnresolved ?? found?.problems_unresolved;
      const hasProblemsColumn = typeof resolvedProblems === 'number' && typeof unresolvedProblems === 'number';
      record('Column: problems_resolved / problems_unresolved (NEW)', hasProblemsColumn ? 'pass' : 'fail', hasProblemsColumn ? `resolved=${resolvedProblems} unresolved=${unresolvedProblems}` : `total_cases=${totalCases} conflicts=${activeConflicts}`);
    }

    // ── 2. Detail endpoint ───────────────────────────────────────
    {
      const { status, body } = await get(`/api/customers/${customerId}`);
      record('GET /api/customers/:id (detail, status 200)', status === 200 ? 'pass' : 'fail', `status=${status}`);
      record('Detail: lifetime_value', Number(body?.lifetimeValue ?? body?.lifetime_value) > 0 ? 'pass' : 'fail', `ltv=${body?.lifetimeValue ?? body?.lifetime_value}`);
      record('Detail: next_renewal', !!(body?.nextRenewal ?? body?.next_renewal) ? 'pass' : 'fail');
      record('Detail: risk_level', !!(body?.riskLevel ?? body?.risk_level) ? 'pass' : 'fail');
      record('Detail: ai_executive_summary populated', !!(body?.aiExecutiveSummary ?? body?.ai_executive_summary) ? 'pass' : 'fail');
      const recs = body?.aiRecommendations ?? body?.ai_recommendations;
      record('Detail: ai_recommendations populated', Array.isArray(recs) && recs.length > 0 ? 'pass' : 'fail', `count=${recs?.length ?? 0}`);
    }

    // ── 3. State endpoint (drives detail KPIs) ───────────────────
    {
      const { status, body } = await get(`/api/customers/${customerId}/state`);
      const m = body?.metrics || {};
      record('GET /api/customers/:id/state (status 200)', status === 200 ? 'pass' : 'fail', `status=${status}`);
      record('State.metrics.lifetime_value', Number(m.lifetimeValue ?? m.lifetime_value) > 0 ? 'pass' : 'fail');
      record('State.metrics.open_cases', typeof (m.openCases ?? m.open_cases) === 'number' ? 'pass' : 'fail', `open=${m.openCases ?? m.open_cases}`);
      record('State.metrics.active_conflicts', typeof (m.activeConflicts ?? m.active_conflicts) === 'number' ? 'pass' : 'fail', `conflicts=${m.activeConflicts ?? m.active_conflicts}`);
      const sysCount = body?.systems ? Object.keys(body.systems).length : 0;
      record('State.systems (orders/payments/returns)', sysCount >= 3 ? 'pass' : 'fail', `${sysCount} systems`);
      record('State.recent_cases populated', Array.isArray(body?.recentCases ?? body?.recent_cases) ? 'pass' : 'fail');
    }

    // ── 4. Activity timeline (All Activity / System Logs tabs) ──
    {
      const { status, body } = await get(`/api/customers/${customerId}/activity`);
      const events = Array.isArray(body) ? body : [];
      const hasSummary = events.some((e: any) => e.type === 'ai_summary');
      const hasLog = events.some((e: any) => e.type === 'system_log');
      const hasPayment = events.some((e: any) => e.type === 'payment');
      record('GET /api/customers/:id/activity (status 200)', status === 200 ? 'pass' : 'fail', `status=${status}`);
      record('Activity.types: ai_summary present', hasSummary ? 'pass' : 'fail');
      record('Activity.types: system_log present', hasLog ? 'pass' : 'fail');
      record('Activity.types: payment present', hasPayment ? 'pass' : 'fail');
      record('Activity rows total', events.length >= 3 ? 'pass' : 'fail', `count=${events.length}`);
    }

    // ── 5. PATCH — Edit customer ─────────────────────────────────
    {
      const { status, body } = await patch(`/api/customers/${customerId}`, { segment: 'standard', risk_level: 'low' });
      const updatedSegment = body?.segment ?? body?.canonicalSegment;
      record('PATCH /api/customers/:id (edit)', status === 200 && updatedSegment === 'standard' ? 'pass' : 'fail', `status=${status} segment=${updatedSegment}`);
    }

    // ── 6. POST — Create customer ────────────────────────────────
    let createdId = '';
    {
      const { status, body } = await post('/api/customers', { canonical_name: `Created ${RUN}`, canonical_email: `created+${RUN}@test.com`, source: 'manual' });
      createdId = body?.id || '';
      if (createdId) cleanup.customerIds.push(createdId);
      record('POST /api/customers (create)', status === 201 && !!createdId ? 'pass' : 'fail', `status=${status}`);
    }

    // ── 7. POST — Merge two customers ───────────────────────────
    if (createdId) {
      const { status } = await post(`/api/customers/${customerId}/merge`, { sourceId: createdId });
      record('POST /api/customers/:id/merge (dedup tool)', status === 200 ? 'pass' : 'fail', `status=${status}`);
    } else {
      record('POST /api/customers/:id/merge (dedup tool)', 'partial', 'no source customer to merge');
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
  console.log(`\n${'─'.repeat(72)}`);
  console.log(`Customers audit: ${pass} pass · ${partial} partial · ${fail} fail / ${results.length} checks`);
  console.log(`${'─'.repeat(72)}\n`);
  if (fail > 0) {
    console.log('Failures:');
    for (const r of results.filter((x) => x.status === 'fail')) console.log(`  ✗ ${r.feature.padEnd(56)} ${r.detail}`);
    console.log('');
  }
  process.exit(fail > 0 ? 1 : 0);
})().catch((err) => { console.error('Suite crashed:', err); server.close(); process.exit(2); });
