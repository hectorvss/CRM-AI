import { Router, Response } from 'express';
import { getDb } from '../db/client.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { parseRow, logAudit } from '../db/utils.js';
import { Case } from '../models.js';

const router = Router();

// Apply multi-tenant middleware to all case routes
router.use(extractMultiTenant);

// ── GET /api/cases ─────────────────────────────────────────
router.get('/', (req: MultiTenantRequest, res: Response) => {
  try {
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

    if (status) { query += ` AND c.status = ?`; params.push(status); }
    if (assigned_user_id) { query += ` AND c.assigned_user_id = ?`; params.push(assigned_user_id); }
    if (priority) { query += ` AND c.priority = ?`; params.push(priority); }
    if (risk_level) { query += ` AND c.risk_level = ?`; params.push(risk_level); }
    if (q) { 
      query += ` AND (c.case_number LIKE ? OR cu.canonical_name LIKE ? OR cu.canonical_email LIKE ?)`; 
      const term = `%${q}%`; 
      params.push(term, term, term); 
    }

    query += ` ORDER BY c.last_activity_at DESC`;

    const cases = db.prepare(query).all(...params);
    res.json(cases.map(row => parseRow<Case>(row)));
  } catch (error) {
    console.error('Error fetching cases:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/cases/:id ─────────────────────────────────────
router.get('/:id', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const c = db.prepare(`
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
    `).get(req.params.id, req.tenantId, req.workspaceId);

    if (!c) return res.status(404).json({ error: 'Case not found' });
    res.json(parseRow<Case>(c));
  } catch (error) {
    console.error('Error fetching case:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/cases/:id/timeline ───────────────────────────
router.get('/:id/timeline', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const caseId = req.params.id;

    const timeline: any[] = [];

    // Messages
    const msgs = db.prepare(`
      SELECT 'message' as entry_type, id, 'message' as type, sender_name as actor, content, sent_at as occurred_at, 'message' as icon
      FROM messages WHERE case_id = ? AND tenant_id = ? ORDER BY sent_at ASC
    `).all(caseId, req.tenantId);
    timeline.push(...msgs);

    // Status history
    const statuses = db.prepare(`
      SELECT 'status_change' as entry_type, id, 'status_change' as type, changed_by as actor, 
             ('Status changed: ' || from_status || ' → ' || to_status) as content, created_at as occurred_at, 'flag' as icon
      FROM case_status_history WHERE case_id = ? AND tenant_id = ? ORDER BY created_at ASC
    `).all(caseId, req.tenantId);
    timeline.push(...statuses);

    // Sort by occurred_at
    timeline.sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
    res.json(timeline);
  } catch (error) {
    console.error('Error fetching timeline:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PATCH /api/cases/:id/status ───────────────────────────
router.patch('/:id/status', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const { status, reason, changed_by } = req.body;

    const existing = db.prepare('SELECT status FROM cases WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId) as any;
    if (!existing) return res.status(404).json({ error: 'Case not found' });

    db.prepare(`
      UPDATE cases 
      SET status = ?, updated_at = CURRENT_TIMESTAMP, last_activity_at = CURRENT_TIMESTAMP 
      WHERE id = ? AND tenant_id = ?
    `).run(status, req.params.id, req.tenantId);

    db.prepare(`
      INSERT INTO case_status_history (id, case_id, from_status, to_status, changed_by, changed_by_type, reason, tenant_id) 
      VALUES (?, ?, ?, ?, ?, 'human', ?, ?)
    `).run(crypto.randomUUID(), req.params.id, existing.status, status, changed_by || req.userId, reason || null, req.tenantId);

    // Audit Event
    logAudit(db, {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId!,
      action: 'CASE_STATUS_UPDATE',
      entityType: 'case',
      entityId: req.params.id,
      oldValue: { status: existing.status },
      newValue: { status },
      metadata: { reason }
    });

    res.json({ success: true, status });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PATCH /api/cases/:id/assign ───────────────────────────
router.patch('/:id/assign', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const { user_id, team_id } = req.body;

    db.prepare(`
      UPDATE cases 
      SET assigned_user_id = ?, assigned_team_id = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ? AND tenant_id = ?
    `).run(user_id || null, team_id || null, req.params.id, req.tenantId);

    // Audit Event
    logAudit(db, {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId!,
      action: 'CASE_ASSIGNMENT_UPDATE',
      entityType: 'case',
      entityId: req.params.id,
      newValue: { user_id, team_id }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error assigning case:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
