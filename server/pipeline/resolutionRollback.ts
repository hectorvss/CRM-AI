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
import { createCaseRepository } from '../data/cases.js';
import { createCommerceRepository } from '../data/commerce.js';
import { registerHandler }    from '../queue/handlers/index.js';
import { JobType }            from '../queue/types.js';
import { logger }             from '../utils/logger.js';
import { requireScope }       from '../lib/scope.js';
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

  const caseRepo = createCaseRepository();
  const commerceRepo = createCommerceRepository();
  const scope = requireScope(ctx, 'resolutionRollback');
  const { tenantId, workspaceId } = scope;

  const plan = await caseRepo.getExecutionPlan(scope, payload.executionPlanId);
  if (!plan) {
    log.warn('Execution plan not found for rollback');
    return;
  }

  const steps: any[] = typeof plan.steps === 'string' ? JSON.parse(plan.steps) : (plan.steps || []);

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
      await rollbackStep(step, plan.case_id, scope, caseRepo, commerceRepo);
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
  await caseRepo.updateExecutionPlan(scope, plan.id, { status: 'rolled_back' });

  // Flag case for urgent manual review
  await caseRepo.update(scope, plan.case_id, {
    priority: 'urgent',
    execution_state: 'rolled_back'
  });

  // Record status history
  const currentCase = await caseRepo.get(scope, plan.case_id);
  await caseRepo.addStatusHistory(scope, {
    caseId: plan.case_id,
    fromStatus: currentCase?.status,
    toStatus: currentCase?.status,
    changedBy: 'resolution_rollback',
    reason: `Rollback triggered: ${payload.reason}`
  });

  log.warn('Rollback complete — case escalated to urgent', {
    caseId: plan.case_id,
    reason: payload.reason,
  });
}

async function rollbackStep(step: any, caseId: string, scope: any, caseRepo: any, commerceRepo: any): Promise<void> {
  switch (`${step.tool}/${step.action}`) {

    case 'internal/update_case_status': {
      // Re-apply the previous status from history
      const restoreStatus = await caseRepo.getPreviousStatusFromHistory(scope, caseId, 'resolution_executor') || 'open';
      await caseRepo.update(scope, caseId, { status: restoreStatus });
      break;
    }

    case 'internal/close_reconciliation': {
      // Re-open all reconciliation issues that were closed by this plan
      await caseRepo.reopenReconciliationIssues(scope, caseId);
      break;
    }

    case 'internal/flag_for_review': {
      // Undo the priority escalation (restore to 'normal')
      await caseRepo.update(scope, caseId, { priority: 'normal' });
      break;
    }

    case 'shopify/update_order_status': {
      // Restore order status from before this step — best-effort
      if (step.params?.order_id) {
        await commerceRepo.updateOrder(scope, step.params.order_id, { status: 'pending' });
      }
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
