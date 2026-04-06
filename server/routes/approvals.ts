import { Router } from 'express';
import { getDb } from '../db/client.js';

const router = Router();
const TENANT_ID = 'tenant_default';

// GET /api/approvals
router.get('/', (req, res) => {
  const db = getDb();
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
  const params: any[] = [TENANT_ID];

  if (status) { query += ' AND a.status = ?'; params.push(status); }
  if (risk_level) { query += ' AND a.risk_level = ?'; params.push(risk_level); }
  if (assigned_to) { query += ' AND a.assigned_to = ?'; params.push(assigned_to); }
  query += ' ORDER BY a.created_at DESC';

  const approvals = db.prepare(query).all(...params);
  res.json(approvals.map(parseJsonApproval));
});

// GET /api/approvals/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const approval = db.prepare(`
    SELECT a.*,
           c.case_number, c.type as case_type, c.priority, c.risk_level as case_risk,
           cu.canonical_name as customer_name, cu.segment as customer_segment,
           cu.lifetime_value, cu.dispute_rate, cu.refund_rate
    FROM approval_requests a
    LEFT JOIN cases c ON a.case_id = c.id
    LEFT JOIN customers cu ON c.customer_id = cu.id
    WHERE a.id = ? AND a.tenant_id = ?
  `).get(req.params.id, TENANT_ID);

  if (!approval) return res.status(404).json({ error: 'Not found' });
  res.json(parseJsonApproval(approval));
});

// POST /api/approvals/:id/decide
router.post('/:id/decide', (req, res) => {
  const db = getDb();
  const { decision, note, decided_by } = req.body;

  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: 'Decision must be approved or rejected' });
  }

  const approval = db.prepare(`SELECT * FROM approval_requests WHERE id = ? AND tenant_id = ?`).get(req.params.id, TENANT_ID) as any;
  if (!approval) return res.status(404).json({ error: 'Not found' });
  if (approval.status !== 'pending') return res.status(400).json({ error: 'Approval is not pending' });

  db.prepare(`
    UPDATE approval_requests 
    SET status=?, decision_by=?, decision_at=datetime('now'), decision_note=?, updated_at=datetime('now')
    WHERE id=?
  `).run(decision, decided_by || null, note || null, req.params.id);

  // Update case approval_state
  db.prepare(`UPDATE cases SET approval_state=?, updated_at=datetime('now') WHERE id=?`)
    .run(decision, approval.case_id);

  res.json({ success: true, decision });
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
