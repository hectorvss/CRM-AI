/**
 * server/queue/scheduledJobs.ts
 *
 * Startup-time recurring job scheduler.
 *
 * Uses setInterval to periodically enqueue maintenance jobs. This is intentionally
 * simple (no cron library, no Redis) — the queue worker's idempotency and dedup
 * logic ensure that overlapping intervals don't cause duplicate processing.
 *
 * Scheduled tasks:
 *  - SLA_CHECK every 5 minutes — sweeps all open cases for deadline breaches
 *  - RECONCILE_SCHEDULED every 15 minutes — catches stale unreconciled cases
 *
 * The intervals are only started after the queue worker is running.
 */

import { enqueueDelayed } from './client.js';
import { JobType }        from './types.js';
import { logger }         from '../utils/logger.js';
import { requireScope }    from '../lib/scope.js';

let slaIntervalId:     ReturnType<typeof setInterval> | null = null;
let reconcileIntervalId: ReturnType<typeof setInterval> | null = null;

const SLA_INTERVAL_MS        = 5  * 60 * 1_000;   // 5 minutes
const RECONCILE_INTERVAL_MS  = 15 * 60 * 1_000;   // 15 minutes

export function startScheduledJobs(): void {
  logger.info('Starting scheduled job intervals', {
    slaIntervalMin:       SLA_INTERVAL_MS / 60_000,
    reconcileIntervalMin: RECONCILE_INTERVAL_MS / 60_000,
  });

  const scope = bootstrapScope();
  if (!scope) {
    logger.info('Skipping scheduled job bootstrap because DEFAULT_TENANT_ID/DEFAULT_WORKSPACE_ID are not set');
    return;
  }

  // Fire once shortly after startup (give the worker a few seconds to be fully up)
  enqueueDelayed(JobType.SLA_CHECK,           {}, 10_000, { tenantId: scope.tenantId, workspaceId: scope.workspaceId, priority: 9 });
  enqueueDelayed(JobType.RECONCILE_SCHEDULED, {}, 30_000, { tenantId: scope.tenantId, workspaceId: scope.workspaceId, priority: 9 });

  slaIntervalId = setInterval(() => {
    enqueueDelayed(JobType.SLA_CHECK, {}, 0, { tenantId: scope.tenantId, workspaceId: scope.workspaceId, priority: 9 });
  }, SLA_INTERVAL_MS);

  reconcileIntervalId = setInterval(() => {
    enqueueDelayed(JobType.RECONCILE_SCHEDULED, {}, 0, { tenantId: scope.tenantId, workspaceId: scope.workspaceId, priority: 9 });
  }, RECONCILE_INTERVAL_MS);
}

function bootstrapScope() {
  const tenantId = process.env.DEFAULT_TENANT_ID ?? null;
  const workspaceId = process.env.DEFAULT_WORKSPACE_ID ?? null;
  if (!tenantId || !workspaceId) return null;
  return requireScope({ tenantId, workspaceId }, 'scheduledJobs');
}

export function stopScheduledJobs(): void {
  if (slaIntervalId)       clearInterval(slaIntervalId);
  if (reconcileIntervalId) clearInterval(reconcileIntervalId);
  slaIntervalId       = null;
  reconcileIntervalId = null;
  logger.info('Scheduled job intervals stopped');
}
