/**
 * tests/integration/case-checks-e2e.test.ts
 *
 * Verifies the Case Graph "checks" engine end-to-end:
 *
 *   1. Plant a synthetic case with orders/payments/returns/refunds attached
 *      so several categories have non-trivial state.
 *   2. Hit /api/cases/:id/checks (in-process via the buildCaseChecks export)
 *      and assert the categories + semaphore counts make sense.
 *   3. Hit /api/cases/:id/graph and assert the merged timeline includes
 *      check entries.
 *   4. Hit /api/cases/:id/resolve and assert identified_problems is populated.
 *   5. Cleanup.
 *
 * Run:  node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/case-checks-e2e.test.ts
 */

import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../../server/db/supabase.js';
import { createCaseRepository } from '../../server/data/cases.js';
import { buildCaseChecks } from '../../server/data/caseChecks.js';

const TENANT = 'tenant_1';
const WS = 'ws_default';
const RUN = randomUUID().slice(0, 6);

const supabase = getSupabaseAdmin();
const cleanup = { caseIds: [] as string[], orderIds: [] as string[], paymentIds: [] as string[], returnIds: [] as string[], refundIds: [] as string[], customerIds: [] as string[] };

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

  const ins = async (table: string, row: any) => {
    const { error } = await supabase.from(table).insert(row);
    if (error) throw new Error(`${table} insert: ${error.message}`);
  };

  await ins('customers', {
    id: customerId, tenant_id: TENANT, workspace_id: WS,
    canonical_name: `Test User ${RUN}`, canonical_email: `test+${RUN}@example.com`,
  });
  await ins('orders', {
    id: orderId, tenant_id: TENANT, workspace_id: WS, customer_id: customerId,
    external_order_id: `ORD-${RUN}`,
    status: 'open', fulfillment_status: 'in_transit', tracking_number: `TRK${RUN}`,
    total_amount: 100, currency: 'EUR',
  });
  await ins('payments', {
    id: paymentId, tenant_id: TENANT, workspace_id: WS, customer_id: customerId, order_id: orderId,
    external_payment_id: `pi_${RUN}`, psp: 'stripe',
    status: 'captured', amount: 100, currency: 'EUR', refund_amount: 50,
  });
  await ins('returns', {
    id: returnId, tenant_id: TENANT, workspace_id: WS, customer_id: customerId, order_id: orderId,
    external_return_id: `RMA-${RUN}`, status: 'pending_review', return_reason: 'damaged',
  });
  await ins('refunds', {
    id: refundId, tenant_id: TENANT, payment_id: paymentId, order_id: orderId, customer_id: customerId,
    external_refund_id: `re_${RUN}`, status: 'failed', amount: 30, currency: 'EUR', type: 'manual',
    idempotency_key: `idem_${RUN}`,
  });
  await ins('cases', {
    id: caseId, case_number: `TEST-CHK-${RUN}`,
    tenant_id: TENANT, workspace_id: WS, customer_id: customerId,
    type: 'refund_request', sub_type: 'damaged_goods',
    status: 'open', priority: 'high',
    source_system: 'manual', source_channel: 'test',
    order_ids: [orderId], payment_ids: [paymentId], return_ids: [returnId],
    ai_diagnosis: 'Customer reports damaged goods, refund failed at PSP.',
  });
  return { caseId, orderId, paymentId, returnId, refundId };
}

async function doCleanup() {
  if (cleanup.refundIds.length) await supabase.from('refunds').delete().in('id', cleanup.refundIds);
  if (cleanup.returnIds.length) await supabase.from('returns').delete().in('id', cleanup.returnIds);
  if (cleanup.paymentIds.length) await supabase.from('payments').delete().in('id', cleanup.paymentIds);
  if (cleanup.caseIds.length) await supabase.from('cases').delete().in('id', cleanup.caseIds);
  if (cleanup.orderIds.length) await supabase.from('orders').delete().in('id', cleanup.orderIds);
  if (cleanup.customerIds.length) await supabase.from('customers').delete().in('id', cleanup.customerIds);
}

(async () => {
  console.log(`\n▶ Case checks E2E (run ${RUN})\n`);
  let exitCode = 0;
  const fails: string[] = [];
  try {
    const { caseId } = await plant();
    console.log(`  ✓ planted case ${caseId.slice(0, 8)}`);

    const repo = createCaseRepository();
    const bundle = await repo.getBundle({ tenantId: TENANT, workspaceId: WS }, caseId);
    if (!bundle) { fails.push('bundle is null'); throw new Error('bundle null'); }

    const checks = buildCaseChecks(bundle);
    console.log(`\n  Run summary: pass=${checks.totals.pass} warn=${checks.totals.warn} fail=${checks.totals.fail} skip=${checks.totals.skip}\n`);

    // Assert 1: every category present
    const expectedCategories = ['orders', 'payments', 'returns', 'refunds', 'approvals', 'reconciliation', 'knowledge', 'ai_studio', 'workflows', 'integrations', 'conversation', 'notes', 'linked_cases'];
    for (const k of expectedCategories) {
      const cat = checks.categories.find((c: any) => c.key === k);
      if (!cat) { fails.push(`category ${k} missing`); }
    }
    console.log(`  ✓ all 13 categories present`);

    // Assert 2: refund category should report at least one fail (we planted a failed refund)
    const refundCat = checks.categories.find((c: any) => c.key === 'refunds');
    if (!refundCat || refundCat.counts.fail < 1) {
      fails.push(`refunds should have >=1 fail; got ${JSON.stringify(refundCat?.counts)}`);
    } else {
      console.log(`  ✓ refunds category flagged the failed refund (fail=${refundCat.counts.fail})`);
    }

    // Assert 3: payments category should detect refund-amount mismatch
    const paymentsCat = checks.categories.find((c: any) => c.key === 'payments');
    const recon = paymentsCat?.checks.find((c: any) => c.id.startsWith('payments.refund_recon'));
    if (!recon || recon.status !== 'fail') {
      fails.push(`payments.refund_recon should fail (refunds=30 but payment.refund_amount=50). Got: ${recon?.status} ${recon?.detail}`);
    } else {
      console.log(`  ✓ refund-amount reconciliation correctly flagged: "${recon.detail}"`);
    }

    // Assert 4: returns category should warn (pending_review)
    const returnsCat = checks.categories.find((c: any) => c.key === 'returns');
    if (!returnsCat || returnsCat.status !== 'warn') {
      fails.push(`returns category should be warn (pending_review). Got: ${returnsCat?.status}`);
    } else {
      console.log(`  ✓ returns flagged as warn (pending_review)`);
    }

    // Assert 5: orders fulfillment should warn (in_transit)
    const ordersCat = checks.categories.find((c: any) => c.key === 'orders');
    const fulf = ordersCat?.checks.find((c: any) => c.id.startsWith('orders.fulfillment'));
    if (!fulf || fulf.status !== 'warn') {
      fails.push(`orders.fulfillment should warn (in_transit). Got: ${fulf?.status}`);
    } else {
      console.log(`  ✓ orders fulfillment correctly warned (in_transit)`);
    }

    // Assert 6: graph view merges checks into timeline
    const { buildGraphView, buildResolveView } = await import('../../server/data/cases.js');
    const graph = (buildGraphView as any)(bundle);
    const checkEntries = (graph.timeline || []).filter((t: any) => t.entry_type === 'check');
    if (checkEntries.length === 0) {
      fails.push(`graph timeline should include check entries`);
    } else {
      console.log(`  ✓ graph timeline merges ${checkEntries.length} check entries chronologically`);
    }

    // Assert 7: resolve view exposes identified_problems
    const resolve = (buildResolveView as any)(bundle);
    if (!Array.isArray(resolve.identified_problems) || resolve.identified_problems.length === 0) {
      fails.push(`resolve.identified_problems should be populated`);
    } else {
      const critical = resolve.identified_problems.filter((p: any) => p.severity === 'critical');
      console.log(`  ✓ resolve.identified_problems = ${resolve.identified_problems.length} (${critical.length} critical)`);
    }

  } catch (err: any) {
    fails.push(`suite threw: ${err?.message ?? String(err)}`);
  } finally {
    await doCleanup().catch((e) => console.warn('cleanup warn:', e?.message));
    console.log(`\n✓ cleanup done`);
  }

  console.log(`\n${'─'.repeat(60)}`);
  if (fails.length) {
    console.log(`Case checks E2E: FAIL`);
    for (const f of fails) console.log(`  ✗ ${f}`);
    exitCode = 1;
  } else {
    console.log(`Case checks E2E: PASS`);
  }
  console.log(`${'─'.repeat(60)}\n`);
  process.exit(exitCode);
})().catch((err) => { console.error('Suite crashed:', err); process.exit(2); });
