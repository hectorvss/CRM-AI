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
import { createApprovalRepository } from '../data/approvals.js';
import { registerHandler }    from '../queue/handlers/index.js';
import { JobType }            from '../queue/types.js';
import { logger }             from '../utils/logger.js';
import { requireScope }       from '../lib/scope.js';
import { integrationRegistry } from '../integrations/registry.js';
import { getSupabaseAdmin }   from '../db/supabase.js';
import { broadcastSSE }       from '../routes/sse.js';
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
      await rollbackStep(step, plan.case_id, plan.id, scope, caseRepo, commerceRepo);
      log.info('Step rolled back', { stepId: step.id, action: step.action });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error('Rollback step failed', {
        stepId: step.id,
        action: step.action,
        error:  errMsg,
      });
      // Fall back to manual intervention so the case never silently leaks.
      await recordManualIntervention(scope, {
        planId: plan.id,
        caseId: plan.case_id,
        stepId: step.id,
        originalTool: step.tool,
        compensateTool: step.action,
        errorMessage: errMsg,
        context: { params: step.params ?? {}, reason: 'rollback step threw' },
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

async function rollbackStep(step: any, caseId: string, planId: string, scope: any, caseRepo: any, commerceRepo: any): Promise<void> {
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

    case 'stripe/issue_refund': {
      // Refunds in Stripe are terminal — there is no API to "un-refund". The
      // previously silent skip masked an irreversible state change. Surface it
      // to a human via the manual intervention queue instead.
      const refundId = step.params?.refund_id ?? step.result?.refund_id ?? null;
      const amount = step.params?.amount ?? null;
      await recordManualIntervention(scope, {
        planId,
        caseId,
        stepId: step.id,
        originalTool: 'stripe/issue_refund',
        compensateTool: 'non_reversible',
        errorMessage: 'Stripe refund cannot be reversed via API. Issue a chargeback or counter-charge manually in the Stripe dashboard if a reversal is required.',
        context: {
          refundId,
          amount,
          instructions: [
            'Open the refund in Stripe dashboard (https://dashboard.stripe.com/refunds).',
            'If the funds must be returned to the merchant, coordinate with the customer to issue a fresh charge — refunds cannot be unwound programmatically.',
            'Annotate the refund with metadata.reversal_required=true for audit.',
          ],
        },
      });
      break;
    }

    case 'shopify/cancel_order': {
      // A cancelled Shopify order CAN be re-opened via POST /orders/{id}/restore.json
      // as long as it has not been fulfilled. If the API call fails (e.g. order
      // is already fulfilled) we fall back to a manual intervention record.
      const orderId = step.params?.order_id ?? step.params?.orderExternalId ?? null;
      if (!orderId) {
        await recordManualIntervention(scope, {
          planId, caseId, stepId: step.id,
          originalTool: 'shopify/cancel_order',
          compensateTool: 'shopify/restore_order',
          errorMessage: 'Cannot restore Shopify order: missing order_id in step params',
          context: { params: step.params ?? {} },
        });
        break;
      }
      try {
        await restoreShopifyOrder(orderId);
        logger.info('Shopify order restored after rollback', { orderId, caseId });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await recordManualIntervention(scope, {
          planId, caseId, stepId: step.id,
          originalTool: 'shopify/cancel_order',
          compensateTool: 'shopify/restore_order',
          errorMessage: `Shopify restore failed: ${errMsg}`,
          context: {
            orderId,
            instructions: [
              'Open the order in the Shopify admin and click "Restore order".',
              'Verify inventory was re-allocated correctly.',
              'If the order was already fulfilled, restoration is not possible — coordinate with logistics for a recall or new shipment.',
            ],
          },
        });
      }
      break;
    }

    default:
      logger.debug('Step action is not rollbackable, skipping', {
        tool:   step.tool,
        action: step.action,
      });
      break;
  }
}

/**
 * Calls Shopify Admin REST `POST /orders/{id}/restore.json`. Will throw if
 * the order has been fulfilled or if the integration is not configured.
 */
async function restoreShopifyOrder(orderExternalId: string): Promise<void> {
  const adapter = integrationRegistry.get('shopify') as any;
  if (!adapter) {
    throw new Error('Shopify integration not configured');
  }
  if (typeof adapter.restoreOrder !== 'function') {
    throw new Error('ShopifyAdapter.restoreOrder is unavailable on this server build');
  }
  await adapter.restoreOrder(orderExternalId);
}

/**
 * Record a non-reversible or failed rollback step into the manual_intervention_required
 * queue, open an approval_requests row, and broadcast over SSE.
 */
async function recordManualIntervention(scope: any, input: {
  planId: string;
  caseId: string;
  stepId: string;
  originalTool: string;
  compensateTool: string;
  errorMessage: string;
  context: Record<string, unknown>;
}): Promise<void> {
  const id = randomUUID();
  const now = new Date().toISOString();

  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('manual_intervention_required').insert({
      id,
      tenant_id: scope.tenantId,
      workspace_id: scope.workspaceId ?? null,
      plan_id: input.planId,
      step_id: input.stepId,
      case_id: input.caseId,
      original_tool: input.originalTool,
      compensate_tool: input.compensateTool,
      error_message: input.errorMessage,
      context: input.context,
      status: 'open',
      created_at: now,
      updated_at: now,
    });
  } catch (err) {
    logger.error('manual_intervention_required insert failed', err instanceof Error ? err : new Error(String(err)));
  }

  try {
    const approvalRepo = createApprovalRepository();
    await approvalRepo.create(
      { tenantId: scope.tenantId, workspaceId: scope.workspaceId ?? '', userId: scope.userId },
      {
        caseId: input.caseId,
        actionType: 'manual_intervention',
        riskLevel: 'critical',
        requestedBy: 'resolution_rollback',
        requestedByType: 'system',
        priority: 'high',
        actionPayload: {
          planId: input.planId,
          stepId: input.stepId,
          originalTool: input.originalTool,
          compensateTool: input.compensateTool,
          interventionId: id,
          ...input.context,
        },
        evidencePackage: {
          reason: 'Rollback could not be executed automatically',
          error: input.errorMessage,
        },
      },
    );
  } catch (err) {
    logger.error('manual_intervention approval create failed', err instanceof Error ? err : new Error(String(err)));
  }

  try {
    broadcastSSE(scope.tenantId, 'super-agent:rollback_failed', {
      planId: input.planId,
      stepId: input.stepId,
      caseId: input.caseId,
      originalTool: input.originalTool,
      compensateTool: input.compensateTool,
      interventionId: id,
      error: input.errorMessage,
    });
  } catch (err) {
    logger.warn('rollback_failed SSE broadcast failed', { error: err instanceof Error ? err.message : String(err) });
  }
}

// ── Register ──────────────────────────────────────────────────────────────────

registerHandler(JobType.RESOLUTION_ROLLBACK, handleResolutionRollback);

export { handleResolutionRollback };
