import { Router } from 'express';
import { getDb } from '../db/client.js';
import { approvalTransitions, canTransition } from '../contracts/stateMachines.js';
import { sendError } from '../http/errors.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { logAudit } from '../db/utils.js';

const router = Router();
router.use(extractMultiTenant);
router.use(requirePermission('approvals.read'));

function applyCaseApprovalOutcome(db: any, tenantId: string, workspaceId: string, caseId: string, decision: string) {
  if (decision === 'approved') {
    db.prepare(`
      UPDATE cases
      SET approval_state = 'approved',
          active_approval_request_id = NULL,
          status = CASE WHEN status = 'pending_approval' THEN 'pending_execution' ELSE status END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).run(caseId, tenantId, workspaceId);
    return;
  }

  if (decision === 'rejected') {
    db.prepare(`
      UPDATE cases
      SET approval_state = 'rejected',
          active_approval_request_id = NULL,
          status = CASE WHEN status = 'pending_approval' THEN 'in_review' ELSE status END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).run(caseId, tenantId, workspaceId);
    return;
  }

  if (decision === 'expired') {
    db.prepare(`
      UPDATE cases
      SET approval_state = 'expired',
          active_approval_request_id = NULL,
          status = CASE WHEN status = 'pending_approval' THEN 'escalated' ELSE status END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).run(caseId, tenantId, workspaceId);
    return;
  }
}

function resolveAssigneeByRole(db: any, tenantId: string, workspaceId: string, roleName: string): string | null {
  const row = db.prepare(`
    SELECT m.user_id
    FROM members m
    JOIN roles r ON r.id = m.role_id
    WHERE m.tenant_id = ? AND m.workspace_id = ?
      AND m.status = 'active'
      AND lower(r.name) = lower(?)
    ORDER BY m.joined_at ASC
    LIMIT 1
  `).get(tenantId, workspaceId, roleName) as { user_id?: string } | undefined;
  return row?.user_id || null;
}

// GET /api/approvals
router.get('/', (req: MultiTenantRequest, res) => {
  const db = getDb();
  if (!req.tenantId) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant context is missing');
  const tenantId = req.tenantId;
  const { status, risk_level, assigned_to } = req.query;

  let query = `
    SELECT a.*,
           c.case_number, c.type as case_type, c.priority as case_priority, c.risk_level as case_risk,
           cu.canonical_name as customer_name, cu.segment as customer_segment,
           u.name as assigned_user_name
    FROM approval_requests a
    LEFT JOIN cases c ON a.case_id = c.id
    LEFT JOIN customers cu ON c.customer_id = cu.id
    LEFT JOIN users u ON a.assigned_to = u.id
    WHERE a.tenant_id = ?
  `;
  const params: any[] = [tenantId];

  if (status) { query += ' AND a.status = ?'; params.push(status); }
  if (risk_level) { query += ' AND a.risk_level = ?'; params.push(risk_level); }
  if (assigned_to) { query += ' AND a.assigned_to = ?'; params.push(assigned_to); }
  query += ' ORDER BY a.created_at DESC';

  const approvals = db.prepare(query).all(...params);
  res.json(approvals.map(parseJsonApproval));
});

// GET /api/approvals/queue
router.get('/queue', (req: MultiTenantRequest, res) => {
  const db = getDb();
  if (!req.tenantId || !req.workspaceId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  }

  const tenantId = req.tenantId;
  const workspaceId = req.workspaceId;
  const { status, risk_level, assigned_to, action_type } = req.query;

  let query = `
    SELECT a.*,
           c.case_number, c.type as case_type, c.priority as case_priority, c.risk_level as case_risk, c.status as case_status,
           cu.canonical_name as customer_name, cu.segment as customer_segment,
           u.name as assigned_user_name,
           pr.name as policy_rule_name
    FROM approval_requests a
    LEFT JOIN cases c ON a.case_id = c.id
    LEFT JOIN customers cu ON c.customer_id = cu.id
    LEFT JOIN users u ON a.assigned_to = u.id
    LEFT JOIN policy_rules pr ON pr.id = a.policy_rule_id
    WHERE a.tenant_id = ? AND a.workspace_id = ?
  `;
  const params: any[] = [tenantId, workspaceId];

  if (status) { query += ' AND a.status = ?'; params.push(status); }
  else { query += " AND a.status IN ('pending','delegated')"; }
  if (risk_level) { query += ' AND a.risk_level = ?'; params.push(risk_level); }
  if (assigned_to) { query += ' AND a.assigned_to = ?'; params.push(assigned_to); }
  if (action_type) { query += ' AND a.action_type = ?'; params.push(action_type); }

  query += `
    ORDER BY
      CASE a.risk_level WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,
      COALESCE(a.expires_at, datetime('now', '+10 years')) ASC,
      a.created_at ASC
    LIMIT 300
  `;

  const approvals = db.prepare(query).all(...params);
  res.json(approvals.map(parseJsonApproval));
});

// GET /api/approvals/metrics
router.get('/metrics', requirePermission('audit.read'), (req: MultiTenantRequest, res) => {
  const db = getDb();
  if (!req.tenantId || !req.workspaceId) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  const tenantId = req.tenantId;
  const workspaceId = req.workspaceId;

  const totals = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
      SUM(CASE WHEN status = 'delegated' THEN 1 ELSE 0 END) as delegated_count,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
      SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired_count
    FROM approval_requests
    WHERE tenant_id = ? AND workspace_id = ?
  `).get(tenantId, workspaceId) as any;

  const avgDecision = db.prepare(`
    SELECT AVG((julianday(decision_at) - julianday(created_at)) * 24.0) as avg_hours
    FROM approval_requests
    WHERE tenant_id = ? AND workspace_id = ?
      AND decision_at IS NOT NULL
      AND status IN ('approved', 'rejected')
  `).get(tenantId, workspaceId) as any;

  const expiringSoon = db.prepare(`
    SELECT COUNT(*) as total
    FROM approval_requests
    WHERE tenant_id = ? AND workspace_id = ?
      AND status IN ('pending', 'delegated')
      AND expires_at IS NOT NULL
      AND expires_at <= datetime('now', '+6 hours')
  `).get(tenantId, workspaceId) as any;

  res.json({
    total_requests: totals?.total || 0,
    status_breakdown: {
      pending: totals?.pending_count || 0,
      delegated: totals?.delegated_count || 0,
      approved: totals?.approved_count || 0,
      rejected: totals?.rejected_count || 0,
      expired: totals?.expired_count || 0,
    },
    avg_decision_hours: avgDecision?.avg_hours ? Number(avgDecision.avg_hours) : 0,
    expiring_in_6h: expiringSoon?.total || 0,
  });
});

// GET /api/approvals/:id
router.get('/:id', (req: MultiTenantRequest, res) => {
  const db = getDb();
  if (!req.tenantId) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant context is missing');
  const tenantId = req.tenantId;
  const approval = db.prepare(`
    SELECT a.*,
           c.case_number, c.type as case_type, c.priority, c.risk_level as case_risk,
           cu.canonical_name as customer_name, cu.segment as customer_segment,
           cu.lifetime_value, cu.dispute_rate, cu.refund_rate
    FROM approval_requests a
    LEFT JOIN cases c ON a.case_id = c.id
    LEFT JOIN customers cu ON c.customer_id = cu.id
    WHERE a.id = ? AND a.tenant_id = ?
  `).get(req.params.id, tenantId);

  if (!approval) return sendError(res, 404, 'APPROVAL_NOT_FOUND', 'Approval request not found');
  res.json(parseJsonApproval(approval));
});

// POST /api/approvals/:id/decide
router.post('/:id/decide', requirePermission('approvals.decide'), (req: MultiTenantRequest, res) => {
  const db = getDb();
  if (!req.tenantId) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant context is missing');
  const tenantId = req.tenantId;
  const { decision, note, decided_by } = req.body;

  if (!['approved', 'rejected'].includes(decision)) {
    return sendError(res, 400, 'INVALID_APPROVAL_DECISION', 'Decision must be approved or rejected');
  }

  const approval = db.prepare(`SELECT * FROM approval_requests WHERE id = ? AND tenant_id = ?`).get(req.params.id, tenantId) as any;
  if (!approval) return sendError(res, 404, 'APPROVAL_NOT_FOUND', 'Approval request not found');

  const fromStatus = approval.status as keyof typeof approvalTransitions;
  const toStatus = decision as keyof typeof approvalTransitions;
  if (!fromStatus || !toStatus || !approvalTransitions[fromStatus] || !canTransition(fromStatus, toStatus, approvalTransitions)) {
    return sendError(res, 400, 'INVALID_APPROVAL_TRANSITION', 'Invalid approval status transition', {
      from: approval.status,
      to: decision,
    });
  }

  db.prepare(`
    UPDATE approval_requests 
    SET status=?, decision_by=?, decision_at=datetime('now'), decision_note=?, updated_at=datetime('now')
    WHERE id=?
  `).run(decision, decided_by || null, note || null, req.params.id);

  applyCaseApprovalOutcome(db, tenantId, approval.workspace_id || req.workspaceId!, approval.case_id, decision);

  logAudit(db, {
    tenantId,
    workspaceId: approval.workspace_id || req.workspaceId!,
    actorId: (decided_by || req.userId || 'system') as string,
    action: 'APPROVAL_DECIDED',
    entityType: 'approval_request',
    entityId: req.params.id,
    oldValue: { status: approval.status },
    newValue: { status: decision, note: note || null },
    metadata: {
      case_id: approval.case_id,
      action_type: approval.action_type,
      policy_rule_id: approval.policy_rule_id || null,
    },
  });

  res.json({ success: true, decision });
});

// POST /api/approvals/bulk-decide
router.post('/bulk-decide', requirePermission('approvals.decide'), (req: MultiTenantRequest, res) => {
  const db = getDb();
  if (!req.tenantId || !req.workspaceId) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  const tenantId = req.tenantId;
  const workspaceId = req.workspaceId;
  const { approval_ids, decision, note, decided_by } = req.body as {
    approval_ids?: string[];
    decision?: 'approved' | 'rejected';
    note?: string;
    decided_by?: string;
  };

  if (!Array.isArray(approval_ids) || approval_ids.length === 0) {
    return sendError(res, 400, 'INVALID_BULK_APPROVAL_IDS', 'approval_ids must be a non-empty array');
  }
  if (!decision || !['approved', 'rejected'].includes(decision)) {
    return sendError(res, 400, 'INVALID_APPROVAL_DECISION', 'Decision must be approved or rejected');
  }

  const updated: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  const runUpdate = db.prepare(`
    UPDATE approval_requests
    SET status=?, decision_by=?, decision_at=datetime('now'), decision_note=?, updated_at=datetime('now')
    WHERE id=?
  `);

  for (const approvalId of approval_ids) {
    const approval = db.prepare(`
      SELECT *
      FROM approval_requests
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
      LIMIT 1
    `).get(approvalId, tenantId, workspaceId) as any;

    if (!approval) {
      skipped.push({ id: approvalId, reason: 'not_found' });
      continue;
    }

    const fromStatus = approval.status as keyof typeof approvalTransitions;
    const toStatus = decision as keyof typeof approvalTransitions;
    if (!fromStatus || !toStatus || !approvalTransitions[fromStatus] || !canTransition(fromStatus, toStatus, approvalTransitions)) {
      skipped.push({ id: approvalId, reason: `invalid_transition_${approval.status}_to_${decision}` });
      continue;
    }

    runUpdate.run(decision, decided_by || null, note || null, approvalId);
    applyCaseApprovalOutcome(db, tenantId, workspaceId, approval.case_id, decision);
    updated.push(approvalId);

    logAudit(db, {
      tenantId,
      workspaceId,
      actorId: (decided_by || req.userId || 'system') as string,
      action: 'APPROVAL_DECIDED_BULK',
      entityType: 'approval_request',
      entityId: approvalId,
      oldValue: { status: approval.status },
      newValue: { status: decision, note: note || null },
      metadata: {
        case_id: approval.case_id,
        action_type: approval.action_type,
      },
    });
  }

  res.json({
    success: true,
    decision,
    updated_count: updated.length,
    skipped_count: skipped.length,
    updated_ids: updated,
    skipped,
  });
});

// POST /api/approvals/process-expirations
router.post('/process-expirations', requirePermission('approvals.decide'), (req: MultiTenantRequest, res) => {
  const db = getDb();
  if (!req.tenantId || !req.workspaceId) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  const tenantId = req.tenantId;
  const workspaceId = req.workspaceId;

  const pendingExpired = db.prepare(`
    SELECT *
    FROM approval_requests
    WHERE tenant_id = ? AND workspace_id = ?
      AND status = 'pending'
      AND expires_at IS NOT NULL
      AND expires_at < CURRENT_TIMESTAMP
    ORDER BY expires_at ASC
    LIMIT 500
  `).all(tenantId, workspaceId) as any[];

  const expireStmt = db.prepare(`
    UPDATE approval_requests
    SET status='expired', updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `);

  const expiredIds: string[] = [];
  pendingExpired.forEach((approval) => {
    expireStmt.run(approval.id);
    applyCaseApprovalOutcome(db, tenantId, workspaceId, approval.case_id, 'expired');
    expiredIds.push(approval.id);

    logAudit(db, {
      tenantId,
      workspaceId,
      actorId: req.userId || 'system',
      action: 'APPROVAL_EXPIRED',
      entityType: 'approval_request',
      entityId: approval.id,
      oldValue: { status: 'pending' },
      newValue: { status: 'expired' },
      metadata: {
        case_id: approval.case_id,
        action_type: approval.action_type,
        expires_at: approval.expires_at,
      },
    });
  });

  res.json({
    success: true,
    processed_count: expiredIds.length,
    approval_ids: expiredIds,
  });
});

// POST /api/approvals/:id/delegate
router.post('/:id/delegate', requirePermission('approvals.decide'), (req: MultiTenantRequest, res) => {
  const db = getDb();
  if (!req.tenantId || !req.workspaceId) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  const tenantId = req.tenantId;
  const workspaceId = req.workspaceId;
  const { assigned_to, required_role, note } = req.body as { assigned_to?: string; required_role?: string; note?: string };

  const approval = db.prepare(`
    SELECT *
    FROM approval_requests
    WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    LIMIT 1
  `).get(req.params.id, tenantId, workspaceId) as any;
  if (!approval) return sendError(res, 404, 'APPROVAL_NOT_FOUND', 'Approval request not found');

  const fromStatus = approval.status as keyof typeof approvalTransitions;
  const toStatus = 'delegated' as keyof typeof approvalTransitions;
  if (!fromStatus || !approvalTransitions[fromStatus] || !canTransition(fromStatus, toStatus, approvalTransitions)) {
    return sendError(res, 400, 'INVALID_APPROVAL_TRANSITION', 'Invalid approval status transition', {
      from: approval.status,
      to: 'delegated',
    });
  }

  let assignee = assigned_to || null;
  if (!assignee && required_role && required_role.trim().length > 0) {
    assignee = resolveAssigneeByRole(db, tenantId, workspaceId, required_role.trim());
  }
  if (!assignee) {
    return sendError(res, 400, 'DELEGATION_ASSIGNEE_REQUIRED', 'assigned_to or resolvable required_role is required');
  }

  db.prepare(`
    UPDATE approval_requests
    SET status = 'delegated',
        assigned_to = ?,
        decision_note = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(assignee, note || approval.decision_note || null, req.params.id);

  logAudit(db, {
    tenantId,
    workspaceId,
    actorId: req.userId || 'system',
    action: 'APPROVAL_DELEGATED',
    entityType: 'approval_request',
    entityId: req.params.id,
    oldValue: { status: approval.status, assigned_to: approval.assigned_to || null },
    newValue: { status: 'delegated', assigned_to: assignee },
    metadata: {
      required_role: required_role || null,
      note: note || null,
    },
  });

  const updated = db.prepare('SELECT * FROM approval_requests WHERE id = ? LIMIT 1').get(req.params.id);
  res.json(parseJsonApproval(updated));
});

function parseJsonApproval(row: any) {
  const result = { ...row };
  ['action_payload', 'evidence_package'].forEach(f => {
    if (result[f] && typeof result[f] === 'string') {
      try { result[f] = JSON.parse(result[f]); } catch { result[f] = {}; }
    }
  });
  return result;
}

export default router;
