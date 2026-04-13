import { Router } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { createPolicyRepository } from '../data/policy.js';
import { createApprovalRepository } from '../data/approvals.js';
import { createCaseRepository } from '../data/cases.js';
import { createAuditRepository } from '../data/audit.js';
import { sendError } from '../http/errors.js';
import { randomUUID } from 'crypto';

const router = Router();
router.use(extractMultiTenant);

function asObject(value: unknown): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function getByPath(obj: Record<string, any>, path: string): any {
  return path.split('.').reduce((acc: any, key: string) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj);
}

function normalizeRiskLevel(value: unknown): 'low' | 'medium' | 'high' | 'critical' {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'critical') return 'critical';
  if (normalized === 'high') return 'high';
  if (normalized === 'medium') return 'medium';
  return 'low';
}

// GET /api/policy/rules
router.get('/rules', requirePermission('settings.read'), async (req: MultiTenantRequest, res) => {
  try {
    const policyRepo = createPolicyRepository();
    const { entity_type, is_active } = req.query;
    const rules = await policyRepo.listRules(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId! },
      entity_type as string,
      is_active !== undefined ? String(is_active) === 'true' : undefined
    );
    res.json(rules);
  } catch (error) {
    console.error('Error listing policy rules:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list policy rules');
  }
});

// POST /api/policy/rules
router.post('/rules', requirePermission('settings.write'), async (req: MultiTenantRequest, res) => {
  const { name, description, entity_type, conditions, action_mapping, approval_mapping, escalation_mapping, knowledge_article_id } =
    req.body as Record<string, any>;
  if (!name || !entity_type) {
    return sendError(res, 400, 'INVALID_POLICY_RULE', 'name and entity_type are required');
  }

  try {
    const policyRepo = createPolicyRepository();
    const created = await policyRepo.createRule(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId },
      { name, description, entity_type, conditions, action_mapping, approval_mapping, escalation_mapping, knowledge_article_id }
    );
    res.status(201).json(created);
  } catch (error) {
    console.error('Error creating policy rule:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create policy rule');
  }
});

// PATCH /api/policy/rules/:id
router.patch('/rules/:id', requirePermission('settings.write'), async (req: MultiTenantRequest, res) => {
  try {
    const policyRepo = createPolicyRepository();
    const updated = await policyRepo.updateRule(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId },
      req.params.id,
      req.body
    );
    if (!updated) return sendError(res, 404, 'POLICY_RULE_NOT_FOUND', 'Policy rule not found');
    res.json(updated);
  } catch (error) {
    console.error('Error updating policy rule:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update policy rule');
  }
});

// POST /api/policy/evaluate
router.post('/evaluate', requirePermission('approvals.read'), async (req: MultiTenantRequest, res) => {
  try {
    const policyRepo = createPolicyRepository();
    const entityType = String(req.body?.entity_type || '').trim();
    const actionType = req.body?.action_type ? String(req.body.action_type) : null;
    const context = req.body?.context && typeof req.body.context === 'object' ? req.body.context : {};
    const caseId = req.body?.case_id ? String(req.body.case_id) : null;
    
    if (!entityType) return sendError(res, 400, 'INVALID_POLICY_EVAL', 'entity_type is required');

    const evaluation = await policyRepo.evaluate(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId! },
      entityType,
      actionType,
      context,
      caseId
    );

    const evaluationId = randomUUID();
    await policyRepo.persistEvaluation(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId! },
      {
        id: evaluationId,
        entityType,
        actionType,
        caseId,
        context,
        matchedRules: evaluation.matchedRules,
        matchedRuleId: evaluation.matchedRuleId,
        decision: evaluation.finalDecision,
        requiresApproval: evaluation.requiresApproval,
        conflictDetected: evaluation.conflictDetected,
        conflictingRuleIds: evaluation.conflictingRuleIds,
        reason: evaluation.reason,
      }
    );

    const auditRepo = createAuditRepository();
    await auditRepo.logEvent({ tenantId: req.tenantId!, workspaceId: req.workspaceId! }, {
        actorId: req.userId || 'system',
      action: 'POLICY_EVALUATED',
      entityType: 'policy_evaluation',
      entityId: evaluationId,
      metadata: {
        entity_type: entityType,
        action_type: actionType,
        case_id: caseId,
        decision: evaluation.finalDecision,
        requires_approval: evaluation.requiresApproval,
        matched_rule_id: evaluation.matchedRuleId,
        conflict_detected: evaluation.conflictDetected,
        conflicting_rule_ids: evaluation.conflictingRuleIds,
      },
    });

    res.json({
      evaluation_id: evaluationId,
      entity_type: entityType,
      action_type: actionType,
      case_id: caseId,
      decision: evaluation.finalDecision,
      requires_approval: evaluation.requiresApproval,
      matched_rule_id: evaluation.matchedRuleId,
      matched_rules: evaluation.matchedRules,
      conflict_detected: evaluation.conflictDetected,
      conflicting_rule_ids: evaluation.conflictingRuleIds,
      reason: evaluation.reason,
    });
  } catch (error) {
    console.error('Error evaluating policy rules:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to evaluate policy');
  }
});

// POST /api/policy/evaluate-and-route
router.post('/evaluate-and-route', requirePermission('cases.write'), async (req: MultiTenantRequest, res) => {
  try {
    const policyRepo = createPolicyRepository();
    const caseRepo = createCaseRepository();
    const approvalRepo = createApprovalRepository();
    const auditRepo = createAuditRepository();
    
    const entityType = String(req.body?.entity_type || '').trim();
    const actionType = req.body?.action_type ? String(req.body.action_type) : null;
    const context = req.body?.context && typeof req.body.context === 'object' ? req.body.context : {};
    const caseId = req.body?.case_id ? String(req.body.case_id) : null;
    const actionPayload = req.body?.action_payload && typeof req.body.action_payload === 'object' ? req.body.action_payload : {};
    const requestedBy = req.body?.requested_by ? String(req.body.requested_by) : req.userId || 'system';
    const requestedByType = req.body?.requested_by_type === 'agent' ? 'agent' : 'human';
    const explicitRiskLevel = req.body?.risk_level ? String(req.body.risk_level) : null;
    
    if (!entityType) return sendError(res, 400, 'INVALID_POLICY_EVAL', 'entity_type is required');

    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
    const evaluation = await policyRepo.evaluate(scope, entityType, actionType, context, caseId);
    
    const evaluationId = randomUUID();
    await policyRepo.persistEvaluation(scope, {
      id: evaluationId,
      entityType,
      actionType,
      caseId,
      context,
      matchedRules: evaluation.matchedRules,
      matchedRuleId: evaluation.matchedRuleId,
      decision: evaluation.finalDecision,
      requiresApproval: evaluation.requiresApproval,
      conflictDetected: evaluation.conflictDetected,
      conflictingRuleIds: evaluation.conflictingRuleIds,
      reason: evaluation.reason,
    });

    let approvalRequest: any = null;
    if (evaluation.finalDecision === 'approval_required') {
      if (!caseId) {
        return sendError(res, 400, 'APPROVAL_CASE_REQUIRED', 'case_id is required when decision is approval_required');
      }

      const bundle = await caseRepo.getBundle(scope, caseId);
      if (!bundle) return sendError(res, 404, 'CASE_NOT_FOUND', 'Case not found');

      const matchedRule = evaluation.matchedRule;
      const approvalMapping = matchedRule ? asObject(matchedRule.approval_mapping) : {};
      const requiredRole = approvalMapping.required_role ? String(approvalMapping.required_role) : null;
      const expiresAfterHours = Number(approvalMapping.expires_after_hours) || 24;
      
      const assignedTo = await policyRepo.resolveAssigneeByRole(scope, requiredRole);
      const riskLevel = normalizeRiskLevel(explicitRiskLevel || getByPath(context, 'risk_level') || getByPath(context, 'case.risk_level'));

      const approvalId = randomUUID();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + expiresAfterHours);

      approvalRequest = await approvalRepo.create(scope, {
        id: approvalId,
        case_id: caseId,
        requested_by: requestedBy,
        requested_by_type: requestedByType,
        action_type: actionType || 'policy_gated_action',
        action_payload: actionPayload,
        risk_level: riskLevel,
        policy_rule_id: evaluation.matchedRuleId,
        evidence_package: {
          policy_evaluation_id: evaluationId,
          decision: evaluation.finalDecision,
          reason: evaluation.reason,
          matched_rule_id: evaluation.matchedRuleId,
          matched_rules: evaluation.matchedRules,
          context,
        },
        status: 'pending',
        assigned_to: assignedTo,
        expires_at: expiresAt.toISOString(),
      });

      await caseRepo.update(scope, caseId, {
        approval_state: 'pending',
        active_approval_request_id: approvalId,
        status: ['new', 'open', 'waiting', 'in_review'].includes(bundle.case.status) ? 'pending_approval' : bundle.case.status,
        updated_at: new Date().toISOString()
      });

      await auditRepo.logEvent({ tenantId: req.tenantId!, workspaceId: req.workspaceId! }, {
        actorId: req.userId || 'system',
        action: 'POLICY_APPROVAL_REQUEST_CREATED',
        entityType: 'approval_request',
        entityId: approvalId,
        metadata: {
          case_id: caseId,
          policy_evaluation_id: evaluationId,
          matched_rule_id: evaluation.matchedRuleId,
          required_role: requiredRole,
          assigned_to: assignedTo,
        },
      });
    }

    await auditRepo.logEvent({ tenantId: req.tenantId!, workspaceId: req.workspaceId! }, {
        actorId: req.userId || 'system',
      action: 'POLICY_EVALUATED',
      entityType: 'policy_evaluation',
      entityId: evaluationId,
      metadata: {
        entity_type: entityType,
        action_type: actionType,
        case_id: caseId,
        decision: evaluation.finalDecision,
        requires_approval: evaluation.requiresApproval,
        matched_rule_id: evaluation.matchedRuleId,
        routed_to_approval: !!approvalRequest,
      },
    });

    res.json({
      evaluation_id: evaluationId,
      entity_type: entityType,
      action_type: actionType,
      case_id: caseId,
      decision: evaluation.finalDecision,
      requires_approval: evaluation.requiresApproval,
      matched_rule_id: evaluation.matchedRuleId,
      matched_rules: evaluation.matchedRules,
      conflict_detected: evaluation.conflictDetected,
      conflicting_rule_ids: evaluation.conflictingRuleIds,
      reason: evaluation.reason,
      approval_request: approvalRequest,
    });
  } catch (error) {
    console.error('Error evaluating and routing policy:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to evaluate and route policy');
  }
});

// GET /api/policy/evaluations
router.get('/evaluations', requirePermission('audit.read'), async (req: MultiTenantRequest, res) => {
  try {
    const policyRepo = createPolicyRepository();
    const { decision, entity_type, case_id } = req.query;
    const evaluations = await policyRepo.listEvaluations(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId! },
      { 
        decision: decision as string, 
        entityType: entity_type as string, 
        caseId: case_id as string 
      }
    );
    res.json(evaluations);
  } catch (error) {
    console.error('Error listing policy evaluations:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list policy evaluations');
  }
});

// GET /api/policy/metrics
router.get('/metrics', requirePermission('audit.read'), async (req: MultiTenantRequest, res) => {
  try {
    const policyRepo = createPolicyRepository();
    const metrics = await policyRepo.getMetrics({ 
      tenantId: req.tenantId!, 
      workspaceId: req.workspaceId! 
    });
    res.json(metrics);
  } catch (error) {
    console.error('Error fetching policy metrics:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch policy metrics');
  }
});

export default router;




