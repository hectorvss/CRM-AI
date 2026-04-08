import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../db/client.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { buildApprovalContext } from '../services/canonicalState.js';
import { logAudit } from '../db/utils.js';

const router = Router();

router.use(extractMultiTenant);

router.get('/', (req: MultiTenantRequest, res) => {
  const db = getDb();
  const tenantId = req.tenantId ?? 'org_default';
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
    WHERE a.tenant_id = ? AND a.workspace_id = ?
  `;
  const params: any[] = [tenantId, req.workspaceId];

  if (status) {
    query += ' AND a.status = ?';
    params.push(status);
  }
  if (risk_level) {
    query += ' AND a.risk_level = ?';
    params.push(risk_level);
  }
  if (assigned_to) {
    query += ' AND a.assigned_to = ?';
    params.push(assigned_to);
  }
  query += ' ORDER BY a.created_at DESC';

  const approvals = db.prepare(query).all(...params);
  res.json(approvals.map(parseJsonApproval));
});

router.get('/:id/context', (req: MultiTenantRequest, res) => {
  try {
    const context = buildApprovalContext(req.params.id, req.tenantId!, req.workspaceId!);
    if (!context) return res.status(404).json({ error: 'Not found' });
    res.json(context);
  } catch (error) {
    console.error('Error fetching approval context:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', (req: MultiTenantRequest, res) => {
  const db = getDb();
  const approval = db.prepare(`
    SELECT a.*,
           c.case_number, c.type as case_type, c.priority, c.risk_level as case_risk,
           cu.canonical_name as customer_name, cu.segment as customer_segment,
           cu.lifetime_value, cu.dispute_rate, cu.refund_rate
    FROM approval_requests a
    LEFT JOIN cases c ON a.case_id = c.id
    LEFT JOIN customers cu ON c.customer_id = cu.id
    WHERE a.id = ? AND a.tenant_id = ? AND a.workspace_id = ?
  `).get(req.params.id, req.tenantId, req.workspaceId);

  if (!approval) return res.status(404).json({ error: 'Not found' });
  res.json(parseJsonApproval(approval));
});

router.post('/:id/decide', (req: MultiTenantRequest, res) => {
  const db = getDb();
  const tenantId = req.tenantId ?? 'org_default';
  const workspaceId = req.workspaceId ?? 'ws_default';
  const { decision, note, decided_by } = req.body;

  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: 'Decision must be approved or rejected' });
  }

  const approval = db.prepare(
    'SELECT * FROM approval_requests WHERE id = ? AND tenant_id = ? AND workspace_id = ?'
  ).get(req.params.id, tenantId, workspaceId) as any;

  if (!approval) return res.status(404).json({ error: 'Not found' });
  if (approval.status !== 'pending') {
    return res.status(400).json({ error: 'Approval is not pending' });
  }

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE approval_requests
    SET status = ?, decision_by = ?, decision_at = ?, decision_note = ?, updated_at = ?
    WHERE id = ?
  `).run(decision, decided_by ?? null, now, note ?? null, now, req.params.id);

  db.prepare(`
    INSERT INTO case_status_history
      (id, case_id, from_status, to_status, changed_by, changed_by_type, reason, tenant_id)
    VALUES (?, ?, 'approval_pending', ?, ?, 'human', ?, ?)
  `).run(
    randomUUID(),
    approval.case_id,
    decision === 'approved' ? 'approval_approved' : 'approval_rejected',
    decided_by ?? req.userId ?? 'unknown',
    note ?? `Approval ${decision}`,
    tenantId,
  );

  if (decision === 'approved') {
    const planId = approval.execution_plan_id;

    if (planId) {
      db.prepare(`
        UPDATE execution_plans
        SET status = 'approved'
        WHERE id = ? AND status = 'awaiting_approval'
      `).run(planId);

      enqueue(
        JobType.RESOLUTION_EXECUTE,
        { executionPlanId: planId, mode: 'ai' },
        { tenantId, workspaceId, traceId: approval.id, priority: 5 },
      );

      logger.info('Approval granted and execution queued', {
        approvalId: approval.id,
        planId,
        caseId: approval.case_id,
        decidedBy: decided_by,
      });
    }

    db.prepare(`
      UPDATE cases
      SET approval_state = 'approved',
          execution_state = 'queued',
          updated_at = ?
      WHERE id = ?
    `).run(now, approval.case_id);
  } else {
    if (approval.execution_plan_id) {
      db.prepare(`
        UPDATE execution_plans
        SET status = 'rejected'
        WHERE id = ?
      `).run(approval.execution_plan_id);
    }

    db.prepare(`
      UPDATE cases
      SET approval_state = 'rejected',
          execution_state = 'idle',
          priority = 'high',
          updated_at = ?
      WHERE id = ?
    `).run(now, approval.case_id);

    logger.info('Approval rejected and case escalated', {
      approvalId: approval.id,
      caseId: approval.case_id,
      decidedBy: decided_by,
      reason: note,
    });
  }

  logAudit(db, {
    tenantId,
    workspaceId,
    actorId: decided_by ?? req.userId ?? 'unknown',
    action: decision === 'approved' ? 'APPROVAL_APPROVED' : 'APPROVAL_REJECTED',
    entityType: 'approval',
    entityId: approval.id,
    oldValue: { status: approval.status },
    newValue: { status: decision, decision_note: note ?? null },
    metadata: {
      caseId: approval.case_id,
      executionPlanId: approval.execution_plan_id || null,
    },
  });

  res.json({ success: true, decision, caseId: approval.case_id });
});

function parseJsonApproval(row: any) {
  const result = { ...row };
  ['action_payload', 'evidence_package'].forEach(field => {
    if (result[field] && typeof result[field] === 'string') {
      try {
        result[field] = JSON.parse(result[field]);
      } catch {
        result[field] = {};
      }
    }
  });
  return result;
}

export default router;
