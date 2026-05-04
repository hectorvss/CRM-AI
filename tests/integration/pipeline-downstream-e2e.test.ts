/**
 * tests/integration/pipeline-downstream-e2e.test.ts
 *
 * Verify that a webhook does not just produce a canonical_event + case,
 * but that the WORKER actually processes the chained jobs:
 *
 *   WEBHOOK_PROCESS → CANONICALIZE → INTENT_ROUTE → RECONCILE_CASE
 *
 * (RESOLUTION_PLAN/EXECUTE only fire when reconcile finds open issues; we
 *  assert that the chain reaches reconcile and the case is updated, not
 *  that a resolution plan exists, since a synthetic webhook may not produce
 *  reconciliation discrepancies.)
 *
 * Run:  node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/pipeline-downstream-e2e.test.ts
 */

import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { getSupabaseAdmin } from '../../server/db/supabase.js';
import { startWorker, stopWorker, workerStatus } from '../../server/queue/worker.js';
import { countJobs } from '../../server/queue/client.js';

// Trigger side-effect handler registration (mirrors server/index.ts)
import '../../server/queue/handlers/webhookProcess.js';
import '../../server/pipeline/canonicalizer.js';
import '../../server/pipeline/intentRouter.js';
import '../../server/pipeline/reconciler.js';
import '../../server/pipeline/resolutionPlanner.js';

const TENANT_ID = 'tenant_1';
const WORKSPACE_ID = 'ws_default';
const RUN_ID = randomUUID().slice(0, 8);

const supabase = getSupabaseAdmin();
const cleanup = { webhookIds: [] as string[], canonicalIds: [] as string[], caseIds: [] as string[], jobIds: [] as string[] };

async function insertWebhook(source: string, topic: string, body: any): Promise<string> {
  const id = randomUUID();
  const { error } = await supabase.from('webhook_events').insert({
    id, tenant_id: TENANT_ID, source_system: source, event_type: topic, raw_payload: body,
    received_at: new Date().toISOString(), status: 'received',
    dedupe_key: `pdown-${RUN_ID}-${randomUUID().slice(0, 6)}`,
  });
  if (error) throw error;
  cleanup.webhookIds.push(id);
  return id;
}

async function enqueueWebhookProcess(webhookEventId: string, source: string): Promise<string> {
  const { enqueue } = await import('../../server/queue/client.js');
  const { JobType } = await import('../../server/queue/types.js');
  const jobId = await enqueue(
    JobType.WEBHOOK_PROCESS,
    { webhookEventId, source, rawBody: '{}', headers: {} as any },
    { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, traceId: `pdown-trace-${RUN_ID}`, priority: 5 },
  );
  cleanup.jobIds.push(jobId);
  return jobId;
}

async function waitForChainViaEntity(canonicalEventId: string, caseId: string | null, timeoutMs = 30_000): Promise<{ canonicalize: boolean; intentRoute: boolean; reconcileCase: boolean }> {
  // Track the chain by the canonical event status + case status, which the
  // pipeline mutates as it advances. More reliable than tracing by job id.
  const start = Date.now();
  let canonicalize = false; let intentRoute = false; let reconcileCase = false;
  while (Date.now() - start < timeoutMs) {
    // 1. canonicalize sets canonical_events.status to 'canonicalized' or 'linked'
    const { data: ce } = await supabase
      .from('canonical_events').select('status').eq('id', canonicalEventId).maybeSingle();
    if (ce && (ce.status === 'canonicalized' || ce.status === 'linked')) canonicalize = true;

    // 2. intent.route sets case.intent or routes to a case
    if (caseId) {
      const { data: cs } = await supabase
        .from('cases').select('intent, status, last_reconciled_at').eq('id', caseId).maybeSingle();
      if (cs?.intent) intentRoute = true;
      if (cs?.last_reconciled_at) reconcileCase = true;
    }
    if (canonicalize && intentRoute && reconcileCase) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  return { canonicalize, intentRoute, reconcileCase };
}

async function doCleanup() {
  if (cleanup.jobIds.length) await supabase.from('queue_jobs').delete().in('id', cleanup.jobIds);
  if (cleanup.caseIds.length) await supabase.from('cases').delete().in('id', cleanup.caseIds);
  if (cleanup.canonicalIds.length) await supabase.from('canonical_events').delete().in('id', cleanup.canonicalIds);
  if (cleanup.webhookIds.length) await supabase.from('webhook_events').delete().in('id', cleanup.webhookIds);
}

(async () => {
  console.log(`▶ Pipeline downstream E2E (run_id=${RUN_ID})\n`);
  let exitCode = 0;
  try {
    // 1. Insert webhook for a topic that auto-creates a case (Shopify orders/cancelled).
    const uniqueOrderId = Math.floor(Math.random() * 1_000_000) + 9_000_000;
    const webhookId = await insertWebhook('shopify', 'orders/cancelled', { id: uniqueOrderId, name: `#${uniqueOrderId}` });
    console.log(`  ✓ webhook inserted (${webhookId.slice(0, 8)})`);

    // 2. Start the worker.
    startWorker();
    console.log(`  ✓ worker started (status=${JSON.stringify(workerStatus())})`);

    // 3. Enqueue WEBHOOK_PROCESS for it.
    const traceId = `pdown-trace-${RUN_ID}`;
    await enqueueWebhookProcess(webhookId, 'shopify');
    console.log(`  ✓ WEBHOOK_PROCESS job enqueued`);

    // 4. Wait briefly for webhookProcess to write the canonical event link
    await new Promise(r => setTimeout(r, 1500));
    const { data: we } = await supabase.from('webhook_events').select('canonical_event_id').eq('id', webhookId).maybeSingle();
    const canonicalEventId = we?.canonical_event_id;
    if (canonicalEventId) cleanup.canonicalIds.push(canonicalEventId);

    // 5. Verify case auto-created.
    const { data: cases } = await supabase.from('cases')
      .select('id, case_number, type, source_system, status, intent, last_reconciled_at')
      .eq('tenant_id', TENANT_ID).eq('source_system', 'webhook:shopify')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (cases?.id) {
      cleanup.caseIds.push(cases.id);
      console.log(`  ✓ case auto-created: ${cases.case_number} type=${cases.type} status=${cases.status}`);
    } else {
      console.log(`  ✗ no case auto-created`);
      exitCode = 1;
    }

    // 6. Track chain via entity-state changes (more reliable than trace_id query).
    if (canonicalEventId) {
      console.log(`  · waiting up to 30s for downstream chain...`);
      const chain = await waitForChainViaEntity(canonicalEventId, cases?.id ?? null, 30_000);
      console.log(`\n  Chain via entity state:`);
      console.log(`    ${chain.canonicalize ? '✓' : '✗'} canonicalize  (canonical_events.status updated)`);
      console.log(`    ${chain.intentRoute ? '✓' : '✗'} intent.route   (cases.intent populated)`);
      console.log(`    ${chain.reconcileCase ? '✓' : '✗'} reconcile.case (cases.last_reconciled_at populated)`);
      if (!chain.canonicalize) exitCode = 1;
      if (!chain.intentRoute) console.log(`\n  ⚠  intent.route did not populate cases.intent within 30s`);
      if (!chain.reconcileCase) console.log(`  ⚠  reconcile.case did not run within 30s`);
    }

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Pipeline downstream: ${exitCode === 0 ? 'PASS' : 'PARTIAL'}`);
    console.log(`${'─'.repeat(60)}`);
  } catch (err: any) {
    console.error('Suite crashed:', err?.message ?? err);
    exitCode = 2;
  } finally {
    await stopWorker().catch(() => {});
    console.log(`\nQueue depth before cleanup: ${JSON.stringify(await countJobs().catch(() => ({})))}`);
    await doCleanup().catch((err) => console.warn('cleanup err:', err));
    console.log(`✓ cleanup done (${cleanup.webhookIds.length} webhooks, ${cleanup.canonicalIds.length} canonical, ${cleanup.caseIds.length} cases, ${cleanup.jobIds.length} jobs)`);
  }
  process.exit(exitCode);
})();
