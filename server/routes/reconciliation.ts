import { Router } from 'express';
import { sendError } from '../http/errors.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { canTransition, reconciliationIssueTransitions } from '../contracts/stateMachines.js';
import { 
  createReconciliationRepository, 
  createCommerceRepository, 
  createCaseRepository,
  createAuditRepository
} from '../data/index.js';

const router = Router();
router.use(extractMultiTenant);
router.use(requirePermission('cases.read'));

const reconRepo = createReconciliationRepository();
const commerceRepo = createCommerceRepository();
const caseRepo = createCaseRepository();
const auditRepo = createAuditRepository();

const SEVERITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, warning: 1 };

function pickWorstSeverity(severities: Array<string | null | undefined>): string | null {
  const present = severities.filter((s): s is string => Boolean(s));
  if (present.length === 0) return null;
  return present.reduce((worst, s) => (SEVERITY_RANK[s] ?? 0) > (SEVERITY_RANK[worst] ?? 0) ? s : worst);
}

async function recalcCaseConflictState(scope: any, caseId: string) {
  const activeIssues = await reconRepo.listIssues(scope, { case_id: caseId });
  const openLike = activeIssues.filter(i => ['open', 'in_progress', 'escalated'].includes(i.status));
  const hasOpen = openLike.length > 0;
  const severity = hasOpen ? (pickWorstSeverity(openLike.map(i => i.severity)) ?? 'warning') : null;

  await caseRepo.updateConflictState(scope, caseId, hasOpen, severity);
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
  const scope = { tenantId, workspaceId };
  const entityType = String(issue.entity_type || '').toLowerCase();
  const entityId = String(issue.entity_id || '');
  
  if (!entityType || !entityId) throw new Error('Invalid issue entity');

  // 1. Update the actual entity (Order, Payment, or Return)
  if (entityType === 'order') {
    const order = await commerceRepo.getOrder(scope, entityId);
    const states = order?.system_states || {};
    states.canonical = targetStatus;
    await commerceRepo.updateOrder(scope, entityId, {
      status: targetStatus,
      system_states: JSON.stringify(states),
      has_conflict: 0,
      conflict_domain: null,
      conflict_detected: null,
      recommended_action: null,
      last_sync_at: new Date().toISOString(),
      last_update: new Date().toISOString()
    });
  } else if (entityType === 'payment' || entityType === 'refund') {
    const payment = await commerceRepo.getPayment(scope, entityId);
    const states = payment?.system_states || {};
    states.canonical = targetStatus;
    await commerceRepo.updatePayment(scope, entityId, {
      status: targetStatus,
      system_states: JSON.stringify(states),
      conflict_detected: null,
      recommended_action: null,
      last_update: new Date().toISOString()
    });
  } else if (entityType === 'return') {
    const ret = await commerceRepo.getReturn(scope, entityId);
    const states = ret?.system_states || {};
    states.canonical = targetStatus;
    await commerceRepo.updateReturn(scope, entityId, {
      status: targetStatus,
      system_states: JSON.stringify(states),
      conflict_detected: null,
      recommended_action: null,
      last_update: new Date().toISOString()
    });
  } else {
    throw new Error(`Unsupported entity_type for resolution: ${entityType}`);
  }

  // 2. Log system state change
  await reconRepo.insertSystemState(scope, {
    entity_type: entityType,
    entity_id: entityId,
    system: 'canonical',
    state_key: 'status',
    state_value: targetStatus
  });

  // 3. Log canonical decision
  await reconRepo.insertCanonicalDecision(scope, {
    entity_type: entityType,
    entity_id: entityId,
    field_key: 'status',
    chosen_system: issue.source_of_truth_system || 'canonical',
    chosen_value: targetStatus,
    candidates: issue.actual_states || {},
    reason: reason || 'Applied source-of-truth status to canonical state',
    issue_id: issue.id,
    case_id: issue.case_id || null,
    decided_by: userId
  });

  // 4. Update the issue itself
  await reconRepo.updateIssue(scope, issue.id, {
    status: 'resolved',
    expected_state: targetStatus,
    resolved_at: new Date().toISOString(),
    resolution_plan: reason || 'Auto-applied source-of-truth status'
  });

  // 5. Recalculate case conflict state
  if (issue.case_id) {
    await recalcCaseConflictState(scope, issue.case_id);
  }

  // 6. Audit log
  await auditRepo.logEvent(scope, {
    actorId: userId,
    action: 'RECONCILIATION_AUTO_APPLIED',
    entityType: 'reconciliation_issue',
    entityId: issue.id,
    metadata: {
      entity_type: entityType,
      entity_id: entityId,
      chosen_system: issue.source_of_truth_system || 'canonical',
      chosen_value: targetStatus,
      case_id: issue.case_id || null
    }
  });
}

// GET /api/reconciliation/issues
router.get('/issues', async (req: MultiTenantRequest, res) => {
  try {
    if (!req.tenantId || !req.workspaceId) {
      return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
    }
    const scope = { tenantId: req.tenantId, workspaceId: req.workspaceId };
    const filters = {
      status: req.query.status as string | undefined,
      severity: req.query.severity as string | undefined,
      entity_type: req.query.entity_type as string | undefined,
      issue_type: req.query.issue_type as string | undefined,
      case_id: req.query.case_id as string | undefined,
    };

    const issues = await reconRepo.listIssues(scope, filters);
    res.json(issues);
  } catch (error) {
    console.error('Error listing reconciliation issues:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list reconciliation issues');
  }
});

// GET /api/reconciliation/issues/:id
router.get('/issues/:id', async (req: MultiTenantRequest, res) => {
  try {
    if (!req.tenantId || !req.workspaceId) {
      return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
    }
    const scope = { tenantId: req.tenantId, workspaceId: req.workspaceId };
    const issue = await reconRepo.getIssue(scope, req.params.id);

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
    if (!req.tenantId || !req.workspaceId) {
      return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
    }
    const scope = { tenantId: req.tenantId, workspaceId: req.workspaceId };
    const metrics = await reconRepo.getMetrics(scope);
    res.json(metrics);
  } catch (error) {
    console.error('Error fetching reconciliation metrics:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch reconciliation metrics');
  }
});

// PATCH /api/reconciliation/issues/:id/status
router.patch('/issues/:id/status', requirePermission('cases.write'), async (req: MultiTenantRequest, res) => {
  try {
    if (!req.tenantId || !req.workspaceId) {
      return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
    }
    const scope = { tenantId: req.tenantId, workspaceId: req.workspaceId };
    const nextStatus = String(req.body?.status || '').trim();
    const resolutionPlan = typeof req.body?.resolution_plan === 'string' && req.body.resolution_plan.trim().length > 0
        ? req.body.resolution_plan.trim()
        : null;
    const expectedState = typeof req.body?.expected_state === 'string' && req.body.expected_state.trim().length > 0
        ? req.body.expected_state.trim()
        : null;

    if (!nextStatus) {
      return sendError(res, 400, 'INVALID_RECONCILIATION_STATUS', 'status is required');
    }

    const issue = await reconRepo.getIssue(scope, req.params.id);
    if (!issue) return sendError(res, 404, 'RECONCILIATION_ISSUE_NOT_FOUND', 'Reconciliation issue not found');

    const fromStatus = issue.status as keyof typeof reconciliationIssueTransitions;
    const toStatus = nextStatus as keyof typeof reconciliationIssueTransitions;
    if (!fromStatus || !toStatus || !reconciliationIssueTransitions[fromStatus] || !canTransition(fromStatus, toStatus, reconciliationIssueTransitions)) {
      return sendError(res, 400, 'INVALID_RECONCILIATION_TRANSITION', 'Invalid reconciliation status transition', {
        from: issue.status,
        to: nextStatus,
      });
    }

    const updates: any = { status: nextStatus };
    if (resolutionPlan) updates.resolution_plan = resolutionPlan;
    if (expectedState) updates.expected_state = expectedState;
    if (nextStatus === 'resolved') updates.resolved_at = new Date().toISOString();

    await reconRepo.updateIssue(scope, req.params.id, updates);

    if (issue.case_id && ['resolved', 'ignored'].includes(nextStatus)) {
      await recalcCaseConflictState(scope, issue.case_id);
    }

    await auditRepo.logEvent(scope, {
      actorId: req.userId || 'system',
      action: 'RECONCILIATION_ISSUE_STATUS_CHANGED',
      entityType: 'reconciliation_issue',
      entityId: req.params.id,
      oldValue: { status: issue.status },
      newValue: { status: nextStatus },
      metadata: {
        resolution_plan: resolutionPlan,
        expected_state: expectedState,
      },
    });

    const updated = await reconRepo.getIssue(scope, req.params.id);
    res.json(updated);
  } catch (error) {
    console.error('Error updating reconciliation issue status:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update reconciliation issue');
  }
});

// POST /api/reconciliation/issues/:id/resolve-apply
router.post('/issues/:id/resolve-apply', requirePermission('cases.write'), async (req: MultiTenantRequest, res) => {
  try {
    if (!req.tenantId || !req.workspaceId) {
      return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
    }
    const scope = { tenantId: req.tenantId, workspaceId: req.workspaceId };
    const issue = await reconRepo.getIssue(scope, req.params.id);
    if (!issue) return sendError(res, 404, 'RECONCILIATION_ISSUE_NOT_FOUND', 'Reconciliation issue not found');
    
    if (!['open', 'in_progress', 'escalated'].includes(issue.status)) {
      return sendError(res, 400, 'RECONCILIATION_ISSUE_NOT_ACTIONABLE', 'Issue must be open, in_progress, or escalated');
    }

    const actualStates = typeof issue.actual_states === 'string' ? JSON.parse(issue.actual_states) : (issue.actual_states || {});
    const sourceSystem = issue.source_of_truth_system || null;
    const inferredStatus = sourceSystem && actualStates && typeof actualStates === 'object' ? actualStates[sourceSystem] : null;
    const targetStatus = (typeof req.body?.target_status === 'string' && req.body.target_status.trim()) || issue.expected_state || inferredStatus || null;
    
    if (!targetStatus) {
      return sendError(res, 400, 'RECONCILIATION_TARGET_STATUS_MISSING', 'Could not infer target status to apply');
    }

    await resolveIssueBySourceOfTruth({
      tenantId: req.tenantId,
      workspaceId: req.workspaceId,
      userId: req.userId || 'system',
      issue,
      targetStatus: String(targetStatus),
      reason: typeof req.body?.reason === 'string' && req.body.reason.trim().length > 0
          ? req.body.reason.trim()
          : 'Auto-applied source-of-truth status',
    });

    const updated = await reconRepo.getIssue(scope, req.params.id);
    res.json(updated);
  } catch (error) {
    console.error('Error applying reconciliation resolution:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to apply reconciliation resolution');
  }
});

// POST /api/reconciliation/process-open
router.post('/process-open', requirePermission('cases.write'), async (req: MultiTenantRequest, res) => {
  try {
    if (!req.tenantId || !req.workspaceId) {
      return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
    }
    const scope = { tenantId: req.tenantId, workspaceId: req.workspaceId };
    const limitRaw = Number(req.body?.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(200, Math.trunc(limitRaw)) : 50;
    
    // We can't pass the full complex criteria to listIssues yet, so we fetch and filter
    const allActive = await reconRepo.listIssues(scope, {});
    const issues = allActive.filter(i => 
      ['open', 'in_progress'].includes(i.status) && 
      i.source_of_truth_system && 
      (i.expected_state || i.actual_states)
    ).slice(0, limit);

    const resolvedIds: string[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];
    
    for (const issue of issues) {
      try {
        const actualStates = typeof issue.actual_states === 'string' ? JSON.parse(issue.actual_states) : (issue.actual_states || {});
        const inferredStatus = issue.source_of_truth_system && actualStates && typeof actualStates === 'object'
            ? actualStates[issue.source_of_truth_system]
            : null;
        const targetStatus = issue.expected_state || inferredStatus || null;
        
        if (!targetStatus) {
          skipped.push({ id: issue.id, reason: 'target_status_unavailable' });
          continue;
        }

        await resolveIssueBySourceOfTruth({
          tenantId: req.tenantId,
          workspaceId: req.workspaceId,
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
      scanned: issues.length,
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
