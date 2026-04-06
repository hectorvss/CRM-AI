import { Router, Response } from 'express';
import { getDb } from '../db/client.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { parseRow } from '../db/utils.js';

const router = Router();

// Apply multi-tenant middleware to all payment routes
router.use(extractMultiTenant);

// ── GET /api/payments ─────────────────────────────────────────
router.get('/', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const { status, risk_level, q } = req.query;
    
    let query = `
      SELECT p.*, cu.canonical_name as customer_name
      FROM payments p
      LEFT JOIN customers cu ON p.customer_id = cu.id
      WHERE p.tenant_id = ? AND p.workspace_id = ?
    `;
    const params: any[] = [req.tenantId, req.workspaceId];
    
    if (status) { query += ' AND p.status = ?'; params.push(status); }
    if (risk_level) { query += ' AND p.risk_level = ?'; params.push(risk_level); }
    if (q) { 
      query += ' AND (p.external_payment_id LIKE ? OR cu.canonical_name LIKE ?)'; 
      const t = `%${q}%`; 
      params.push(t, t); 
    }
    
    query += ' ORDER BY p.updated_at DESC';

    const payments = db.prepare(query).all(...params);
    res.json(payments.map(parseRow));
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/payments/:id ─────────────────────────────────────
router.get('/:id', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const payment = db.prepare(`
      SELECT p.*, cu.canonical_name as customer_name, cu.canonical_email as customer_email
      FROM payments p LEFT JOIN customers cu ON p.customer_id = cu.id
      WHERE p.id = ? AND p.tenant_id = ? AND p.workspace_id = ?
    `).get(req.params.id, req.tenantId, req.workspaceId);
    
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.json(parseRow(payment));
  } catch (error) {
    console.error('Error fetching payment detail:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

// ── Returns Router ────────────────────────────────────────────
export const returnsRouter = Router();

// Apply multi-tenant middleware to all return routes
returnsRouter.use(extractMultiTenant);

// GET /api/returns
returnsRouter.get('/', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const { status, risk_level, q } = req.query;
    
    let query = `
      SELECT r.*, cu.canonical_name as customer_name
      FROM returns r
      LEFT JOIN customers cu ON r.customer_id = cu.id
      WHERE r.tenant_id = ? AND r.workspace_id = ?
    `;
    const params: any[] = [req.tenantId, req.workspaceId];
    
    if (status) { query += ' AND r.status = ?'; params.push(status); }
    if (risk_level) { query += ' AND r.risk_level = ?'; params.push(risk_level); }
    if (q) { 
      query += ' AND (r.external_return_id LIKE ? OR cu.canonical_name LIKE ?)'; 
      const t = `%${q}%`; 
      params.push(t, t); 
    }
    
    query += ' ORDER BY r.updated_at DESC';

    const returns = db.prepare(query).all(...params);
    res.json(returns.map(parseRow));
  } catch (error) {
    console.error('Error fetching returns:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/returns/:id
returnsRouter.get('/:id', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const ret = db.prepare(`
      SELECT r.*, cu.canonical_name as customer_name
      FROM returns r LEFT JOIN customers cu ON r.customer_id = cu.id
      WHERE r.id = ? AND r.tenant_id = ? AND r.workspace_id = ?
    `).get(req.params.id, req.tenantId, req.workspaceId);
    
    if (!ret) return res.status(404).json({ error: 'Return not found' });

    const events = db.prepare('SELECT * FROM return_events WHERE return_id = ? ORDER BY time ASC').all(req.params.id);
    res.json({ ...parseRow(ret), events: events.map(parseRow) });
  } catch (error) {
    console.error('Error fetching return detail:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
