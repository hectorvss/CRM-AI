/**
 * server/pipeline/reconcilerScheduled.ts
 *
 * Scheduled reconciliation sweep — Phase 3.
 *
 * Refactored to use repository pattern (provider-agnostic).
 */

import { createCaseRepository } from '../data/index.js';
import { enqueue }         from '../queue/client.js';
import { JobType }         from '../queue/types.js';
import { registerHandler } from '../queue/handlers/index.js';
import { logger }          from '../utils/logger.js';
import type { ReconcileScheduledPayload, JobContext } from '../queue/types.js';

const DEFAULT_SWEEP_LIMIT  = 50;
const STALE_THRESHOLD_MINS = 60;

const caseRepo = createCaseRepository();

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

  log.info('Scheduled reconciliation sweep', { casesFound: staleCases.length, limit });

  for (const c of staleCases) {
    await enqueue(
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
