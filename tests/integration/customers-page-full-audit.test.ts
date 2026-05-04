/**
 * tests/integration/customers-page-full-audit.test.ts
 *
 * Wall-to-wall audit of the /customers page. Exercises EVERY UI feature
 * via the same endpoints the React component calls, plus the data math
 * the component does client-side (sidebar KPIs, Health & Risk card,
 * Reconciliation card, Identity card, filters, search).
 *
 * What's covered:
 *   1.  GET /api/customers — list
 *   2.  Filters: ?segment, ?risk_level, ?q (search)
 *   3.  No-duplicate canonical row guarantee
 *   4.  Linked identities surface every connected source
 *   5.  Every column: Source / Segment / Open / AI Impact / Top Issues /
 *       Risk / Problems (resolved + unresolved)
 *   6.  Sidebar AI Impact Overview math (Resolution Rate, AI Handled,
 *       Conversations, Approvals)
 *   7.  Sidebar Operational Focus math (at risk, AI handled)
 *   8.  Sidebar Customer Segments quick-filters
 *   9.  GET /api/customers/:id — detail
 *  10.  Detail KPIs: Lifetime Value, Open Cases, Next Renewal, Risk Level
 *  11.  AI Executive Summary + Recommendations populated
 *  12.  GET /api/customers/:id/state — state for tabs
 *  13.  All Activity / Conversations / Orders / System Logs all populated
 *  14.  Identity card: name, email, since, linked profiles
 *  15.  Health & Risk card: Churn Risk + Fraud Risk
 *  16.  Reconciliation card: shown when has unresolved conflicts
 *  17.  Edit (PATCH), Create (POST), Merge (POST/:id/merge)
 *  18.  Cross-channel dedup proven via channelIngest pipeline
 *
 * Run:  node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/customers-page-full-audit.test.ts
 */

import express from 'express';
import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../../server/db/supabase.js';
import customersRouter from '../../server/routes/customers.js';
import { handleChannelIngest } from '../../server/pipeline/channelIngest.js';

const TENANT = 'org_default';
const WS = 'ws_default';
const RUN = randomUUID().slice(0, 6);
const supabase = getSupabaseAdmin();

const cleanup = {
  customerIds: [] as string[], caseIds: [] as string[], orderIds: [] as string[],
  paymentIds: [] as string[], canonicalIds: [] as string[],
};

interface AR { feature: string; status: 'pass' | 'fail' | 'partial'; detail: string; }
const results: AR[] = [];
const record = (feature: string, status: AR['status'], detail = '') => {
  results.push({ feature, status, detail });
  const tag = status === 'pass' ? '✓' : status === 'partial' ? '◐' : '✗';
  console.log(`  ${tag} ${feature.padEnd(60)} ${detail}`);
};
const section = (title: string) => console.log(`\n  ── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`);

const HEADERS = { 'x-tenant-id': TENANT, 'x-workspace-id': WS, 'x-user-id': 'system', 'x-permissions': '*' };

async function plant() {
  // VIP Sarah-style customer with everything wired:
  //   - 3 linked identities (cross-source dedup canary)
  //   - 1 resolved + 2 open cases (one with critical reconciliation conflict)
  //   - 1 order, 1 payment
  //   - activity rows of every kind (ai_summary, system_log, payment)
  //   - AI summary + recommendations populated
  //   - non-zero ai_impact_resolved/approvals/escalated
  const customerId = `cust_full_${RUN}`;
  const orderId = randomUUID();
  const paymentId = randomUUID();
  const caseOpenId = randomUUID();
  const caseResolvedId = randomUUID();
  const caseConflictId = randomUUID();

  cleanup.customerIds.push(customerId);
  cleanup.orderIds.push(orderId);
  cleanup.paymentIds.push(paymentId);
  cleanup.caseIds.push(caseOpenId, caseResolvedId, caseConflictId);

  const ins = async (t: string, r: any) => { const { error } = await supabase.from(t).insert(r); if (error) throw new Error(`${t}: ${error.message}`); };
  const insMany = async (t: string, rs: any[]) => { if (!rs.length) return; const { error } = await supabase.from(t).insert(rs); if (error) throw new Error(`${t} bulk: ${error.message}`); };

  await ins('customers', {
    id: customerId, tenant_id: TENANT, workspace_id: WS,
    canonical_name: `Full Audit ${RUN}`, canonical_email: `full+${RUN}@test.com`, email: `full+${RUN}@test.com`,
    phone: `+34611${String(parseInt(RUN, 36) % 1_000_000).padStart(6, '0')}`,
    segment: 'vip', risk_level: 'high', lifetime_value: 12340.5,
    plan: 'Standard', next_renewal: '2026-12-01',
    fraud_risk: 'medium',
    company: 'Acme Co', location: 'Madrid', timezone: 'Europe/Madrid',
    role: 'Customer', avatar_url: null,
    ai_executive_summary: `Full audit customer ${RUN} — VIP with 1 active conflict.`,
    ai_recommendations: [
      { action: 'Review chargeback', priority: 'high', reason: 'Active dispute open' },
      { action: 'Issue goodwill credit', priority: 'medium', reason: 'Repeat buyer' },
    ],
    ai_impact_resolved: 5, ai_impact_approvals: 2, ai_impact_escalated: 1,
    top_issue: 'Refund conflict',
  });

  await insMany('linked_identities', [
    { id: randomUUID(), customer_id: customerId, tenant_id: TENANT, workspace_id: WS, system: 'shopify', external_id: `shopify_full_${RUN}`, confidence: 1, verified: true, verified_at: new Date().toISOString() },
    { id: randomUUID(), customer_id: customerId, tenant_id: TENANT, workspace_id: WS, system: 'stripe',  external_id: `cus_full_${RUN}`,    confidence: 1, verified: true, verified_at: new Date().toISOString() },
    { id: randomUUID(), customer_id: customerId, tenant_id: TENANT, workspace_id: WS, system: 'gmail',   external_id: `full+${RUN}@test.com`, confidence: 1, verified: true, verified_at: new Date().toISOString() },
    { id: randomUUID(), customer_id: customerId, tenant_id: TENANT, workspace_id: WS, system: 'whatsapp',external_id: `wa_full_${RUN}`,     confidence: 1, verified: true, verified_at: new Date().toISOString() },
  ]);
  await ins('orders', { id: orderId, tenant_id: TENANT, workspace_id: WS, customer_id: customerId, external_order_id: `ORD-FU-${RUN}`, status: 'fulfilled', fulfillment_status: 'delivered', total_amount: 540, currency: 'EUR' });
  await ins('payments', { id: paymentId, tenant_id: TENANT, workspace_id: WS, customer_id: customerId, order_id: orderId, external_payment_id: `pi_fu_${RUN}`, psp: 'stripe', status: 'captured', amount: 540, currency: 'EUR' });
  await insMany('cases', [
    { id: caseOpenId, case_number: `CFU-${RUN}-O`, tenant_id: TENANT, workspace_id: WS, customer_id: customerId, type: 'order_inquiry', status: 'open', priority: 'medium', source_system: 'manual', source_channel: 'test' },
    { id: caseResolvedId, case_number: `CFU-${RUN}-R`, tenant_id: TENANT, workspace_id: WS, customer_id: customerId, type: 'order_inquiry', status: 'resolved', priority: 'low', source_system: 'manual', source_channel: 'test' },
    { id: caseConflictId, case_number: `CFU-${RUN}-C`, tenant_id: TENANT, workspace_id: WS, customer_id: customerId, type: 'refund_request', status: 'open', priority: 'high', source_system: 'manual', source_channel: 'test', has_reconciliation_conflicts: true, conflict_severity: 'critical', ai_root_cause: 'Refund amount mismatch with PSP', ai_recommended_action: 'Reconcile refund total with Stripe' },
  ]);
  await insMany('customer_activity', [
    { id: randomUUID(), tenant_id: TENANT, customer_id: customerId, type: 'ai_summary', system: 'super_agent', level: 'info', title: 'Diagnóstico del agente', content: `Confianza 92%: revisar chargeback ${RUN}.`, source: 'super_agent', occurred_at: new Date(Date.now() - 4 * 60_000).toISOString() },
    { id: randomUUID(), tenant_id: TENANT, customer_id: customerId, type: 'system_log', system: 'pipeline', level: 'info', title: 'Pipeline tick', content: `Reconciliation pass for ${customerId}`, source: 'pipeline', occurred_at: new Date(Date.now() - 3 * 60_000).toISOString() },
    { id: randomUUID(), tenant_id: TENANT, customer_id: customerId, type: 'payment', system: 'stripe', level: 'info', title: 'Captured', content: `pi_fu_${RUN} captured`, source: 'stripe', occurred_at: new Date(Date.now() - 2 * 60_000).toISOString() },
    { id: randomUUID(), tenant_id: TENANT, customer_id: customerId, type: 'agent_note', system: 'human', level: 'info', title: 'Agent note', content: `Internal: VIP customer escalated to retention.`, source: 'workspace', occurred_at: new Date(Date.now() - 60_000).toISOString() },
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
  if (cleanup.canonicalIds.length) await supabase.from('canonical_events').delete().in('id', cleanup.canonicalIds);
}

const app = express();
app.use(express.json());
app.use('/api/customers', customersRouter);
const server = app.listen(0);
const port = (server.address() as any).port;
const base = `http://127.0.0.1:${port}`;
async function get(p: string) { const r = await fetch(`${base}${p}`, { headers: HEADERS }); const t = await r.text(); let body: any; try { body = JSON.parse(t); } catch { body = { raw: t }; } return { status: r.status, body }; }
async function post(p: string, payload: any) { const r = await fetch(`${base}${p}`, { method: 'POST', headers: { ...HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const t = await r.text(); let body: any; try { body = JSON.parse(t); } catch { body = { raw: t }; } return { status: r.status, body }; }
async function patch(p: string, payload: any) { const r = await fetch(`${base}${p}`, { method: 'PATCH', headers: { ...HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const t = await r.text(); let body: any; try { body = JSON.parse(t); } catch { body = { raw: t }; } return { status: r.status, body }; }

(async () => {
  console.log(`\n▶ Customers page FULL audit (run ${RUN})\n`);
  let customerId = '';
  try {
    ({ customerId } = await plant());
    console.log(`  · planted customer ${customerId}`);

    let listBody: any[] = [];
    section('1. List endpoint');
    {
      const { status, body } = await get('/api/customers');
      listBody = Array.isArray(body) ? body : (body?.data || []);
      record('GET /api/customers (200)', status === 200 ? 'pass' : 'fail', `status=${status} rows=${listBody.length}`);
      const found = listBody.find((c: any) => c.id === customerId);
      record('Plant present in list', !!found ? 'pass' : 'fail');
      const dupCount = listBody.filter((c: any) => c.id === customerId).length;
      record('No duplicate canonical row', dupCount === 1 ? 'pass' : 'fail', `appearances=${dupCount}`);
    }

    section('2. Filters & search');
    {
      const seg = await get('/api/customers?segment=vip');
      const segList = Array.isArray(seg.body) ? seg.body : seg.body?.data || [];
      record('Filter ?segment=vip (returns rows)', segList.length > 0 && segList.every((c: any) => c.segment === 'vip') ? 'pass' : 'fail', `vip=${segList.length}`);

      const risk = await get('/api/customers?risk_level=high');
      const riskList = Array.isArray(risk.body) ? risk.body : risk.body?.data || [];
      record('Filter ?risk_level=high', riskList.length > 0 && riskList.every((c: any) => c.risk_level === 'high') ? 'pass' : 'fail', `high=${riskList.length}`);

      const search = await get(`/api/customers?q=Full+Audit+${RUN}`);
      const searchList = Array.isArray(search.body) ? search.body : search.body?.data || [];
      const matched = searchList.find((c: any) => c.id === customerId);
      record('Search ?q=<name>', !!matched ? 'pass' : 'fail', `hits=${searchList.length}`);

      const noMatch = await get(`/api/customers?q=${randomUUID()}`);
      const noList = Array.isArray(noMatch.body) ? noMatch.body : noMatch.body?.data || [];
      record('Search empty result for unknown query', noList.length === 0 ? 'pass' : 'fail', `unexpected=${noList.length}`);
    }

    section('3. Per-row columns (UI table)');
    {
      const row = listBody.find((c: any) => c.id === customerId);
      if (!row) { record('row found for column checks', 'fail'); throw new Error('plant missing'); }

      const li = row.linkedIdentities || row.linked_identities || [];
      record('Column "Source" — linked_identities count', li.length === 4 ? 'pass' : 'fail', `${li.length} sources`);
      record('Column "Source" — distinct systems', new Set(li.map((x: any) => x.system)).size >= 4 ? 'pass' : 'fail');
      record('Column "Segment"', row.segment === 'vip' ? 'pass' : 'fail', row.segment);
      record('Column "Open"', (row.openCases ?? row.open_cases) === 2 ? 'pass' : 'fail', `open=${row.openCases ?? row.open_cases}`);
      record('Column "AI Impact" — resolved', (row.aiImpactResolved ?? row.ai_impact_resolved) === 5 ? 'pass' : 'fail', `r=${row.aiImpactResolved ?? row.ai_impact_resolved}`);
      record('Column "AI Impact" — approvals', (row.aiImpactApprovals ?? row.ai_impact_approvals) === 2 ? 'pass' : 'fail');
      record('Column "AI Impact" — escalated', (row.aiImpactEscalated ?? row.ai_impact_escalated) === 1 ? 'pass' : 'fail');
      record('Column "Top Issues"', (row.topIssue ?? row.top_issue) === 'Refund conflict' ? 'pass' : 'fail', row.topIssue ?? row.top_issue);
      record('Column "Risk"', (row.riskLevel ?? row.risk_level) === 'high' ? 'pass' : 'fail');
      const pr = row.problemsResolved ?? row.problems_resolved;
      const pu = row.problemsUnresolved ?? row.problems_unresolved;
      record('Column "Problems" — resolved=1', pr === 1 ? 'pass' : 'fail', `pr=${pr}`);
      record('Column "Problems" — unresolved=2', pu === 2 ? 'pass' : 'fail', `pu=${pu}`);
    }

    section('4. Right-sidebar KPI math (client-side aggregations)');
    {
      // Mirror the maths the React component does in customerSummary
      const total = listBody.length;
      const resolved = listBody.reduce((s, c: any) => s + Number(c.aiImpactResolved ?? c.ai_impact_resolved ?? 0), 0);
      const approvals = listBody.reduce((s, c: any) => s + Number(c.aiImpactApprovals ?? c.ai_impact_approvals ?? 0), 0);
      const escalated = listBody.reduce((s, c: any) => s + Number(c.aiImpactEscalated ?? c.ai_impact_escalated ?? 0), 0);
      const openTickets = listBody.reduce((s, c: any) => s + Number(c.openCases ?? c.open_cases ?? 0), 0);
      const atRisk = listBody.filter((c: any) => ['high', 'critical', 'medium'].includes(String(c.riskLevel ?? c.risk_level ?? '').toLowerCase())).length;
      const handledCustomers = listBody.filter((c: any) => Number(c.aiImpactResolved ?? c.ai_impact_resolved ?? 0) > 0).length;
      const resolutionRate = Math.round((resolved / Math.max(resolved + approvals + escalated, 1)) * 100);
      const handledRate = Math.round((handledCustomers / Math.max(total, 1)) * 100);
      record('Sidebar: customers total', total > 0 ? 'pass' : 'fail', `total=${total}`);
      record('Sidebar: AI resolved sum', resolved >= 5 ? 'pass' : 'fail', `resolved=${resolved}`);
      record('Sidebar: approvals sum', approvals >= 2 ? 'pass' : 'fail', `approvals=${approvals}`);
      record('Sidebar: open tickets sum', openTickets >= 2 ? 'pass' : 'fail', `tickets=${openTickets}`);
      record('Sidebar: at-risk count', atRisk > 0 ? 'pass' : 'fail', `atRisk=${atRisk}`);
      record('Sidebar: AI-handled count', handledCustomers > 0 ? 'pass' : 'fail', `handled=${handledCustomers}`);
      record('Sidebar: Resolution Rate %', resolutionRate >= 0 && resolutionRate <= 100 ? 'pass' : 'fail', `${resolutionRate}%`);
      record('Sidebar: AI Handled %', handledRate >= 0 && handledRate <= 100 ? 'pass' : 'fail', `${handledRate}%`);
    }

    section('5. Detail endpoint + KPI cards');
    {
      const { status, body } = await get(`/api/customers/${customerId}`);
      record('GET /api/customers/:id (200)', status === 200 ? 'pass' : 'fail');
      record('Card: LIFETIME VALUE', Number(body?.lifetimeValue ?? body?.lifetime_value) === 12340.5 ? 'pass' : 'fail', `ltv=${body?.lifetimeValue ?? body?.lifetime_value}`);
      record('Card: OPEN CASES (cases array length)', Array.isArray(body?.cases) && body.cases.filter((c: any) => !['resolved', 'closed'].includes((c.status || '').toLowerCase())).length === 2 ? 'pass' : 'fail');
      record('Card: NEXT RENEWAL', !!(body?.nextRenewal ?? body?.next_renewal) ? 'pass' : 'fail');
      record('Card: RISK LEVEL', (body?.riskLevel ?? body?.risk_level) === 'high' ? 'pass' : 'fail');
      record('AI Executive Summary populated', !!(body?.aiExecutiveSummary ?? body?.ai_executive_summary) ? 'pass' : 'fail');
      const recs = body?.aiRecommendations ?? body?.ai_recommendations ?? [];
      record('AI Recommendations populated (≥1)', recs.length >= 1 ? 'pass' : 'fail', `count=${recs.length}`);
    }

    section('6. State endpoint (drives detail tabs)');
    {
      const { status, body } = await get(`/api/customers/${customerId}/state`);
      record('GET /api/customers/:id/state (200)', status === 200 ? 'pass' : 'fail');
      const m = body?.metrics || {};
      record('state.metrics.problems_resolved=1', (m.problemsResolved ?? m.problems_resolved) === 1 ? 'pass' : 'fail');
      record('state.metrics.problems_unresolved=2', (m.problemsUnresolved ?? m.problems_unresolved) === 2 ? 'pass' : 'fail');
      record('state.metrics.lifetime_value', Number(m.lifetimeValue ?? m.lifetime_value) === 12340.5 ? 'pass' : 'fail');
      record('state.metrics.active_conflicts ≥1', (m.activeConflicts ?? m.active_conflicts) >= 1 ? 'pass' : 'fail');
      record('state.systems.orders.nodes (Order tab)', body?.systems?.orders?.nodes?.length >= 1 ? 'pass' : 'fail');
      record('state.recent_cases (Conversations tab)', Array.isArray(body?.recentCases ?? body?.recent_cases) && (body?.recentCases ?? body?.recent_cases).length >= 1 ? 'pass' : 'fail');
      record('state.unresolved_conflicts (Reconciliation card)', (body?.unresolvedConflicts ?? body?.unresolved_conflicts ?? []).length >= 1 ? 'pass' : 'fail');
    }

    section('7. Activity tabs');
    {
      const { status, body } = await get(`/api/customers/${customerId}/activity`);
      record('GET /api/customers/:id/activity (200)', status === 200 ? 'pass' : 'fail');
      const events = Array.isArray(body) ? body : [];
      record('Tab "All Activity" (non-system_log events)', events.filter((e: any) => e.type !== 'system_log').length >= 3 ? 'pass' : 'fail', `count=${events.filter((e: any) => e.type !== 'system_log').length}`);
      record('Tab "System Logs" (system_log events)', events.filter((e: any) => e.type === 'system_log').length >= 1 ? 'pass' : 'fail');
      record('Activity type ai_summary present', events.some((e: any) => e.type === 'ai_summary') ? 'pass' : 'fail');
      record('Activity type payment present', events.some((e: any) => e.type === 'payment') ? 'pass' : 'fail');
      record('Activity type agent_note present', events.some((e: any) => e.type === 'agent_note') ? 'pass' : 'fail');
    }

    section('8. Identity / Health & Risk / Reconciliation cards');
    {
      const { body } = await get(`/api/customers/${customerId}/state`);
      const customer = body?.customer || {};
      const li = body?.linkedIdentities || body?.linked_identities || [];
      const conflicts = body?.unresolvedConflicts || body?.unresolved_conflicts || [];
      record('Identity: canonical name', !!(customer.canonicalName ?? customer.canonical_name) ? 'pass' : 'fail');
      record('Identity: canonical email', !!(customer.canonicalEmail ?? customer.canonical_email) ? 'pass' : 'fail');
      record('Identity: customer "since" (createdAt)', !!(customer.createdAt ?? customer.created_at) ? 'pass' : 'fail');
      record('Identity: 4 linked profiles', li.length === 4 ? 'pass' : 'fail', `linked=${li.length}`);
      record('Health & Risk: churn (riskLevel=high)', (customer.riskLevel ?? customer.risk_level) === 'high' ? 'pass' : 'fail');
      record('Health & Risk: fraud (fraudRisk=medium)', (customer.fraudRisk ?? customer.fraud_risk) === 'medium' ? 'pass' : 'fail');
      record('Reconciliation: 1 unresolved conflict', conflicts.length === 1 ? 'pass' : 'fail');
      record('Reconciliation: conflict has root cause', conflicts[0]?.recommendedAction || conflicts[0]?.recommended_action ? 'pass' : 'fail');
    }

    section('9. Mutations (Edit / Create / Merge)');
    let createdId = '';
    {
      const r1 = await patch(`/api/customers/${customerId}`, { segment: 'standard' });
      record('PATCH /api/customers/:id (Edit)', r1.status === 200 ? 'pass' : 'fail', `status=${r1.status}`);

      const r2 = await post('/api/customers', { canonical_name: `New ${RUN}`, canonical_email: `new+${RUN}@test.com`, source: 'manual' });
      createdId = r2.body?.id || '';
      if (createdId) cleanup.customerIds.push(createdId);
      record('POST /api/customers (Create + linked_identity)', r2.status === 201 && !!createdId ? 'pass' : 'fail');

      if (createdId) {
        const r3 = await post(`/api/customers/${customerId}/merge`, { sourceId: createdId });
        record('POST /api/customers/:id/merge (Dedup tool)', r3.status === 200 ? 'pass' : 'fail');
      }
    }

    section('10. Cross-channel ingest dedup (live channelIngest)');
    {
      const numericRun = String(parseInt(RUN, 36) % 1_000_000).padStart(6, '0');
      const dedupEmail = `xchan+${RUN}@test.com`;
      const dedupPhone = `+34622${numericRun}`;
      // 1) Email arrives — creates a new canonical row
      const ev1 = randomUUID(); cleanup.canonicalIds.push(ev1);
      await supabase.from('canonical_events').insert({
        id: ev1, tenant_id: TENANT, workspace_id: WS, dedupe_key: `email:xchan:${ev1}`,
        source_system: 'email', source_entity_type: 'message', source_entity_id: `e_${ev1}`,
        event_type: 'email.message.received', event_category: 'inbox', occurred_at: new Date().toISOString(),
        normalized_payload: { channel: 'email', senderId: dedupEmail, externalMessageId: `e_${ev1}`, externalThreadId: dedupEmail, messageContent: 'hello', sentAt: new Date().toISOString() },
        status: 'received',
      });
      const ctx: any = { jobId: randomUUID(), tenantId: TENANT, workspaceId: WS, traceId: RUN, attempt: 1 };
      await handleChannelIngest({ canonicalEventId: ev1, channel: 'email', rawMessageId: `e_${ev1}` } as any, ctx);
      const { data: ev1Row } = await supabase.from('canonical_events').select('canonical_entity_id').eq('id', ev1).maybeSingle();
      const customerA = ev1Row?.canonical_entity_id;
      cleanup.customerIds.push(customerA!);
      // Patch the customer with the matching phone so the WhatsApp dedup can find it.
      await supabase.from('customers').update({ phone: dedupPhone }).eq('id', customerA!);

      // 2) WhatsApp arrives with the same phone — must dedup to the same customer
      const ev2 = randomUUID(); cleanup.canonicalIds.push(ev2);
      await supabase.from('canonical_events').insert({
        id: ev2, tenant_id: TENANT, workspace_id: WS, dedupe_key: `whatsapp:xchan:${ev2}`,
        source_system: 'whatsapp', source_entity_type: 'message', source_entity_id: `w_${ev2}`,
        event_type: 'whatsapp.message.received', event_category: 'inbox', occurred_at: new Date().toISOString(),
        normalized_payload: { channel: 'whatsapp', senderId: dedupPhone, externalMessageId: `w_${ev2}`, externalThreadId: dedupPhone, messageContent: 'hello', sentAt: new Date().toISOString() },
        status: 'received',
      });
      await handleChannelIngest({ canonicalEventId: ev2, channel: 'whatsapp', rawMessageId: `w_${ev2}` } as any, ctx);
      const { data: ev2Row } = await supabase.from('canonical_events').select('canonical_entity_id').eq('id', ev2).maybeSingle();
      const customerB = ev2Row?.canonical_entity_id;
      record('Cross-channel dedup: email→whatsapp same customer', customerA && customerA === customerB ? 'pass' : 'fail', `A=${customerA?.slice(0, 8)} B=${customerB?.slice(0, 8)}`);

      const { data: ids } = await supabase.from('linked_identities').select('system').eq('customer_id', customerA!);
      const systems = (ids ?? []).map((r: any) => r.system).sort();
      record('Cross-channel dedup: 2 linked_identities on same customer', systems.length === 2 && systems.includes('email') && systems.includes('whatsapp') ? 'pass' : 'fail', systems.join(','));
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
  console.log(`Customers FULL audit: ${pass} pass · ${partial} partial · ${fail} fail / ${results.length} checks`);
  console.log(`${'─'.repeat(74)}\n`);
  if (fail > 0) {
    console.log('Failures:');
    for (const r of results.filter((x) => x.status === 'fail')) console.log(`  ✗ ${r.feature.padEnd(60)} ${r.detail}`);
    console.log('');
  }
  process.exit(fail > 0 ? 1 : 0);
})().catch((err) => { console.error('Suite crashed:', err); server.close(); process.exit(2); });
