import { Router, Response } from 'express';
import { getDb } from '../db/client.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { parseRow, logAudit } from '../db/utils.js';
import { Case, CaseDraftReply } from '../models.js';
import { caseTransitions, canTransition } from '../contracts/stateMachines.js';
import { sendError } from '../http/errors.js';
import { requirePermission } from '../middleware/authorization.js';

const router = Router();

type CaseSlaRow = {
  id: string;
  status: string;
  sla_status?: string | null;
  sla_first_response_deadline?: string | null;
  sla_resolution_deadline?: string | null;
  first_response_at?: string | null;
};

const DRAFT_STATUSES = new Set(['pending_review', 'approved', 'rejected', 'sent']);
const CLOSED_CASE_STATUSES = new Set(['resolved', 'closed']);

// Apply multi-tenant middleware to all case routes.
router.use(extractMultiTenant);
router.use(requirePermission('cases.read'));

function assertTenantWorkspace(req: MultiTenantRequest, res: Response): boolean {
  if (!req.tenantId || !req.workspaceId) {
    sendError(res, 400, 'TENANT_CONTEXT_MISSING', 'Missing tenant/workspace context');
    return false;
  }
  return true;
}

function assertCaseInScope(db: any, req: MultiTenantRequest, res: Response, caseId: string): boolean {
  const existing = db
    .prepare('SELECT id FROM cases WHERE id = ? AND tenant_id = ? AND workspace_id = ?')
    .get(caseId, req.tenantId, req.workspaceId);

  if (!existing) {
    sendError(res, 404, 'CASE_NOT_FOUND', 'Case not found');
    return false;
  }
  return true;
}

function generateCaseNumber(db: any): string {
  const row = db
    .prepare("SELECT COUNT(*) as total FROM cases WHERE strftime('%Y', created_at) = strftime('%Y', 'now')")
    .get() as { total?: number };
  const year = new Date().getFullYear();
  const sequence = String((row?.total || 0) + 1).padStart(5, '0');
  return `CASE-${year}-${sequence}`;
}

function parseIsoDate(value?: string | null): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? null : ts;
}

function deriveSlaStatus(c: CaseSlaRow): 'on_track' | 'at_risk' | 'breached' | 'paused' {
  if (CLOSED_CASE_STATUSES.has(c.status)) return 'on_track';

  const now = Date.now();
  const resolutionDeadline = parseIsoDate(c.sla_resolution_deadline);
  const firstResponseDeadline = parseIsoDate(c.sla_first_response_deadline);

  if (resolutionDeadline !== null) {
    if (now > resolutionDeadline) return 'breached';
    if (now >= resolutionDeadline - 2 * 60 * 60 * 1000) return 'at_risk';
  }

  if (!c.first_response_at && firstResponseDeadline !== null) {
    if (now > firstResponseDeadline) return 'breached';
    if (now >= firstResponseDeadline - 30 * 60 * 1000) return 'at_risk';
  }

  return 'on_track';
}

function computeSlaStatusForResponse(row: any): string {
  const derived = deriveSlaStatus({
    id: row.id,
    status: row.status,
    sla_status: row.sla_status,
    sla_first_response_deadline: row.sla_first_response_deadline,
    sla_resolution_deadline: row.sla_resolution_deadline,
    first_response_at: row.first_response_at,
  });
  return derived || row.sla_status || 'on_track';
}

function syncCaseSlaStatus(db: any, req: MultiTenantRequest, caseId: string): string {
  const caseRow = db
    .prepare(`
      SELECT id, status, sla_status, sla_first_response_deadline, sla_resolution_deadline, first_response_at
      FROM cases
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `)
    .get(caseId, req.tenantId, req.workspaceId) as CaseSlaRow | undefined;

  if (!caseRow) return 'on_track';

  const nextSlaStatus = deriveSlaStatus(caseRow);
  const prevSlaStatus = caseRow.sla_status || 'on_track';

  if (nextSlaStatus !== prevSlaStatus) {
    db.prepare(`
      UPDATE cases
      SET sla_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).run(nextSlaStatus, caseId, req.tenantId, req.workspaceId);

    logAudit(db, {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId!,
      action: 'CASE_SLA_STATUS_UPDATED',
      entityType: 'case',
      entityId: caseId,
      oldValue: { sla_status: prevSlaStatus },
      newValue: { sla_status: nextSlaStatus },
    });
  }

  return nextSlaStatus;
}

// GET /api/cases
router.get('/', (req: MultiTenantRequest, res: Response) => {
  try {
    if (!assertTenantWorkspace(req, res)) return;
    const db = getDb();
    const { status, assigned_user_id, priority, risk_level, q } = req.query;

    let query = `
      SELECT c.*,
             cu.canonical_name as customer_name, cu.canonical_email as customer_email,
             cu.segment as customer_segment,
             u.name as assigned_user_name,
             t.name as assigned_team_name
      FROM cases c
      LEFT JOIN customers cu ON c.customer_id = cu.id
      LEFT JOIN users u ON c.assigned_user_id = u.id
      LEFT JOIN teams t ON c.assigned_team_id = t.id
      WHERE c.tenant_id = ? AND c.workspace_id = ?
    `;
    const params: any[] = [req.tenantId, req.workspaceId];

    if (status) {
      query += ` AND c.status = ?`;
      params.push(status);
    }
    if (assigned_user_id) {
      query += ` AND c.assigned_user_id = ?`;
      params.push(assigned_user_id);
    }
    if (priority) {
      query += ` AND c.priority = ?`;
      params.push(priority);
    }
    if (risk_level) {
      query += ` AND c.risk_level = ?`;
      params.push(risk_level);
    }
    if (q) {
      query += ` AND (c.case_number LIKE ? OR cu.canonical_name LIKE ? OR cu.canonical_email LIKE ?)`;
      const term = `%${q}%`;
      params.push(term, term, term);
    }

    query += ` ORDER BY c.last_activity_at DESC`;

    const cases = db.prepare(query).all(...params);
    res.json(
      cases.map((row: any) => parseRow<Case>({ ...row, sla_status: computeSlaStatusForResponse(row) })),
    );
  } catch (error) {
    console.error('Error fetching cases:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// POST /api/cases
router.post('/', requirePermission('cases.write'), (req: MultiTenantRequest, res: Response) => {
  try {
    if (!assertTenantWorkspace(req, res)) return;
    const db = getDb();

    const {
      customer_id,
      source_system,
      source_channel,
      source_entity_id,
      type,
      sub_type,
      intent,
      intent_confidence,
      status,
      priority,
      severity,
      risk_level,
      assigned_user_id,
      assigned_team_id,
      created_by_user_id,
      sla_policy_id,
      sla_first_response_deadline,
      sla_resolution_deadline,
      order_ids,
      payment_ids,
      return_ids,
      tags,
    } = req.body || {};

    const caseId = crypto.randomUUID();
    const caseNumber = generateCaseNumber(db);
    const initialStatus = status || 'new';
    const initialSlaStatus = deriveSlaStatus({
      id: caseId,
      status: initialStatus,
      sla_status: 'on_track',
      sla_first_response_deadline: sla_first_response_deadline || null,
      sla_resolution_deadline: sla_resolution_deadline || null,
      first_response_at: null,
    });

    db.prepare(`
      INSERT INTO cases (
        id, case_number, tenant_id, workspace_id,
        source_system, source_channel, source_entity_id,
        type, sub_type, intent, intent_confidence,
        status, priority, severity, risk_level,
        assigned_user_id, assigned_team_id, created_by_user_id,
        sla_policy_id, sla_first_response_deadline, sla_resolution_deadline, sla_status,
        customer_id, order_ids, payment_ids, return_ids, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      caseId,
      caseNumber,
      req.tenantId,
      req.workspaceId,
      source_system || 'email',
      source_channel || 'email',
      source_entity_id || null,
      type || 'general_support',
      sub_type || null,
      intent || null,
      intent_confidence ?? null,
      initialStatus,
      priority || 'normal',
      severity || 'S3',
      risk_level || 'low',
      assigned_user_id || null,
      assigned_team_id || null,
      created_by_user_id || req.userId || null,
      sla_policy_id || null,
      sla_first_response_deadline || null,
      sla_resolution_deadline || null,
      initialSlaStatus,
      customer_id || null,
      JSON.stringify(Array.isArray(order_ids) ? order_ids : []),
      JSON.stringify(Array.isArray(payment_ids) ? payment_ids : []),
      JSON.stringify(Array.isArray(return_ids) ? return_ids : []),
      JSON.stringify(Array.isArray(tags) ? tags : []),
    );

    logAudit(db, {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId!,
      action: 'CASE_CREATED',
      entityType: 'case',
      entityId: caseId,
      newValue: {
        case_number: caseNumber,
        customer_id: customer_id || null,
        type: type || 'general_support',
        status: initialStatus,
        priority: priority || 'normal',
        severity: severity || 'S3',
        risk_level: risk_level || 'low',
        sla_status: initialSlaStatus,
      },
    });

    res.status(201).json({ success: true, id: caseId, case_number: caseNumber, sla_status: initialSlaStatus });
  } catch (error) {
    console.error('Error creating case:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// GET /api/cases/:id
router.get('/:id', (req: MultiTenantRequest, res: Response) => {
  try {
    if (!assertTenantWorkspace(req, res)) return;
    const db = getDb();
    const c = db
      .prepare(`
      SELECT c.*,
             cu.canonical_name as customer_name, cu.canonical_email as customer_email,
             cu.segment as customer_segment, cu.lifetime_value, cu.risk_level as customer_risk,
             cu.total_orders, cu.total_spent, cu.dispute_rate, cu.refund_rate,
             u.name as assigned_user_name, u.email as assigned_user_email,
             t.name as assigned_team_name
      FROM cases c
      LEFT JOIN customers cu ON c.customer_id = cu.id
      LEFT JOIN users u ON c.assigned_user_id = u.id
      LEFT JOIN teams t ON c.assigned_team_id = t.id
      WHERE c.id = ? AND c.tenant_id = ? AND c.workspace_id = ?
    `)
      .get(req.params.id, req.tenantId, req.workspaceId) as any;

    if (!c) return sendError(res, 404, 'CASE_NOT_FOUND', 'Case not found');
    res.json(parseRow<Case>({ ...c, sla_status: computeSlaStatusForResponse(c) }));
  } catch (error) {
    console.error('Error fetching case:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// GET /api/cases/:id/notes
router.get('/:id/notes', (req: MultiTenantRequest, res: Response) => {
  try {
    if (!assertTenantWorkspace(req, res)) return;
    const db = getDb();
    if (!assertCaseInScope(db, req, res, req.params.id)) return;

    const notes = db
      .prepare(`
        SELECT n.*, u.name AS created_by_name
        FROM internal_notes n
        LEFT JOIN users u ON u.id = n.created_by
        WHERE n.case_id = ? AND n.tenant_id = ?
        ORDER BY n.created_at DESC
      `)
      .all(req.params.id, req.tenantId);

    res.json(notes.map(parseRow));
  } catch (error) {
    console.error('Error fetching case notes:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// POST /api/cases/:id/notes
router.post('/:id/notes', requirePermission('cases.write'), (req: MultiTenantRequest, res: Response) => {
  try {
    if (!assertTenantWorkspace(req, res)) return;
    const db = getDb();
    if (!assertCaseInScope(db, req, res, req.params.id)) return;

    const { content, created_by } = req.body || {};
    if (!content || typeof content !== 'string' || !content.trim()) {
      return sendError(res, 400, 'NOTE_CONTENT_REQUIRED', 'Note content is required');
    }

    const noteId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO internal_notes (id, case_id, content, created_by, created_by_type, tenant_id)
      VALUES (?, ?, ?, ?, 'human', ?)
    `).run(noteId, req.params.id, content.trim(), created_by || req.userId || null, req.tenantId);

    db.prepare(`
      UPDATE cases
      SET last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).run(req.params.id, req.tenantId, req.workspaceId);

    syncCaseSlaStatus(db, req, req.params.id);

    logAudit(db, {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId!,
      action: 'CASE_NOTE_CREATED',
      entityType: 'case',
      entityId: req.params.id,
      metadata: { note_id: noteId },
    });

    res.status(201).json({ success: true, id: noteId });
  } catch (error) {
    console.error('Error creating case note:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// GET /api/cases/:id/drafts
router.get('/:id/drafts', (req: MultiTenantRequest, res: Response) => {
  try {
    if (!assertTenantWorkspace(req, res)) return;
    const db = getDb();
    if (!assertCaseInScope(db, req, res, req.params.id)) return;

    const drafts = db
      .prepare(`
        SELECT d.*, u.name as reviewed_by_name
        FROM draft_replies d
        LEFT JOIN users u ON u.id = d.reviewed_by
        WHERE d.case_id = ? AND d.tenant_id = ?
        ORDER BY d.generated_at DESC
      `)
      .all(req.params.id, req.tenantId);

    res.json(drafts.map((row: any) => parseRow<CaseDraftReply>(row)));
  } catch (error) {
    console.error('Error fetching case drafts:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// POST /api/cases/:id/drafts
router.post('/:id/drafts', requirePermission('cases.write'), (req: MultiTenantRequest, res: Response) => {
  try {
    if (!assertTenantWorkspace(req, res)) return;
    const db = getDb();

    const caseRow = db
      .prepare('SELECT id, conversation_id FROM cases WHERE id = ? AND tenant_id = ? AND workspace_id = ?')
      .get(req.params.id, req.tenantId, req.workspaceId) as { id: string; conversation_id?: string | null } | undefined;

    if (!caseRow) return sendError(res, 404, 'CASE_NOT_FOUND', 'Case not found');

    const { content, citations, generated_by, conversation_id } = req.body || {};
    if (!content || typeof content !== 'string' || !content.trim()) {
      return sendError(res, 400, 'DRAFT_CONTENT_REQUIRED', 'Draft content is required');
    }

    const finalConversationId = conversation_id || caseRow.conversation_id;
    if (!finalConversationId) {
      return sendError(res, 400, 'CASE_CONVERSATION_MISSING', 'Case has no conversation linked');
    }

    const draftId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO draft_replies (
        id, case_id, conversation_id, content, generated_by, citations, status, tenant_id
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending_review', ?)
    `).run(
      draftId,
      req.params.id,
      finalConversationId,
      content.trim(),
      generated_by || req.userId || null,
      JSON.stringify(Array.isArray(citations) ? citations : []),
      req.tenantId,
    );

    db.prepare(`
      UPDATE cases
      SET last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).run(req.params.id, req.tenantId, req.workspaceId);

    syncCaseSlaStatus(db, req, req.params.id);

    logAudit(db, {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId!,
      action: 'CASE_DRAFT_CREATED',
      entityType: 'case',
      entityId: req.params.id,
      metadata: { draft_id: draftId },
    });

    res.status(201).json({ success: true, id: draftId, status: 'pending_review' });
  } catch (error) {
    console.error('Error creating case draft:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// PATCH /api/cases/:id/drafts/:draftId/status
router.patch('/:id/drafts/:draftId/status', requirePermission('cases.write'), (req: MultiTenantRequest, res: Response) => {
  try {
    if (!assertTenantWorkspace(req, res)) return;
    const db = getDb();
    if (!assertCaseInScope(db, req, res, req.params.id)) return;

    const { status, reviewed_by } = req.body || {};
    if (!status || typeof status !== 'string' || !DRAFT_STATUSES.has(status)) {
      return sendError(
        res,
        400,
        'INVALID_DRAFT_STATUS',
        'Draft status must be one of: pending_review, approved, rejected, sent',
      );
    }

    const existing = db
      .prepare('SELECT id, status FROM draft_replies WHERE id = ? AND case_id = ? AND tenant_id = ?')
      .get(req.params.draftId, req.params.id, req.tenantId) as { id: string; status: string } | undefined;

    if (!existing) return sendError(res, 404, 'DRAFT_NOT_FOUND', 'Draft not found');

    const reviewer = reviewed_by || req.userId || null;
    const reviewedAt = status === 'pending_review' ? null : new Date().toISOString();

    db.prepare(`
      UPDATE draft_replies
      SET status = ?, reviewed_by = ?, reviewed_at = ?
      WHERE id = ? AND case_id = ? AND tenant_id = ?
    `).run(status, reviewer, reviewedAt, req.params.draftId, req.params.id, req.tenantId);

    db.prepare(`
      UPDATE cases
      SET last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).run(req.params.id, req.tenantId, req.workspaceId);

    syncCaseSlaStatus(db, req, req.params.id);

    logAudit(db, {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId!,
      action: 'CASE_DRAFT_STATUS_UPDATED',
      entityType: 'case',
      entityId: req.params.id,
      oldValue: { draft_id: req.params.draftId, status: existing.status },
      newValue: { draft_id: req.params.draftId, status },
    });

    res.json({ success: true, id: req.params.draftId, status });
  } catch (error) {
    console.error('Error updating case draft status:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// GET /api/cases/:id/timeline
router.get('/:id/timeline', (req: MultiTenantRequest, res: Response) => {
  try {
    if (!assertTenantWorkspace(req, res)) return;
    const db = getDb();
    const caseId = req.params.id;
    if (!assertCaseInScope(db, req, res, caseId)) return;

    const timeline: any[] = [];

    // Messages
    const msgs = db
      .prepare(`
      SELECT 'message' as entry_type, id, 'message' as type, sender_name as actor, content, sent_at as occurred_at, 'message' as icon
      FROM messages WHERE case_id = ? AND tenant_id = ? ORDER BY sent_at ASC
    `)
      .all(caseId, req.tenantId);
    timeline.push(...msgs);

    // Internal notes
    const notes = db
      .prepare(`
      SELECT 'note' as entry_type, n.id, 'internal_note' as type,
             COALESCE(u.name, n.created_by, 'system') as actor,
             n.content as content, n.created_at as occurred_at, 'note' as icon
      FROM internal_notes n
      LEFT JOIN users u ON u.id = n.created_by
      WHERE n.case_id = ? AND n.tenant_id = ?
      ORDER BY n.created_at ASC
    `)
      .all(caseId, req.tenantId);
    timeline.push(...notes);

    // Draft replies
    const drafts = db
      .prepare(`
      SELECT 'draft' as entry_type, d.id, 'draft_reply' as type,
             COALESCE(d.generated_by, 'system') as actor,
             d.content as content, d.generated_at as occurred_at, 'edit' as icon
      FROM draft_replies d
      WHERE d.case_id = ? AND d.tenant_id = ?
      ORDER BY d.generated_at ASC
    `)
      .all(caseId, req.tenantId);
    timeline.push(...drafts);

    // Status history
    const statuses = db
      .prepare(`
      SELECT 'status_change' as entry_type, id, 'status_change' as type, changed_by as actor,
             ('Status changed: ' || from_status || ' -> ' || to_status) as content, created_at as occurred_at, 'flag' as icon
      FROM case_status_history WHERE case_id = ? AND tenant_id = ? ORDER BY created_at ASC
    `)
      .all(caseId, req.tenantId);
    timeline.push(...statuses);

    timeline.sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
    res.json(timeline);
  } catch (error) {
    console.error('Error fetching timeline:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// PATCH /api/cases/:id/status
router.patch('/:id/status', requirePermission('cases.write'), (req: MultiTenantRequest, res: Response) => {
  try {
    if (!assertTenantWorkspace(req, res)) return;
    const db = getDb();
    const { status, reason, changed_by } = req.body;

    const existing = db
      .prepare(`
        SELECT status, sla_status, sla_first_response_deadline, sla_resolution_deadline, first_response_at
        FROM cases
        WHERE id = ? AND tenant_id = ? AND workspace_id = ?
      `)
      .get(req.params.id, req.tenantId, req.workspaceId) as CaseSlaRow | undefined;
    if (!existing) return sendError(res, 404, 'CASE_NOT_FOUND', 'Case not found');

    const fromStatus = existing.status as keyof typeof caseTransitions;
    const toStatus = status as keyof typeof caseTransitions;
    if (!fromStatus || !toStatus || !caseTransitions[fromStatus] || !canTransition(fromStatus, toStatus, caseTransitions)) {
      return sendError(res, 400, 'INVALID_CASE_TRANSITION', 'Invalid case status transition', {
        from: existing.status,
        to: status,
      });
    }

    db.prepare(`
      UPDATE cases
      SET status = ?, updated_at = CURRENT_TIMESTAMP, last_activity_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).run(status, req.params.id, req.tenantId, req.workspaceId);

    db.prepare(`
      INSERT INTO case_status_history (id, case_id, from_status, to_status, changed_by, changed_by_type, reason, tenant_id)
      VALUES (?, ?, ?, ?, ?, 'human', ?, ?)
    `).run(crypto.randomUUID(), req.params.id, existing.status, status, changed_by || req.userId, reason || null, req.tenantId);

    const nextSlaStatus = syncCaseSlaStatus(db, req, req.params.id);

    logAudit(db, {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId!,
      action: 'CASE_STATUS_UPDATE',
      entityType: 'case',
      entityId: req.params.id,
      oldValue: { status: existing.status },
      newValue: { status, sla_status: nextSlaStatus },
      metadata: { reason },
    });

    res.json({ success: true, status, sla_status: nextSlaStatus });
  } catch (error) {
    console.error('Error updating status:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// PATCH /api/cases/:id/assign
router.patch('/:id/assign', requirePermission('cases.assign'), (req: MultiTenantRequest, res: Response) => {
  try {
    if (!assertTenantWorkspace(req, res)) return;
    const db = getDb();
    const { user_id, team_id } = req.body || {};

    if (!assertCaseInScope(db, req, res, req.params.id)) return;

    db.prepare(`
      UPDATE cases
      SET assigned_user_id = ?, assigned_team_id = ?, updated_at = CURRENT_TIMESTAMP, last_activity_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).run(user_id || null, team_id || null, req.params.id, req.tenantId, req.workspaceId);

    const nextSlaStatus = syncCaseSlaStatus(db, req, req.params.id);

    logAudit(db, {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId!,
      action: 'CASE_ASSIGNMENT_UPDATE',
      entityType: 'case',
      entityId: req.params.id,
      newValue: { user_id, team_id, sla_status: nextSlaStatus },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error assigning case:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

export default router;
