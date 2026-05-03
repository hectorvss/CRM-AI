/**
 * server/pipeline/reconcilerScheduled.ts
 *
 * Scheduled reconciliation sweep — Phase 3.
 *
 * Idempotent handler for `RECONCILE_SCHEDULED` jobs. Scans open cases that
 * have not been reconciled recently and enqueues a `RECONCILE_CASE` job per
 * case. Skips cases that already have a pending or running reconciliation
 * job in the queue, so re-running the sweep multiple times in the same
 * minute is a no-op.
 */

import { createCaseRepository } from '../data/index.js';
import { enqueue }         from '../queue/client.js';
import { JobType }         from '../queue/types.js';
import { registerHandler } from '../queue/handlers/index.js';
import { logger }          from '../utils/logger.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import type { ReconcileScheduledPayload, JobContext } from '../queue/types.js';

const DEFAULT_SWEEP_LIMIT  = 50;
const STALE_THRESHOLD_MINS = 60;

const caseRepo = createCaseRepository();

/**
 * Looks up the set of caseIds that already have a pending or running
 * RECONCILE_CASE job for the given tenant. Used to make this handler
 * idempotent — we never enqueue a duplicate reconciliation for a case
 * whose previous job has not yet completed.
 */
async function findInFlightCaseIds(tenantId: string, candidateIds: string[]): Promise<Set<string>> {
  if (candidateIds.length === 0) return new Set();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('jobs')
    .select('payload, status')
    .eq('type', JobType.RECONCILE_CASE)
    .eq('tenant_id', tenantId)
    .in('status', ['pending', 'running']);

  if (error) {
    // Don't fail the sweep on observability lookup; log and continue.
    logger.warn('In-flight reconciliation lookup failed; falling back to enqueue without dedup', { error: String(error.message ?? error) });
    return new Set();
  }

  const candidateSet = new Set(candidateIds);
  const inFlight = new Set<string>();
  for (const row of data ?? []) {
    const payload = typeof (row as any).payload === 'string'
      ? safeJsonParse((row as any).payload)
      : (row as any).payload;
    const cid = payload?.caseId;
    if (cid && candidateSet.has(cid)) inFlight.add(cid);
  }
  return inFlight;
}

function safeJsonParse(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}

async function handleReconcileScheduled(
  payload: ReconcileScheduledPayload,
  ctx: JobContext
): Promise<void> {
  const log = logger.child({ jobId: ctx.jobId, traceId: ctx.traceId });
  const limit = payload.limit ?? DEFAULT_SWEEP_LIMIT;
  const tenantId    = ctx.tenantId    ?? 'org_default';
  const workspaceId = ctx.workspaceId ?? 'ws_default';
  const scope = { tenantId, workspaceId };

  // Find open cases that are stale
  const staleCases = await caseRepo.findStaleCases(scope, limit, STALE_THRESHOLD_MINS);

  if (staleCases.length === 0) {
    log.debug('Scheduled reconciliation: no stale cases found');
    return;
  }

  // Idempotency: drop any case that already has an in-flight RECONCILE_CASE job.
  const candidateIds = staleCases.map((c: any) => c.id).filter(Boolean);
  const inFlight = await findInFlightCaseIds(tenantId, candidateIds);
  const toEnqueue = staleCases.filter((c: any) => !inFlight.has(c.id));

  log.info('Scheduled reconciliation sweep', {
    casesFound: staleCases.length,
    limit,
    skippedInFlight: staleCases.length - toEnqueue.length,
  });

  for (const c of toEnqueue) {
    await enqueue(
      JobType.RECONCILE_CASE,
      { caseId: c.id },
      { tenantId: c.tenant_id ?? tenantId, workspaceId, traceId: ctx.traceId, priority: 8 },
    );
  }

  log.info('Reconciliation jobs enqueued', { count: toEnqueue.length });
}

// ── Register ──────────────────────────────────────────────────────────────────

registerHandler(JobType.RECONCILE_SCHEDULED, handleReconcileScheduled);

export { handleReconcileScheduled };
