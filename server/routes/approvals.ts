import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getDb }     from '../db/client.js';
import { enqueue }   from '../queue/client.js';
import { JobType }   from '../queue/types.js';
import { logger }    from '../utils/logger.js';

const router = Router();

// GET /api/approvals
router.get('/', (req, res) => {
  const db          = getDb();
  const tenantId    = (req as any).tenantId    ?? 'org_default';
  const workspaceId = (req as any).workspaceId ?? 'ws_default';
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
  const params: any[] = [tenantId, workspaceId];

  if (status)      { query += ' AND a.status = ?';      params.push(status); }
  if (risk_level)  { query += ' AND a.risk_level = ?';  params.push(risk_level); }
  if (assigned_to) { query += ' AND a.assigned_to = ?'; params.push(assigned_to); }
  query += ' ORDER BY a.created_at DESC';

  const approvals = db.prepare(query).all(...params);
  res.json(approvals.map(parseJsonApproval));
});

// GET /api/approvals/:id
router.get('/:id', (req, res) => {
  const db       = getDb();
  const tenantId = (req as any).tenantId ?? 'org_default';

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

  if (!approval) return res.status(404).json({ error: 'Not found' });
  res.json(parseJsonApproval(approval));
});

// GET /api/approvals/:id/context
// Returns a rich context bundle for the approval detail view
router.get('/:id/context', (req, res) => {
  const db          = getDb();
  const tenantId    = (req as any).tenantId ?? 'org_default';

  const approval = db.prepare(`
    SELECT a.*,
           c.case_number, c.type as case_type, c.priority, c.risk_level as case_risk,
           c.status as case_status, c.ai_diagnosis, c.ai_root_cause, c.ai_recommended_action,
           c.approval_state, c.execution_state, c.customer_id,
           cu.canonical_name as customer_name, cu.segment as customer_segment,
           cu.lifetime_value, cu.dispute_rate, cu.refund_rate
    FROM approval_requests a
    LEFT JOIN cases c ON a.case_id = c.id
    LEFT JOIN customers cu ON c.customer_id = cu.id
    WHERE a.id = ? AND a.tenant_id = ?
  `).get(req.params.id, tenantId) as any;

  if (!approval) return res.status(404).json({ error: 'Not found' });

  const parsed = parseJsonApproval(approval);

  // Fetch audit trail for the case
  const auditTrail = approval.case_id
    ? db.prepare(`
        SELECT * FROM audit_events
        WHERE entity_id = ? AND tenant_id = ?
        ORDER BY occurred_at DESC LIMIT 20
      `).all(approval.case_id, tenantId)
    : [];

  // Fetch conversation context
  let conversation: any = null;
  if (approval.case_id) {
    const conv = db.prepare(`
      SELECT * FROM conversations WHERE case_id = ? LIMIT 1
    `).get(approval.case_id) as any;
    if (conv) {
      const messages = db.prepare(`
        SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 5
      `).all(conv.id) as any[];
      const customerMsg = messages.find((m: any) => m.sender_type === 'customer');
      const agentMsg = messages.find((m: any) => m.sender_type === 'agent' || m.sender_type === 'ai');
      conversation = {
        channel: conv.channel,
        latest_customer_message: customerMsg || null,
        latest_agent_message: agentMsg || null,
      };
    }
  }

  // Fetch similar cases for evidence
  const similarCases = approval.case_id
    ? db.prepare(`
        SELECT id, case_number, type, status, updated_at FROM cases
        WHERE customer_id = ? AND id != ? AND tenant_id = ?
        ORDER BY updated_at DESC LIMIT 5
      `).all(approval.customer_id || '', approval.case_id, tenantId)
    : [];

  // Fetch internal notes
  const internalNotes = approval.case_id
    ? db.prepare(`
        SELECT * FROM case_notes WHERE case_id = ? ORDER BY created_at DESC LIMIT 5
      `).all(approval.case_id)
    : [];

  // Build resolve-like conflict info from the case
  const resolve = {
    conflict: {
      title: parsed.ai_diagnosis || `${parsed.action_type || 'Action'} requires approval`,
      summary: parsed.ai_root_cause || parsed.action_payload?.reason || 'Review needed',
      severity: parsed.case_risk || 'medium',
      root_cause: parsed.ai_root_cause || null,
      recommended_action: parsed.ai_recommended_action || null,
    },
  };

  // Build proposed action from the approval payload
  const proposedAction = {
    tool: parsed.action_payload?.tool || parsed.action_type || 'manual',
    action: parsed.action_payload?.action || parsed.action_type || 'review',
    blocked: parsed.status === 'pending',
  };

  // Evidence refs from the case
  let evidenceRefs: string[] = [];
  if (approval.case_id) {
    const caseRow = db.prepare('SELECT ai_evidence_refs FROM cases WHERE id = ?').get(approval.case_id) as any;
    if (caseRow?.ai_evidence_refs) {
      try { evidenceRefs = JSON.parse(caseRow.ai_evidence_refs); } catch {}
    }
  }

  res.json({
    approval: parsed,
    case_state: null,
    resolve,
    conversation,
    audit_trail: auditTrail,
    policy: {
      title: parsed.action_type ? `${parsed.action_type} approval policy` : 'Approval policy',
      description: `Risk level: ${parsed.risk_level || 'standard'}. ${parsed.action_payload?.reason || 'Requires human authorization before execution.'}`,
    },
    proposed_action: proposedAction,
    evidence: {
      refs: evidenceRefs,
      similar_cases: similarCases,
      internal_notes: internalNotes,
    },
  });
});

// POST /api/approvals/:id/decide
// Approved  → marks execution_plan as 'approved' and enqueues RESOLUTION_EXECUTE
// Rejected  → marks plan as 'rejected', escalates case to urgent manual review
router.post('/:id/decide', (req, res) => {
  const db          = getDb();
  const tenantId    = (req as any).tenantId    ?? 'org_default';
  const workspaceId = (req as any).workspaceId ?? 'ws_default';

  const { decision, note, decided_by } = req.body;

  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: 'Decision must be approved or rejected' });
  }

  const approval = db.prepare(
    'SELECT * FROM approval_requests WHERE id = ? AND tenant_id = ?'
  ).get(req.params.id, tenantId) as any;

  if (!approval) return res.status(404).json({ error: 'Not found' });
  if (approval.status !== 'pending') {
    return res.status(400).json({ error: 'Approval is not pending' });
  }

  const now = new Date().toISOString();

  // ── 1. Persist the decision ───────────────────────────────────────────────
  db.prepare(`
    UPDATE approval_requests
    SET status = ?, decision_by = ?, decision_at = ?, decision_note = ?, updated_at = ?
    WHERE id = ?
  `).run(decision, decided_by ?? null, now, note ?? null, now, req.params.id);

  // ── 2. Record in case status history ──────────────────────────────────────
  db.prepare(`
    INSERT INTO case_status_history
      (id, case_id, from_status, to_status, changed_by, changed_by_type, reason, tenant_id)
    VALUES (?, ?, 'approval_pending', ?, ?, 'human', ?, ?)
  `).run(
    randomUUID(),
    approval.case_id,
    decision === 'approved' ? 'approval_approved' : 'approval_rejected',
    decided_by ?? 'unknown',
    note ?? `Approval ${decision}`,
    tenantId,
  );

  if (decision === 'approved') {
    // ── 3a. APPROVED: unlock the execution plan and enqueue execution ────────
    const planId = approval.execution_plan_id;

    if (planId) {
      db.prepare(`
        UPDATE execution_plans SET status = 'approved' WHERE id = ? AND status = 'awaiting_approval'
      `).run(planId);

      enqueue(
        JobType.RESOLUTION_EXECUTE,
        { executionPlanId: planId, mode: 'ai' },
        { tenantId, workspaceId, traceId: approval.id, priority: 5 },
      );

      logger.info('Approval granted — RESOLUTION_EXECUTE enqueued', {
        approvalId: approval.id,
        planId,
        caseId:     approval.case_id,
        decidedBy:  decided_by,
      });
    }

    db.prepare(`
      UPDATE cases SET
        approval_state  = 'approved',
        execution_state = 'queued',
        updated_at      = ?
      WHERE id = ?
    `).run(now, approval.case_id);

  } else {
    // ── 3b. REJECTED: mark plan as rejected, escalate case ──────────────────
    if (approval.execution_plan_id) {
      db.prepare(`
        UPDATE execution_plans SET status = 'rejected' WHERE id = ?
      `).run(approval.execution_plan_id);
    }

    db.prepare(`
      UPDATE cases SET
        approval_state  = 'rejected',
        execution_state = 'idle',
        priority        = 'high',
        updated_at      = ?
      WHERE id = ?
    `).run(now, approval.case_id);

    logger.info('Approval rejected — case escalated to high priority', {
      approvalId: approval.id,
      caseId:     approval.case_id,
      decidedBy:  decided_by,
      reason:     note,
    });
  }

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
