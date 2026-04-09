import { Router } from 'express';
import { getDb } from '../db/client.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { parseRow, logAudit } from '../db/utils.js';
import { sendError } from '../http/errors.js';

const router = Router();
router.use(extractMultiTenant);

type PolicyDecision = 'allow' | 'conditional' | 'approval_required' | 'block';

function asArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

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

function compareValue(operator: string, left: any, right: any): boolean {
  switch (operator) {
    case 'eq':
      return left === right;
    case 'neq':
      return left !== right;
    case 'gt':
      return Number(left) > Number(right);
    case 'gte':
      return Number(left) >= Number(right);
    case 'lt':
      return Number(left) < Number(right);
    case 'lte':
      return Number(left) <= Number(right);
    case 'in':
      return Array.isArray(right) ? right.includes(left) : false;
    case 'contains':
      if (typeof left === 'string' && typeof right === 'string') return left.toLowerCase().includes(right.toLowerCase());
      if (Array.isArray(left)) return left.includes(right);
      return false;
    case 'exists':
      return left !== undefined && left !== null;
    default:
      return false;
  }
}

function ruleMatches(rule: any, context: Record<string, any>, actionType: string | null): boolean {
  const conditions = asArray(rule.conditions);
  const actionMapping = asObject(rule.action_mapping);
  const allowedActions = asArray(actionMapping.action_types);
  if (allowedActions.length > 0 && actionType && !allowedActions.includes(actionType)) return false;
  if (allowedActions.length > 0 && !actionType) return false;

  return conditions.every((c) => {
    const field = typeof c?.field === 'string' ? c.field : '';
    const operator = typeof c?.operator === 'string' ? c.operator : 'eq';
    const expected = c?.value;
    if (!field) return false;
    const actual = getByPath(context, field);
    return compareValue(operator, actual, expected);
  });
}

function resolveDecision(rule: any): { decision: PolicyDecision; requiresApproval: boolean; reason: string | null } {
  const actionMapping = asObject(rule.action_mapping);
  const approvalMapping = asObject(rule.approval_mapping);
  const rawDecision = String(actionMapping.decision || '').trim().toLowerCase();

  if (rawDecision === 'block') return { decision: 'block', requiresApproval: false, reason: actionMapping.reason || null };
  if (rawDecision === 'approval_required') {
    return { decision: 'approval_required', requiresApproval: true, reason: actionMapping.reason || null };
  }
  if (rawDecision === 'conditional') {
    return { decision: 'conditional', requiresApproval: false, reason: actionMapping.reason || null };
  }
  if (rawDecision === 'allow') return { decision: 'allow', requiresApproval: false, reason: actionMapping.reason || null };

  if (approvalMapping.required === true) {
    return { decision: 'approval_required', requiresApproval: true, reason: approvalMapping.reason || null };
  }
  if (actionMapping.block === true) return { decision: 'block', requiresApproval: false, reason: actionMapping.reason || null };
  if (actionMapping.conditional === true) return { decision: 'conditional', requiresApproval: false, reason: actionMapping.reason || null };
  return { decision: 'allow', requiresApproval: false, reason: null };
}

function evaluatePolicyRules(db: any, tenantId: string, entityType: string, actionType: string | null, context: Record<string, any>) {
  const rules = db
    .prepare(`
      SELECT *
      FROM policy_rules
      WHERE tenant_id = ? AND entity_type = ? AND is_active = 1
      ORDER BY created_at ASC
    `)
    .all(tenantId, entityType) as any[];

  const matchedRules: any[] = [];
  let finalDecision: PolicyDecision = 'allow';
  let requiresApproval = false;
  let matchedRuleId: string | null = null;
  let matchedRule: any | null = null;
  let reason: string | null = null;
  let conflictDetected = false;
  let conflictingRuleIds: string[] = [];

  const priorityOrder: PolicyDecision[] = ['allow', 'conditional', 'approval_required', 'block'];
  const decisionRank = (d: PolicyDecision) => priorityOrder.indexOf(d);

  for (const rule of rules) {
    if (!ruleMatches(rule, context, actionType)) continue;
    const resolved = resolveDecision(rule);
    matchedRules.push({
      id: rule.id,
      name: rule.name,
      decision: resolved.decision,
    });

    if (decisionRank(resolved.decision) >= decisionRank(finalDecision)) {
      finalDecision = resolved.decision;
      requiresApproval = resolved.requiresApproval;
      matchedRuleId = rule.id;
      matchedRule = rule;
      reason = resolved.reason || `Matched rule: ${rule.name}`;
    }
  }

  if (!matchedRules.length) {
    reason = 'No active rule matched. Default allow.';
  } else {
    const uniqueDecisions = Array.from(new Set(matchedRules.map((r) => r.decision)));
    if (uniqueDecisions.length > 1) {
      conflictDetected = true;
      conflictingRuleIds = matchedRules.map((r) => r.id);
      finalDecision = 'approval_required';
      requiresApproval = true;
      reason = `Policy conflict detected across ${uniqueDecisions.length} decisions: ${uniqueDecisions.join(', ')}`;
    }
  }

  return { matchedRules, finalDecision, requiresApproval, matchedRuleId, matchedRule, reason, conflictDetected, conflictingRuleIds };
}

function normalizeRiskLevel(value: unknown): 'low' | 'medium' | 'high' | 'critical' {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'critical') return 'critical';
  if (normalized === 'high') return 'high';
  if (normalized === 'medium') return 'medium';
  return 'low';
}

function resolveAssigneeByRole(db: any, tenantId: string, workspaceId: string, requiredRole: string | null): string | null {
  if (!requiredRole) return null;
  const member = db
    .prepare(`
      SELECT m.user_id
      FROM members m
      JOIN roles r ON r.id = m.role_id
      WHERE m.tenant_id = ? AND m.workspace_id = ?
        AND m.status = 'active' AND lower(r.name) = lower(?)
      ORDER BY m.joined_at ASC
      LIMIT 1
    `)
    .get(tenantId, workspaceId, requiredRole) as { user_id?: string } | undefined;
  return member?.user_id || null;
}

function persistPolicyEvaluation(db: any, params: {
  id: string;
  tenantId: string;
  workspaceId: string;
  entityType: string;
  actionType: string | null;
  caseId: string | null;
  context: Record<string, any>;
  matchedRules: any[];
  matchedRuleId: string | null;
  decision: PolicyDecision;
  requiresApproval: boolean;
  conflictDetected: boolean;
  conflictingRuleIds: string[];
  reason: string | null;
}) {
  const {
    id,
    tenantId,
    workspaceId,
    entityType,
    actionType,
    caseId,
    context,
    matchedRules,
    matchedRuleId,
    decision,
    requiresApproval,
    conflictDetected,
    conflictingRuleIds,
    reason,
  } = params;

  try {
    db.prepare(`
      INSERT INTO policy_evaluations (
        id, tenant_id, workspace_id, entity_type, action_type, case_id,
        input_context, evaluated_rules, matched_rule_id, decision, requires_approval,
        conflict_detected, conflicting_rule_ids, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      tenantId,
      workspaceId,
      entityType,
      actionType,
      caseId,
      JSON.stringify(context),
      JSON.stringify(matchedRules),
      matchedRuleId,
      decision,
      requiresApproval ? 1 : 0,
      conflictDetected ? 1 : 0,
      JSON.stringify(conflictingRuleIds),
      reason,
    );
  } catch {
    // Backward compatibility for DBs where new conflict columns don't exist yet.
    db.prepare(`
      INSERT INTO policy_evaluations (
        id, tenant_id, workspace_id, entity_type, action_type, case_id,
        input_context, evaluated_rules, matched_rule_id, decision, requires_approval, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      tenantId,
      workspaceId,
      entityType,
      actionType,
      caseId,
      JSON.stringify(context),
      JSON.stringify(matchedRules),
      matchedRuleId,
      decision,
      requiresApproval ? 1 : 0,
      reason,
    );
  }
}

// GET /api/policy/rules
router.get('/rules', requirePermission('settings.read'), (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    const { entity_type, is_active } = req.query;
    let query = 'SELECT * FROM policy_rules WHERE tenant_id = ?';
    const params: any[] = [req.tenantId];

    if (entity_type) {
      query += ' AND entity_type = ?';
      params.push(entity_type);
    }
    if (is_active !== undefined) {
      query += ' AND is_active = ?';
      params.push(String(is_active) === 'true' ? 1 : 0);
    }
    query += ' ORDER BY created_at DESC';
    const rows = db.prepare(query).all(...params);
    res.json(rows.map((r: any) => parseRow(r)));
  } catch (error) {
    console.error('Error listing policy rules:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list policy rules');
  }
});

// POST /api/policy/rules
router.post('/rules', requirePermission('settings.write'), (req: MultiTenantRequest, res) => {
  const { name, description, entity_type, conditions, action_mapping, approval_mapping, escalation_mapping, knowledge_article_id } =
    req.body as Record<string, any>;
  if (!name || !entity_type) {
    return sendError(res, 400, 'INVALID_POLICY_RULE', 'name and entity_type are required');
  }

  try {
    const db = getDb();
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO policy_rules (
        id, tenant_id, knowledge_article_id, name, description, entity_type,
        conditions, action_mapping, approval_mapping, escalation_mapping, is_active, version, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, CURRENT_TIMESTAMP)
    `).run(
      id,
      req.tenantId,
      knowledge_article_id || null,
      name,
      description || null,
      entity_type,
      JSON.stringify(Array.isArray(conditions) ? conditions : []),
      JSON.stringify(action_mapping && typeof action_mapping === 'object' ? action_mapping : {}),
      JSON.stringify(approval_mapping && typeof approval_mapping === 'object' ? approval_mapping : {}),
      JSON.stringify(escalation_mapping && typeof escalation_mapping === 'object' ? escalation_mapping : {}),
    );

    logAudit(db, {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId || 'system',
      action: 'POLICY_RULE_CREATED',
      entityType: 'policy_rule',
      entityId: id,
      metadata: { entity_type, name },
    });

    const created = db.prepare('SELECT * FROM policy_rules WHERE id = ? LIMIT 1').get(id);
    res.status(201).json(parseRow(created));
  } catch (error) {
    console.error('Error creating policy rule:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create policy rule');
  }
});

// PATCH /api/policy/rules/:id
router.patch('/rules/:id', requirePermission('settings.write'), (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM policy_rules WHERE id = ? AND tenant_id = ? LIMIT 1').get(req.params.id, req.tenantId) as any;
    if (!existing) return sendError(res, 404, 'POLICY_RULE_NOT_FOUND', 'Policy rule not found');

    const name = typeof req.body?.name === 'string' ? req.body.name : existing.name;
    const description = typeof req.body?.description === 'string' ? req.body.description : existing.description;
    const entityType = typeof req.body?.entity_type === 'string' ? req.body.entity_type : existing.entity_type;
    const conditions = Array.isArray(req.body?.conditions) ? req.body.conditions : asArray(existing.conditions);
    const actionMapping =
      req.body?.action_mapping && typeof req.body.action_mapping === 'object'
        ? req.body.action_mapping
        : asObject(existing.action_mapping);
    const approvalMapping =
      req.body?.approval_mapping && typeof req.body.approval_mapping === 'object'
        ? req.body.approval_mapping
        : asObject(existing.approval_mapping);
    const escalationMapping =
      req.body?.escalation_mapping && typeof req.body.escalation_mapping === 'object'
        ? req.body.escalation_mapping
        : asObject(existing.escalation_mapping);
    const isActive =
      typeof req.body?.is_active === 'boolean' ? (req.body.is_active ? 1 : 0) : existing.is_active;

    db.prepare(`
      UPDATE policy_rules
      SET name = ?, description = ?, entity_type = ?, conditions = ?,
          action_mapping = ?, approval_mapping = ?, escalation_mapping = ?,
          is_active = ?, version = COALESCE(version, 1) + 1
      WHERE id = ? AND tenant_id = ?
    `).run(
      name,
      description,
      entityType,
      JSON.stringify(conditions),
      JSON.stringify(actionMapping),
      JSON.stringify(approvalMapping),
      JSON.stringify(escalationMapping),
      isActive,
      req.params.id,
      req.tenantId,
    );

    logAudit(db, {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId || 'system',
      action: 'POLICY_RULE_UPDATED',
      entityType: 'policy_rule',
      entityId: req.params.id,
      oldValue: { version: existing.version },
      newValue: { version: (existing.version || 1) + 1, is_active: isActive },
    });

    const updated = db.prepare('SELECT * FROM policy_rules WHERE id = ? AND tenant_id = ? LIMIT 1').get(req.params.id, req.tenantId);
    res.json(parseRow(updated));
  } catch (error) {
    console.error('Error updating policy rule:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update policy rule');
  }
});

// POST /api/policy/evaluate
router.post('/evaluate', requirePermission('approvals.read'), (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    const entityType = String(req.body?.entity_type || '').trim();
    const actionType = req.body?.action_type ? String(req.body.action_type) : null;
    const context = req.body?.context && typeof req.body.context === 'object' ? req.body.context : {};
    const caseId = req.body?.case_id ? String(req.body.case_id) : null;
    if (!entityType) return sendError(res, 400, 'INVALID_POLICY_EVAL', 'entity_type is required');

    const evaluation = evaluatePolicyRules(db, req.tenantId!, entityType, actionType, context);

    const evaluationId = crypto.randomUUID();
    persistPolicyEvaluation(db, {
      id: evaluationId,
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
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

    logAudit(db, {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
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
router.post('/evaluate-and-route', requirePermission('cases.write'), (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    const entityType = String(req.body?.entity_type || '').trim();
    const actionType = req.body?.action_type ? String(req.body.action_type) : null;
    const context = req.body?.context && typeof req.body.context === 'object' ? req.body.context : {};
    const caseId = req.body?.case_id ? String(req.body.case_id) : null;
    const actionPayload = req.body?.action_payload && typeof req.body.action_payload === 'object' ? req.body.action_payload : {};
    const requestedBy = req.body?.requested_by ? String(req.body.requested_by) : req.userId || 'system';
    const requestedByType = req.body?.requested_by_type === 'agent' ? 'agent' : 'human';
    const explicitRiskLevel = req.body?.risk_level ? String(req.body.risk_level) : null;
    if (!entityType) return sendError(res, 400, 'INVALID_POLICY_EVAL', 'entity_type is required');

    const evaluation = evaluatePolicyRules(db, req.tenantId!, entityType, actionType, context);
    const evaluationId = crypto.randomUUID();
    persistPolicyEvaluation(db, {
      id: evaluationId,
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
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

      const caseRow = db
        .prepare('SELECT id FROM cases WHERE id = ? AND tenant_id = ? AND workspace_id = ? LIMIT 1')
        .get(caseId, req.tenantId, req.workspaceId) as { id?: string } | undefined;
      if (!caseRow?.id) return sendError(res, 404, 'CASE_NOT_FOUND', 'Case not found');

      const matchedRule = evaluation.matchedRule ? parseRow(evaluation.matchedRule) : null;
      const approvalMapping = matchedRule ? asObject(matchedRule.approval_mapping) : {};
      const requiredRole = approvalMapping.required_role ? String(approvalMapping.required_role) : null;
      const expiresAfterHours =
        Number.isFinite(Number(approvalMapping.expires_after_hours)) && Number(approvalMapping.expires_after_hours) > 0
          ? Number(approvalMapping.expires_after_hours)
          : 24;
      const assignedTo = resolveAssigneeByRole(db, req.tenantId!, req.workspaceId!, requiredRole);
      const riskLevel = normalizeRiskLevel(explicitRiskLevel || getByPath(context, 'risk_level') || getByPath(context, 'case.risk_level'));

      const approvalId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO approval_requests (
          id, case_id, tenant_id, workspace_id, requested_by, requested_by_type,
          action_type, action_payload, risk_level, policy_rule_id, evidence_package,
          status, assigned_to, expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now', ?), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        approvalId,
        caseId,
        req.tenantId,
        req.workspaceId,
        requestedBy,
        requestedByType,
        actionType || 'policy_gated_action',
        JSON.stringify(actionPayload),
        riskLevel,
        evaluation.matchedRuleId,
        JSON.stringify({
          policy_evaluation_id: evaluationId,
          decision: evaluation.finalDecision,
          reason: evaluation.reason,
          matched_rule_id: evaluation.matchedRuleId,
          matched_rules: evaluation.matchedRules,
          context,
        }),
        assignedTo,
        `+${expiresAfterHours} hours`,
      );

      db.prepare(`
        UPDATE cases
        SET approval_state = 'pending',
            active_approval_request_id = ?,
            status = CASE WHEN status IN ('new', 'open', 'waiting', 'in_review') THEN 'pending_approval' ELSE status END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ? AND workspace_id = ?
      `).run(approvalId, caseId, req.tenantId, req.workspaceId);

      approvalRequest = db.prepare('SELECT * FROM approval_requests WHERE id = ? LIMIT 1').get(approvalId);

      logAudit(db, {
        tenantId: req.tenantId!,
        workspaceId: req.workspaceId!,
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
          conflict_detected: evaluation.conflictDetected,
          conflicting_rule_ids: evaluation.conflictingRuleIds,
        },
      });
    }

    logAudit(db, {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
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
      approval_request: approvalRequest ? parseRow(approvalRequest) : null,
    });
  } catch (error) {
    console.error('Error evaluating and routing policy:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to evaluate and route policy');
  }
});

// GET /api/policy/evaluations
router.get('/evaluations', requirePermission('audit.read'), (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    const { decision, entity_type, case_id } = req.query;
    let query = `
      SELECT *
      FROM policy_evaluations
      WHERE tenant_id = ? AND workspace_id = ?
    `;
    const params: any[] = [req.tenantId, req.workspaceId];
    if (decision) {
      query += ' AND decision = ?';
      params.push(decision);
    }
    if (entity_type) {
      query += ' AND entity_type = ?';
      params.push(entity_type);
    }
    if (case_id) {
      query += ' AND case_id = ?';
      params.push(case_id);
    }
    query += ' ORDER BY created_at DESC LIMIT 200';
    const rows = db.prepare(query).all(...params);
    res.json(rows.map((r: any) => parseRow(r)));
  } catch (error) {
    console.error('Error listing policy evaluations:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list policy evaluations');
  }
});

// GET /api/policy/metrics
router.get('/metrics', requirePermission('audit.read'), (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;

    const totals = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN decision = 'allow' THEN 1 ELSE 0 END) as allow_count,
        SUM(CASE WHEN decision = 'conditional' THEN 1 ELSE 0 END) as conditional_count,
        SUM(CASE WHEN decision = 'approval_required' THEN 1 ELSE 0 END) as approval_required_count,
        SUM(CASE WHEN decision = 'block' THEN 1 ELSE 0 END) as block_count,
        SUM(CASE WHEN conflict_detected = 1 THEN 1 ELSE 0 END) as conflict_count
      FROM policy_evaluations
      WHERE tenant_id = ? AND workspace_id = ?
    `).get(tenantId, workspaceId) as any;

    const recent24h = db.prepare(`
      SELECT COUNT(*) as total
      FROM policy_evaluations
      WHERE tenant_id = ? AND workspace_id = ? AND created_at >= datetime('now', '-24 hours')
    `).get(tenantId, workspaceId) as any;

    const topRules = db.prepare(`
      SELECT matched_rule_id as rule_id, COUNT(*) as matches
      FROM policy_evaluations
      WHERE tenant_id = ? AND workspace_id = ? AND matched_rule_id IS NOT NULL
      GROUP BY matched_rule_id
      ORDER BY matches DESC
      LIMIT 5
    `).all(tenantId, workspaceId);

    res.json({
      total_evaluations: totals?.total || 0,
      decision_breakdown: {
        allow: totals?.allow_count || 0,
        conditional: totals?.conditional_count || 0,
        approval_required: totals?.approval_required_count || 0,
        block: totals?.block_count || 0,
      },
      conflict_count: totals?.conflict_count || 0,
      conflict_rate: (totals?.total || 0) > 0 ? (totals?.conflict_count || 0) / (totals?.total || 1) : 0,
      evaluations_last_24h: recent24h?.total || 0,
      top_matched_rules: topRules,
    });
  } catch (error) {
    console.error('Error fetching policy metrics:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch policy metrics');
  }
});

export default router;
