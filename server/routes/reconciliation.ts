import { Router } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { canTransition, reconciliationIssueTransitions } from '../contracts/stateMachines.js';
import { createReconciliationRepository } from '../data/reconciliation.js';
import { createCommerceRepository } from '../data/commerce.js';
import { createCaseRepository } from '../data/cases.js';
import { createAuditRepository } from '../data/audit.js';
import { sendError } from '../http/errors.js';
import { randomUUID } from 'crypto';

const router = Router();
router.use(extractMultiTenant);
router.use(requirePermission('cases.read'));

async function recalcCaseConflictState(tenantId: string, workspaceId: string, caseId: string) {
  const reconciliationRepo = createReconciliationRepository();
  const caseRepo = createCaseRepository();
  
  const issues = await reconciliationRepo.listIssues({ tenantId, workspaceId }, { case_id: caseId });
  const openIssues = issues.filter(i => ['open', 'in_progress', 'escalated'].includes(i.status));
  
  const hasOpen = openIssues.length > 0;
  await caseRepo.update(caseId, { tenantId, workspaceId }, {
    has_reconciliation_conflicts: hasOpen ? 1 : 0,
    updated_at: new Date().toISOString()
  });
}

async function resolveIssueBySourceOfTruth(params: {
  tenantId: string;
  workspaceId: string;
  userId: string;
  issue: any;
  targetStatus: string;
  reason?: string;
}) {
  const { tenantId, workspaceId, userId, issue, targetStatus, reason } = params;
  const entityType = String(issue.entity_type || '').toLowerCase();
  const entityId = String(issue.entity_id || '');
  if (!entityType || !entityId) throw new Error('Invalid issue entity');

  const commerceRepo = createCommerceRepository();
  const reconciliationRepo = createReconciliationRepository();
  const scope = { tenantId, workspaceId };

  let existingStates: any = {};
  if (entityType === 'order') {
    const order = await commerceRepo.getOrder(scope, entityId);
    existingStates = order?.system_states || {};
    existingStates.canonical = targetStatus;
    await commerceRepo.updateOrder(scope, entityId, {
      status: targetStatus,
      system_states: JSON.stringify(existingStates),
      has_conflict: 0,
      conflict_domain: null,
      conflict_detected: null,
      recommended_action: null
    });
  } else if (entityType === 'payment' || entityType === 'refund') {
    const payment = await commerceRepo.getPayment(scope, entityId);
    existingStates = payment?.system_states || {};
    existingStates.canonical = targetStatus;
    await commerceRepo.updatePayment(scope, entityId, {
      status: targetStatus,
      system_states: JSON.stringify(existingStates),
      conflict_detected: null,
      recommended_action: null
    });
  } else if (entityType === 'return') {
    const ret = await commerceRepo.getReturn(scope, entityId);
    existingStates = ret?.system_states || {};
    existingStates.canonical = targetStatus;
    await commerceRepo.updateReturn(scope, entityId, {
      status: targetStatus,
      system_states: JSON.stringify(existingStates),
      conflict_detected: null,
      recommended_action: null
    });
  } else {
    throw new Error(`Unsupported entity_type for resolution: ${entityType}`);
  }

  await reconciliationRepo.insertSystemState(scope, {
    entity_type: entityType,
    entity_id: entityId,
    system: 'canonical',
    state_key: 'status',
    state_value: targetStatus
  });

  await reconciliationRepo.insertCanonicalDecision(scope, {
    entity_type: entityType,
    entity_id: entityId,
    chosen_system: issue.source_of_truth_system || 'canonical',
    chosen_value: targetStatus,
    candidates: issue.actual_states || {},
    reason: reason || 'Applied source-of-truth status to canonical state',
    issue_id: issue.id,
    case_id: issue.case_id || null,
    decided_by: userId
  });

  await reconciliationRepo.updateIssue(scope, issue.id, {
    status: 'resolved',
    expected_state: targetStatus,
    resolved_at: new Date().toISOString(),
    resolution_plan: reason || 'Auto-applied source-of-truth status'
  });

  if (issue.case_id) await recalcCaseConflictState(tenantId, workspaceId, issue.case_id);

  const auditRepo = createAuditRepository();
  await auditRepo.logAudit({
    tenantId,
    workspaceId,
    actorId: userId,
    action: 'RECONCILIATION_AUTO_APPLIED',
    entityType: 'reconciliation_issue',
    entityId: issue.id,
    metadata: {
      entity_type: entityType,
      entity_id: entityId,
      chosen_system: issue.source_of_truth_system || 'canonical',
      chosen_value: targetStatus,
      case_id: issue.case_id || null,
    },
  });
}

// GET /api/reconciliation/issues
router.get('/issues', async (req: MultiTenantRequest, res) => {
  try {
    const reconciliationRepo = createReconciliationRepository();
    const { status, severity, entity_type, case_id } = req.query;
    
    const issues = await reconciliationRepo.listIssues(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId! },
      { 
        status: status as string, 
        severity: severity as string, 
        entity_type: entity_type as string, 
        case_id: case_id as string 
      }
    );
    
    res.json(issues);
  } catch (error) {
    console.error('Error listing reconciliation issues:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list reconciliation issues');
  }
});

// GET /api/reconciliation/issues/:id
router.get('/issues/:id', async (req: MultiTenantRequest, res) => {
  try {
    const reconciliationRepo = createReconciliationRepository();
    const issue = await reconciliationRepo.getIssue(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId! },
      req.params.id
    );

    if (!issue) return sendError(res, 404, 'RECONCILIATION_ISSUE_NOT_FOUND', 'Reconciliation issue not found');
    res.json(issue);
  } catch (error) {
    console.error('Error fetching reconciliation issue detail:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch reconciliation issue');
  }
});

// GET /api/reconciliation/metrics
router.get('/metrics', requirePermission('audit.read'), async (req: MultiTenantRequest, res) => {
  try {
    const reconciliationRepo = createReconciliationRepository();
    const metrics = await reconciliationRepo.getMetrics({ 
      tenantId: req.tenantId!, 
      workspaceId: req.workspaceId! 
    });
    res.json(metrics);
  } catch (error) {
    console.error('Error fetching reconciliation metrics:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch reconciliation metrics');
  }
});

// PATCH /api/reconciliation/issues/:id/status
router.patch('/issues/:id/status', requirePermission('cases.write'), async (req: MultiTenantRequest, res) => {
  try {
    const reconciliationRepo = createReconciliationRepository();
    const nextStatus = String(req.body?.status || '').trim();
    const resolutionPlan = typeof req.body?.resolution_plan === 'string' ? req.body.resolution_plan.trim() : null;
    const expectedState = typeof req.body?.expected_state === 'string' ? req.body.expected_state.trim() : null;

    if (!nextStatus) return sendError(res, 400, 'INVALID_RECONCILIATION_STATUS', 'status is required');

    const issue = await reconciliationRepo.getIssue(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId! },
      req.params.id
    );
    if (!issue) return sendError(res, 404, 'RECONCILIATION_ISSUE_NOT_FOUND', 'Reconciliation issue not found');

    const fromStatus = issue.status as keyof typeof reconciliationIssueTransitions;
    const toStatus = nextStatus as keyof typeof reconciliationIssueTransitions;
    
    if (!fromStatus || !toStatus || !canTransition(fromStatus, toStatus, reconciliationIssueTransitions)) {
      return sendError(res, 400, 'INVALID_RECONCILIATION_TRANSITION', 'Invalid reconciliation status transition', {
        from: issue.status,
        to: nextStatus,
      });
    }

    const updates: any = { status: nextStatus };
    if (resolutionPlan) updates.resolution_plan = resolutionPlan;
    if (expectedState) updates.expected_state = expectedState;
    if (nextStatus === 'resolved') updates.resolved_at = new Date().toISOString();

    await reconciliationRepo.updateIssue({ tenantId: req.tenantId!, workspaceId: req.workspaceId! }, req.params.id, updates);

    if (issue.case_id && ['resolved', 'ignored'].includes(nextStatus)) {
      await recalcCaseConflictState(req.tenantId!, req.workspaceId!, issue.case_id);
    }

    const auditRepo = createAuditRepository();
    await auditRepo.logAudit({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId || 'system',
      action: 'RECONCILIATION_ISSUE_STATUS_CHANGED',
      entityType: 'reconciliation_issue',
      entityId: req.params.id,
      oldValue: { status: issue.status },
      newValue: { status: nextStatus },
      metadata: { resolution_plan: resolutionPlan, expected_state: expectedState },
    });

    const updated = await reconciliationRepo.getIssue({ tenantId: req.tenantId!, workspaceId: req.workspaceId! }, req.params.id);
    res.json(updated);
  } catch (error) {
    console.error('Error updating reconciliation issue status:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update reconciliation issue');
  }
});

// POST /api/reconciliation/issues/:id/resolve-apply
router.post('/issues/:id/resolve-apply', requirePermission('cases.write'), async (req: MultiTenantRequest, res) => {
  try {
    const reconciliationRepo = createReconciliationRepository();
    const issue = await reconciliationRepo.getIssue({ tenantId: req.tenantId!, workspaceId: req.workspaceId! }, req.params.id);
    
    if (!issue) return sendError(res, 404, 'RECONCILIATION_ISSUE_NOT_FOUND', 'Reconciliation issue not found');
    if (!['open', 'in_progress', 'escalated'].includes(issue.status)) {
      return sendError(res, 400, 'RECONCILIATION_ISSUE_NOT_ACTIONABLE', 'Issue must be open, in_progress, or escalated');
    }

    const actualStates = typeof issue.actual_states === 'string' ? JSON.parse(issue.actual_states) : (issue.actual_states || {});
    const sourceSystem = issue.source_of_truth_system || null;
    const inferredStatus = sourceSystem ? actualStates[sourceSystem] : null;
    
    const targetStatus = req.body?.target_status?.trim() || issue.expected_state || inferredStatus;
    if (!targetStatus) return sendError(res, 400, 'RECONCILIATION_TARGET_STATUS_MISSING', 'Could not infer target status to apply');

    await resolveIssueBySourceOfTruth({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      userId: req.userId || 'system',
      issue,
      targetStatus: String(targetStatus),
      reason: req.body?.reason?.trim() || 'Auto-applied source-of-truth status',
    });

    const updated = await reconciliationRepo.getIssue({ tenantId: req.tenantId!, workspaceId: req.workspaceId! }, req.params.id);
    res.json(updated);
  } catch (error) {
    console.error('Error applying reconciliation resolution:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to apply reconciliation resolution');
  }
});

// POST /api/reconciliation/process-open
router.post('/process-open', requirePermission('cases.write'), async (req: MultiTenantRequest, res) => {
  try {
    const reconciliationRepo = createReconciliationRepository();
    const limitRaw = Number(req.body?.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(200, Math.trunc(limitRaw)) : 50;
    
    // We don't have a direct "listOpenAutoResolvable" so we'll list all and filter, 
    // or we could add a better filter to listIssues if needed.
    const allIssues = await reconciliationRepo.listIssues({ tenantId: req.tenantId!, workspaceId: req.workspaceId! }, {});
    const actionableIssues = allIssues.filter(issue => 
      ['open', 'in_progress'].includes(issue.status) && 
      issue.source_of_truth_system && 
      (issue.expected_state || issue.actual_states)
    ).slice(0, limit);

    const resolvedIds: string[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];

    for (const issue of actionableIssues) {
      try {
        const actualStates = typeof issue.actual_states === 'string' ? JSON.parse(issue.actual_states) : (issue.actual_states || {});
        const inferredStatus = issue.source_of_truth_system ? actualStates[issue.source_of_truth_system] : null;
        const targetStatus = issue.expected_state || inferredStatus;
        
        if (!targetStatus) {
          skipped.push({ id: issue.id, reason: 'target_status_unavailable' });
          continue;
        }

        await resolveIssueBySourceOfTruth({
          tenantId: req.tenantId!,
          workspaceId: req.workspaceId!,
          userId: req.userId || 'system',
          issue,
          targetStatus: String(targetStatus),
          reason: 'Auto-resolved by reconciliation processor',
        });
        resolvedIds.push(issue.id);
      } catch (err) {
        skipped.push({ id: issue.id, reason: err instanceof Error ? err.message : 'unknown_error' });
      }
    }

    res.json({
      success: true,
      scanned: actionableIssues.length,
      resolved_count: resolvedIds.length,
      resolved_ids: resolvedIds,
      skipped_count: skipped.length,
      skipped,
    });
  } catch (error) {
    console.error('Error processing open reconciliation issues:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to process open reconciliation issues');
  }
});

export default router;

