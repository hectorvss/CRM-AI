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
import { getSupabaseAdmin } from '../db/supabase.js';
import { createAuditRepository } from '../data/index.js';
import { createSuperAgentOpsRepository } from '../data/superAgentOps.js';
import { fireWorkflowEvent, recoverPendingEvents, pruneEventLog } from '../lib/workflowEventBus.js';
import { pruneExpiredSessions } from '../agents/planEngine/sessionRepository.js';
import { continueWorkflowRun } from '../routes/workflows.js';
import { startAuditExportSweeper, stopAuditExportSweeper } from '../jobs/auditExport.js';
import { startFlexibleUsageReporter, stopFlexibleUsageReporter } from '../jobs/flexibleUsageReport.js';
import { startAiCreditsReset, stopAiCreditsReset } from '../jobs/aiCreditsReset.js';

let slaIntervalId:              ReturnType<typeof setInterval> | null = null;
let reconcileIntervalId:        ReturnType<typeof setInterval> | null = null;
let workflowDelayIntervalId:    ReturnType<typeof setInterval> | null = null;
let scheduleSweeperIntervalId:  ReturnType<typeof setInterval> | null = null;
let superAgentScheduleIntervalId: ReturnType<typeof setInterval> | null = null;
let orphanSweeperIntervalId:    ReturnType<typeof setInterval> | null = null;
let sessionPruneIntervalId:     ReturnType<typeof setInterval> | null = null;
let eventBusRecoveryIntervalId: ReturnType<typeof setInterval> | null = null;
let eventLogPruneIntervalId:    ReturnType<typeof setInterval> | null = null;
let churnRiskScanIntervalId:    ReturnType<typeof setInterval> | null = null;

const SLA_INTERVAL_MS                =  5 * 60 * 1_000;   // 5 minutes
const RECONCILE_INTERVAL_MS          = 15 * 60 * 1_000;   // 15 minutes
const WORKFLOW_DELAY_INTERVAL_MS     =  2 * 60 * 1_000;   // 2 minutes
const SCHEDULE_SWEEPER_INTERVAL_MS   =  1 * 60 * 1_000;   // 1 minute
const ORPHAN_SWEEPER_INTERVAL_MS     = 10 * 60 * 1_000;   // 10 minutes
const ORPHAN_THRESHOLD_MS            = 30 * 60 * 1_000;   // runs stuck > 30 min = orphaned
const SESSION_PRUNE_INTERVAL_MS      = 30 * 60 * 1_000;   // 30 minutes
const EVENT_BUS_RECOVERY_INTERVAL_MS =  5 * 60 * 1_000;   // 5 minutes — retry stuck events
const EVENT_LOG_PRUNE_INTERVAL_MS    = 60 * 60 * 1_000;   // 1 hour — remove old executed rows
const CHURN_RISK_SCAN_INTERVAL_MS    = 24 * 60 * 60 * 1_000; // 24 hours (daily)
const SUPER_AGENT_SCHEDULE_INTERVAL_MS =  1 * 60 * 1_000;   // 1 minute â€” due reminders / delayed actions

/**
 * Iterates over all active workspaces and invokes the per-scope callback.
 * If DEFAULT_TENANT_ID/DEFAULT_WORKSPACE_ID are set, those override the
 * iteration (single-tenant deploys).
 */
async function forEachActiveScope(
  fn: (scope: { tenantId: string; workspaceId: string }) => void | Promise<void>,
): Promise<void> {
  const override = bootstrapScope();
  if (override) {
    await fn(override);
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    // workspaces.org_id IS the tenantId in this codebase. There is no `status`
    // column on workspaces in current schema — we treat any workspace whose
    // parent organization is non-deleted as active. Filter org-level if available.
    const { data, error } = await supabase
      .from('workspaces')
      .select('id, org_id');
    if (error) throw error;
    const rows = (data ?? []) as Array<{ id: string; org_id: string }>;
    for (const row of rows) {
      if (!row.org_id || !row.id) continue;
      try {
        await fn({ tenantId: row.org_id, workspaceId: row.id });
      } catch (err) {
        logger.warn('Scheduled job per-workspace iteration failed', {
          tenantId: row.org_id,
          workspaceId: row.id,
          error: String((err as any)?.message ?? err),
        });
      }
    }
  } catch (err) {
    logger.warn('forEachActiveScope: failed to enumerate workspaces', {
      error: String((err as any)?.message ?? err),
    });
  }
}

export function startScheduledJobs(): void {
  logger.info('Starting scheduled job intervals', {
    slaIntervalMin:            SLA_INTERVAL_MS / 60_000,
    reconcileIntervalMin:      RECONCILE_INTERVAL_MS / 60_000,
    workflowDelayIntervalMin:  WORKFLOW_DELAY_INTERVAL_MS / 60_000,
    superAgentScheduleIntervalMin: SUPER_AGENT_SCHEDULE_INTERVAL_MS / 60_000,
  });

  const override = bootstrapScope();
  if (override) {
    logger.info('Scheduled jobs running in single-tenant override mode', {
      tenantId: override.tenantId,
      workspaceId: override.workspaceId,
    });
  } else {
    logger.info('Scheduled jobs running in multi-tenant mode (iterating all active workspaces)');
  }

  // Fire once shortly after startup (give the worker a few seconds to be fully up)
  setTimeout(() => {
    void forEachActiveScope((scope) => {
      enqueueDelayed(JobType.SLA_CHECK,           {}, 0, { tenantId: scope.tenantId, workspaceId: scope.workspaceId, priority: 9 });
    });
  }, 10_000);
  setTimeout(() => {
    void forEachActiveScope((scope) => {
      enqueueDelayed(JobType.RECONCILE_SCHEDULED, {}, 0, { tenantId: scope.tenantId, workspaceId: scope.workspaceId, priority: 9 });
    });
  }, 30_000);

  slaIntervalId = setInterval(() => {
    void forEachActiveScope((scope) => {
      enqueueDelayed(JobType.SLA_CHECK, {}, 0, { tenantId: scope.tenantId, workspaceId: scope.workspaceId, priority: 9 });
    });
  }, SLA_INTERVAL_MS);

  reconcileIntervalId = setInterval(() => {
    void forEachActiveScope((scope) => {
      enqueueDelayed(JobType.RECONCILE_SCHEDULED, {}, 0, { tenantId: scope.tenantId, workspaceId: scope.workspaceId, priority: 9 });
    });
  }, RECONCILE_INTERVAL_MS);

  // Workflow delay watcher: resume runs whose delay has expired
  workflowDelayIntervalId = setInterval(() => {
    void forEachActiveScope(async (scope) => {
      await resumeExpiredWorkflowDelays(scope.tenantId).catch((err) =>
        logger.warn('Workflow delay sweep failed', { tenantId: scope.tenantId, error: String(err?.message ?? err) }),
      );
    });
  }, WORKFLOW_DELAY_INTERVAL_MS);

  // trigger.schedule sweeper: fire scheduled workflows when their cron is due
  scheduleSweeperIntervalId = setInterval(() => {
    void forEachActiveScope(async (scope) => {
      await sweepScheduledWorkflows(scope.tenantId, scope.workspaceId).catch((err) =>
        logger.warn('Workflow schedule sweep failed', { tenantId: scope.tenantId, error: String(err?.message ?? err) }),
      );
    });
  }, SCHEDULE_SWEEPER_INTERVAL_MS);

  superAgentScheduleIntervalId = setInterval(() => {
    void forEachActiveScope(async (scope) => {
      await sweepSuperAgentScheduledActions(scope.tenantId, scope.workspaceId).catch((err) =>
        logger.warn('Super Agent scheduled action sweep failed', { tenantId: scope.tenantId, error: String(err?.message ?? err) }),
      );
    });
  }, SUPER_AGENT_SCHEDULE_INTERVAL_MS);

  // Orphaned run sweeper: mark workflow_runs stuck in 'running' > 30 min as failed
  orphanSweeperIntervalId = setInterval(() => {
    void forEachActiveScope(async (scope) => {
      await sweepOrphanedWorkflowRuns(scope.tenantId).catch((err) =>
        logger.warn('Orphaned run sweep failed', { tenantId: scope.tenantId, error: String(err?.message ?? err) }),
      );
    });
  }, ORPHAN_SWEEPER_INTERVAL_MS);

  // Session pruner: remove in-memory agent sessions whose TTL has expired
  // (sessions are global in-memory — no per-tenant iteration needed)
  sessionPruneIntervalId = setInterval(() => {
    void (async () => {
      try {
      const pruned = await pruneExpiredSessions();
      if (pruned > 0) logger.info(`Session pruner: removed ${pruned} expired session(s)`);
      } catch (err) {
        logger.warn('Session prune failed', { error: String((err as any)?.message ?? err) });
      }
    })();
  }, SESSION_PRUNE_INTERVAL_MS);

  // Event bus recovery: retry workflow events stuck in 'pending' (process crash recovery)
  eventBusRecoveryIntervalId = setInterval(() => {
    void forEachActiveScope(async (scope) => {
      await recoverPendingEvents(scope.tenantId, scope.workspaceId).catch((err) =>
        logger.warn('Event bus recovery sweep failed', { tenantId: scope.tenantId, error: String((err as any)?.message ?? err) }),
      );
    });
  }, EVENT_BUS_RECOVERY_INTERVAL_MS);

  // Event log pruner: delete executed rows older than 7 days to keep table lean
  eventLogPruneIntervalId = setInterval(() => {
    void forEachActiveScope(async (scope) => {
      await pruneEventLog(scope.tenantId).catch((err) =>
        logger.warn('Event log prune failed', { tenantId: scope.tenantId, error: String((err as any)?.message ?? err) }),
      );
    });
  }, EVENT_LOG_PRUNE_INTERVAL_MS);

  // Churn risk scanner: daily scan for customers at risk of churning
  setTimeout(() => {
    void forEachActiveScope((scope) => {
      enqueueDelayed(JobType.CHURN_RISK_SCAN, {}, 0, { tenantId: scope.tenantId, workspaceId: scope.workspaceId, priority: 6 });
    });
  }, 60_000);
  churnRiskScanIntervalId = setInterval(() => {
    void forEachActiveScope((scope) => {
      enqueueDelayed(JobType.CHURN_RISK_SCAN, {}, 0, { tenantId: scope.tenantId, workspaceId: scope.workspaceId, priority: 6 });
    });
  }, CHURN_RISK_SCAN_INTERVAL_MS);

  // Audit export request processor (hourly)
  startAuditExportSweeper();

  // Flexible (metered) Stripe usage reporter (daily)
  startFlexibleUsageReporter();

  // AI credits monthly period reset (hourly check; rolls only periods that have ended)
  startAiCreditsReset();
}

/**
 * Finds workflow_runs in 'waiting' status where the delay_until stored in
 * context has passed, and resumes them via the /resume endpoint internally.
 */
async function resumeExpiredWorkflowDelays(tenantId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  // Fetch waiting runs — we check delay_until from the context JSON
  const { data: runs, error } = await supabase
    .from('workflow_runs')
    .select('id, workflow_version_id, context, tenant_id')
    .eq('status', 'waiting')
    .eq('tenant_id', tenantId)
    .is('ended_at', null)
    .limit(50);

  if (error || !runs?.length) return;

  const expired = runs.filter((run) => {
    const ctx = run.context && typeof run.context === 'object' ? run.context as any : {};
    const wfCtx = ctx.workflowContext ?? ctx;
    const delayUntil = wfCtx.delayUntil ?? null;
    return delayUntil && delayUntil <= now;
  });

  if (!expired.length) return;

  logger.info(`Workflow delay sweep: resuming ${expired.length} expired run(s)`);

  for (const run of expired) {
    // Claim the run atomically — only proceed if still in 'waiting' state
    const { data: claimed } = await supabase
      .from('workflow_runs')
      .update({ status: 'running' })
      .eq('id', run.id)
      .eq('status', 'waiting')
      .select('*, workflow_versions!inner(id, workflow_id, status, nodes, edges, trigger)')
      .maybeSingle();

    if (!claimed) {
      logger.debug(`Workflow delay sweep: run ${run.id} already claimed or no longer waiting, skipping`);
      continue;
    }

    try {
      const result = await continueWorkflowRun({
        tenantId: run.tenant_id,
        workspaceId: (run as any).workspace_id ?? tenantId,
        userId: 'system',
        run: claimed,
        version: (claimed as any).workflow_versions,
        resumePayload: { autoResumed: true, reason: 'delay_expired' },
      });
      logger.info(`Workflow delay sweep: run ${run.id} resumed — final status: ${result.status}`);
    } catch (resumeErr) {
      logger.warn(`Workflow delay sweep: failed to resume run ${run.id}`, {
        error: resumeErr instanceof Error ? resumeErr.message : String(resumeErr),
      });
      // Roll back so it can be retried next sweep
      await supabase.from('workflow_runs')
        .update({ status: 'waiting' })
        .eq('id', run.id)
        .eq('status', 'running');
    }
  }
}

/**
 * Evaluates all published workflows with a trigger.schedule node.
 * If their cron expression is due (based on last run timestamp), fires the event.
 * Uses a simple "has the cron minute elapsed since last run?" heuristic.
 */
async function sweepScheduledWorkflows(tenantId: string, workspaceId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const now = new Date();

  // Find published workflows with trigger.schedule config
  const { data: versions } = await supabase
    .from('workflow_versions')
    .select('id, workflow_id, nodes, trigger')
    .eq('status', 'published')
    .eq('tenant_id', tenantId);

  if (!versions?.length) return;

  for (const version of versions) {
    try {
      const nodes = Array.isArray(version.nodes) ? version.nodes : [];
      const triggerNode = nodes.find((n: any) => n.key === 'trigger.schedule' || n.type === 'trigger');
      if (!triggerNode || triggerNode.key !== 'trigger.schedule') continue;

      const cron = triggerNode.config?.cron;
      if (!cron) continue;

      // Check last run for this workflow in the last SCHEDULE_SWEEPER_INTERVAL_MS window
      const windowStart = new Date(now.getTime() - SCHEDULE_SWEEPER_INTERVAL_MS).toISOString();
      const { data: recentRun } = await supabase
        .from('workflow_runs')
        .select('id, started_at')
        .eq('workflow_version_id', version.id)
        .eq('trigger_type', 'schedule')
        .gte('started_at', windowStart)
        .limit(1)
        .single();

      if (recentRun) continue; // already ran in this window

      // Simple cron evaluation: parse the 5 cron fields and check if "now" matches
      if (cronMatchesNow(cron, now)) {
        logger.info(`Schedule sweep: triggering workflow ${version.workflow_id} (cron: ${cron})`);
        fireWorkflowEvent(
          { tenantId, workspaceId },
          'trigger.schedule',
          { workflowId: version.workflow_id, cron, scheduledAt: now.toISOString() },
        );
      }
    } catch { /* skip this workflow, try next */ }
  }
}

/** Minimal 5-field cron matcher: "min hour dom month dow" */
function cronMatchesNow(cron: string, now: Date): boolean {
  try {
    const [minF, hourF, domF, monF, dowF] = cron.trim().split(/\s+/);
    const matchField = (field: string, value: number): boolean => {
      if (field === '*') return true;
      if (field.startsWith('*/')) {
        const step = parseInt(field.slice(2), 10);
        return !isNaN(step) && value % step === 0;
      }
      return field.split(',').map(Number).includes(value);
    };
    return (
      matchField(minF,  now.getUTCMinutes()) &&
      matchField(hourF, now.getUTCHours())   &&
      matchField(domF,  now.getUTCDate())    &&
      matchField(monF,  now.getUTCMonth() + 1) &&
      matchField(dowF,  now.getUTCDay())
    );
  } catch { return false; }
}

function bootstrapScope() {
  const tenantId = process.env.DEFAULT_TENANT_ID ?? null;
  const workspaceId = process.env.DEFAULT_WORKSPACE_ID ?? null;
  if (!tenantId || !workspaceId) return null;
  return requireScope({ tenantId, workspaceId }, 'scheduledJobs');
}

export function stopScheduledJobs(): void {
  if (slaIntervalId)               clearInterval(slaIntervalId);
  if (reconcileIntervalId)         clearInterval(reconcileIntervalId);
  if (workflowDelayIntervalId)     clearInterval(workflowDelayIntervalId);
  if (scheduleSweeperIntervalId)   clearInterval(scheduleSweeperIntervalId);
  if (superAgentScheduleIntervalId) clearInterval(superAgentScheduleIntervalId);
  if (orphanSweeperIntervalId)     clearInterval(orphanSweeperIntervalId);
  if (sessionPruneIntervalId)      clearInterval(sessionPruneIntervalId);
  if (eventBusRecoveryIntervalId)  clearInterval(eventBusRecoveryIntervalId);
  if (eventLogPruneIntervalId)     clearInterval(eventLogPruneIntervalId);
  if (churnRiskScanIntervalId)     clearInterval(churnRiskScanIntervalId);
  stopAuditExportSweeper();
  stopFlexibleUsageReporter();
  stopAiCreditsReset();
  slaIntervalId              = null;
  reconcileIntervalId        = null;
  workflowDelayIntervalId    = null;
  scheduleSweeperIntervalId  = null;
  superAgentScheduleIntervalId = null;
  orphanSweeperIntervalId    = null;
  sessionPruneIntervalId     = null;
  eventBusRecoveryIntervalId = null;
  eventLogPruneIntervalId    = null;
  logger.info('Scheduled job intervals stopped');
}

/**
 * Super Agent scheduled actions.
 * - reminders become audit-visible events once due
 * - delayed workflow triggers are fired through the workflow event bus
 * - delayed queue jobs are enqueued once due
 */
async function sweepSuperAgentScheduledActions(tenantId: string, workspaceId: string): Promise<void> {
  const opsRepo = createSuperAgentOpsRepository();
  const auditRepo = createAuditRepository();
  const due = await opsRepo.claimDueScheduledActions({ tenantId, workspaceId }, new Date().toISOString(), 25);
  if (!due.length) return;

  logger.info(`Super Agent schedule sweep: processing ${due.length} due action(s)`);

  for (const action of due) {
    try {
      const payload = (action.payload || {}) as Record<string, any>;

      if (payload.workflowId) {
        fireWorkflowEvent({ tenantId, workspaceId }, 'trigger.schedule', {
          workflowId: payload.workflowId,
          scheduledActionId: action.id,
          title: action.title,
          dueAt: action.due_at,
        });
      } else if (payload.dispatchJobType) {
        await enqueueDelayed(
          String(payload.dispatchJobType) as any,
          (payload.dispatchPayload || {}) as any,
          0,
          { tenantId, workspaceId, priority: 9, traceId: `super-agent-schedule-${action.id}` },
        );
      }

      await auditRepo.log({
        tenantId,
        workspaceId,
        actorId: action.created_by || 'system',
        action: 'SUPER_AGENT_SCHEDULED_ACTION_DUE',
        entityType: action.target_type || 'super_agent',
        entityId: action.target_id || action.id,
        newValue: {
          id: action.id,
          title: action.title,
          kind: action.kind,
          dueAt: action.due_at,
          dispatched: Boolean(payload.workflowId || payload.dispatchJobType),
        },
        metadata: {
          source: 'scheduled-jobs',
          workflowId: payload.workflowId ?? null,
          dispatchJobType: payload.dispatchJobType ?? null,
        },
      });

      await opsRepo.completeScheduledAction({ tenantId, workspaceId }, action.id, { executedAt: new Date().toISOString() });
      logger.info(`Scheduled action ${action.id} completed`, { kind: action.kind, title: action.title });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await opsRepo.failScheduledAction({ tenantId, workspaceId }, action.id, message);
      logger.warn(`Scheduled action ${action.id} failed`, { error: message });
    }
  }
}

/**
 * Scans workflow_runs stuck in 'running' for longer than ORPHAN_THRESHOLD_MS
 * and marks them as 'failed'. This recovers from server crashes that left runs
 * in an intermediate state.
 */
async function sweepOrphanedWorkflowRuns(tenantId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const threshold = new Date(Date.now() - ORPHAN_THRESHOLD_MS).toISOString();

  const { data: orphans, error } = await supabase
    .from('workflow_runs')
    .select('id, workflow_version_id, started_at')
    .eq('status', 'running')
    .eq('tenant_id', tenantId)
    .lt('started_at', threshold)
    .is('ended_at', null)
    .limit(20);

  if (error || !orphans?.length) return;

  logger.info(`Orphaned run sweep: found ${orphans.length} stuck run(s) — marking failed`);

  const now = new Date().toISOString();
  for (const run of orphans) {
    await supabase
      .from('workflow_runs')
      .update({
        status:      'failed',
        ended_at:    now,
        updated_at:  now,
        error:       'Run timed out — marked failed by orphan sweeper (server restart likely)',
      })
      .eq('id', run.id)
      .eq('status', 'running');  // guard: only update if still running

    logger.info(`Orphaned run ${run.id} marked as failed (started ${run.started_at})`);
  }
}
