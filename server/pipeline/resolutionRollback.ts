/**
 * server/pipeline/resolutionRollback.ts
 *
 * Resolution Rollback — Phase 4.
 *
 * Handles RESOLUTION_ROLLBACK jobs. When an execution plan fails after some
 * steps have already run, this handler attempts to undo each completed
 * rollbackable step in reverse order.
 *
 * Rollback actions:
 *  - stripe/issue_refund → No rollback possible (refund cannot be un-issued)
 *  - shopify/cancel_order → No rollback possible
 *  - internal/update_case_status → Re-set to previous status from history
 *  - internal/close_reconciliation → Re-open the issues
 *  - internal/flag_for_review → Remove urgent flag (set back to normal)
 *
 * After rollback the plan is marked 'rolled_back' and the case is re-flagged
 * for manual review at urgent priority.
 */

import { randomUUID }         from 'crypto';
import { getDb }              from '../db/client.js';
import { registerHandler }    from '../queue/handlers/index.js';
import { JobType }            from '../queue/types.js';
import { logger }             from '../utils/logger.js';
import type { ResolutionRollbackPayload, JobContext } from '../queue/types.js';

async function handleResolutionRollback(
  payload: ResolutionRollbackPayload,
  ctx: JobContext
): Promise<void> {
  const log = logger.child({
    jobId:           ctx.jobId,
    executionPlanId: payload.executionPlanId,
    traceId:         ctx.traceId,
  });

  const db       = getDb();
  const tenantId = ctx.tenantId ?? 'org_default';

  const plan = db.prepare('SELECT * FROM execution_plans WHERE id = ?').get(payload.executionPlanId) as any;
  if (!plan) {
    log.warn('Execution plan not found for rollback');
    return;
  }

  const steps: any[] = JSON.parse(plan.steps || '[]');

  // Only roll back completed steps in reverse order
  const completedSteps = steps
    .filter(s => s.status === 'done' && s.rollbackable)
    .sort((a, b) => b.order - a.order);

  log.info('Starting rollback', {
    caseId:         plan.case_id,
    stepsToRollback: completedSteps.length,
    reason:          payload.reason,
  });

  for (const step of completedSteps) {
    try {
      await rollbackStep(step, plan.case_id, tenantId, db);
      log.info('Step rolled back', { stepId: step.id, action: step.action });
    } catch (err) {
      log.error('Rollback step failed', {
        stepId: step.id,
        action: step.action,
        error:  err instanceof Error ? err.message : String(err),
      });
      // Continue rolling back other steps even if one fails
    }
  }

  // Mark plan as rolled_back
  db.prepare(`UPDATE execution_plans SET status = 'rolled_back' WHERE id = ?`).run(plan.id);

  // Flag case for urgent manual review
  db.prepare(`
    UPDATE cases SET
      priority        = 'urgent',
      execution_state = 'rolled_back',
      updated_at      = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(plan.case_id);

  // Record status history
  db.prepare(`
    INSERT INTO case_status_history
      (id, case_id, from_status, to_status, changed_by, changed_by_type, reason, tenant_id)
    SELECT ?, id, status, status, 'resolution_rollback', 'system', ?, ?
    FROM cases WHERE id = ?
  `).run(
    randomUUID(),
    `Rollback triggered: ${payload.reason}`,
    tenantId,
    plan.case_id,
  );

  log.warn('Rollback complete — case escalated to urgent', {
    caseId: plan.case_id,
    reason: payload.reason,
  });
}

async function rollbackStep(step: any, caseId: string, tenantId: string, db: any): Promise<void> {
  switch (`${step.tool}/${step.action}`) {

    case 'internal/update_case_status': {
      // Re-apply the previous status from history
      const prevHistory = db.prepare(`
        SELECT from_status FROM case_status_history
        WHERE case_id = ? AND changed_by = 'resolution_executor'
        ORDER BY rowid DESC LIMIT 1
      `).get(caseId) as any;

      const restoreStatus = prevHistory?.from_status ?? 'open';
      db.prepare('UPDATE cases SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(restoreStatus, caseId);
      break;
    }

    case 'internal/close_reconciliation': {
      // Re-open all reconciliation issues that were closed by this plan
      db.prepare(`
        UPDATE reconciliation_issues
        SET status = 'open', resolved_at = NULL
        WHERE case_id = ? AND resolved_at IS NOT NULL
      `).run(caseId);
      db.prepare('UPDATE cases SET has_reconciliation_conflicts = 1 WHERE id = ?').run(caseId);
      break;
    }

    case 'internal/flag_for_review': {
      // Undo the priority escalation (restore to 'normal')
      db.prepare('UPDATE cases SET priority = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run('normal', caseId);
      break;
    }

    case 'shopify/update_order_status': {
      // Restore order status from before this step — best-effort
      db.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run('pending', step.params?.order_id ?? '');
      break;
    }

    default:
      // stripe/issue_refund and shopify/cancel_order cannot be rolled back
      logger.debug('Step action is not rollbackable, skipping', {
        tool:   step.tool,
        action: step.action,
      });
      break;
  }
}

// ── Register ──────────────────────────────────────────────────────────────────

registerHandler(JobType.RESOLUTION_ROLLBACK, handleResolutionRollback);

export { handleResolutionRollback };
