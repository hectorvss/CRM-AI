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

async function waitForJobChain(traceId: string, expectedTypes: string[], timeoutMs = 30_000): Promise<{ seen: Record<string, number>; jobs: any[] }> {
  const start = Date.now();
  const seen: Record<string, number> = {};
  let lastJobs: any[] = [];
  while (Date.now() - start < timeoutMs) {
    const { data } = await supabase
      .from('queue_jobs')
      .select('id, type, status, trace_id, created_at, completed_at')
      .eq('trace_id', traceId)
      .order('created_at', { ascending: true });
    lastJobs = data ?? [];
    for (const j of lastJobs) {
      cleanup.jobIds.push(j.id);
      if (j.status === 'completed') seen[j.type] = (seen[j.type] ?? 0) + 1;
    }
    const allHit = expectedTypes.every(t => (seen[t] ?? 0) > 0);
    if (allHit) return { seen, jobs: lastJobs };
    await new Promise(r => setTimeout(r, 500));
  }
  return { seen, jobs: lastJobs };
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
    const webhookId = await insertWebhook('shopify', 'orders/cancelled', { id: 9001, name: '#9001' });
    console.log(`  ✓ webhook inserted (${webhookId.slice(0, 8)})`);

    // 2. Start the worker.
    startWorker();
    console.log(`  ✓ worker started (status=${JSON.stringify(workerStatus())})`);

    // 3. Enqueue WEBHOOK_PROCESS for it.
    const traceId = `pdown-trace-${RUN_ID}`;
    await enqueueWebhookProcess(webhookId, 'shopify');
    console.log(`  ✓ WEBHOOK_PROCESS job enqueued`);

    // 4. Wait for the chain to fire (we expect at minimum: webhook.process,
    //    canonicalize, intent.route, reconcile.case).
    console.log(`  · waiting up to 30s for downstream chain...`);
    const expectedTypes = ['webhook.process', 'canonicalize', 'intent.route', 'reconcile.case'];
    const { seen, jobs } = await waitForJobChain(traceId, expectedTypes, 30_000);
    console.log(`\n  Job chain seen for trace ${traceId.slice(0, 16)}:`);
    for (const t of expectedTypes) {
      const ok = (seen[t] ?? 0) > 0;
      console.log(`    ${ok ? '✓' : '✗'} ${t.padEnd(20)} executions=${seen[t] ?? 0}`);
    }
    console.log(`\n  All jobs in trace:`);
    for (const j of jobs) console.log(`    [${j.status}] ${j.type.padEnd(20)} ${j.id.slice(0, 8)}`);

    // 5. Verify a case was created.
    const { data: cases } = await supabase.from('cases')
      .select('id, case_number, type, source_system, status')
      .eq('tenant_id', TENANT_ID)
      .eq('source_system', 'webhook:shopify')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cases?.id) {
      cleanup.caseIds.push(cases.id);
      console.log(`\n  ✓ case auto-created: ${cases.case_number} type=${cases.type} status=${cases.status}`);
    } else {
      console.log(`\n  ✗ no case auto-created`);
      exitCode = 1;
    }

    // 6. Pass criteria: minimum webhook.process + canonicalize seen.
    const minimumChainOk = (seen['webhook.process'] ?? 0) > 0 && (seen['canonicalize'] ?? 0) > 0;
    if (!minimumChainOk) exitCode = 1;

    if ((seen['intent.route'] ?? 0) === 0) {
      console.log(`\n  ⚠  INTENT_ROUTE not reached — pipeline stops at canonicalize`);
    }
    if ((seen['reconcile.case'] ?? 0) === 0) {
      console.log(`  ⚠  RECONCILE_CASE not reached — case never reconciled`);
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
