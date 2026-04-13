/**
 * server/pipeline/reconcilerScheduled.ts
 *
 * Scheduled reconciliation sweep — Phase 3.
 *
 * Handles RECONCILE_SCHEDULED jobs that are triggered periodically (e.g. every
 * 15 minutes via a cron-like mechanism or a manual enqueue at startup).
 *
 * For each open case that hasn't been reconciled in the last hour, it enqueues
 * a RECONCILE_CASE job. This catches cases that may have been missed due to
 * transient failures or were created before the reconciler was running.
 */

import { createCaseRepository } from '../data/cases.js';
import { enqueue }         from '../queue/client.js';
import { JobType }         from '../queue/types.js';
import { registerHandler } from '../queue/handlers/index.js';
import { logger }          from '../utils/logger.js';
import type { ReconcileScheduledPayload, JobContext } from '../queue/types.js';

const DEFAULT_SWEEP_LIMIT  = 50;
const STALE_THRESHOLD_MINS = 60;

async function handleReconcileScheduled(
  payload: ReconcileScheduledPayload,
  ctx: JobContext
): Promise<void> {
  const log = logger.child({ jobId: ctx.jobId, traceId: ctx.traceId });
  const caseRepo = createCaseRepository();
  const limit = payload.limit ?? DEFAULT_SWEEP_LIMIT;
  const tenantId    = ctx.tenantId    ?? 'org_default';
  const workspaceId = ctx.workspaceId ?? 'ws_default';
  const scope = { tenantId, workspaceId };

  // Find open cases that either:
  //  a) have no reconciliation issues yet (never reconciled), or
  //  b) were last updated more than STALE_THRESHOLD_MINS ago
  const staleCases = await caseRepo.findStaleCases(scope, limit, STALE_THRESHOLD_MINS);

  if (staleCases.length === 0) {
    log.debug('Scheduled reconciliation: no stale cases found');
    return;
  }

  log.info('Scheduled reconciliation sweep', { casesFound: staleCases.length, limit });

  for (const c of staleCases) {
    enqueue(
      JobType.RECONCILE_CASE,
      { caseId: c.id },
      { tenantId: c.tenant_id, workspaceId, traceId: ctx.traceId, priority: 8 },
    );
  }

  log.info('Reconciliation jobs enqueued', { count: staleCases.length });
}

// ── Register ──────────────────────────────────────────────────────────────────

registerHandler(JobType.RECONCILE_SCHEDULED, handleReconcileScheduled);

export { handleReconcileScheduled };
