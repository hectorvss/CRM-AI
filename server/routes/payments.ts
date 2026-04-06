import { Router, Response } from 'express';
import { getDb } from '../db/client.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { parseRow } from '../db/utils.js';
import { sendError } from '../http/errors.js';

const router = Router();

// Apply multi-tenant middleware to all payment routes
router.use(extractMultiTenant);
router.use(requirePermission('cases.read'));

// ── GET /api/payments ─────────────────────────────────────────
router.get('/', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const { status, risk_level, q } = req.query;
    
    let query = `
      SELECT p.*, cu.canonical_name as customer_name
      FROM payments p
      LEFT JOIN customers cu ON p.customer_id = cu.id
      WHERE p.tenant_id = ?
    `;
    const params: any[] = [req.tenantId];
    
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
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// ── GET /api/payments/:id ─────────────────────────────────────
router.get('/:id', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const payment = db.prepare(`
      SELECT p.*, cu.canonical_name as customer_name, cu.canonical_email as customer_email
      FROM payments p LEFT JOIN customers cu ON p.customer_id = cu.id
      WHERE p.id = ? AND p.tenant_id = ?
    `).get(req.params.id, req.tenantId);
    
    if (!payment) return sendError(res, 404, 'PAYMENT_NOT_FOUND', 'Payment not found');
    res.json(parseRow(payment));
  } catch (error) {
    console.error('Error fetching payment detail:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

export default router;

// ── Returns Router ────────────────────────────────────────────
export const returnsRouter = Router();

// Apply multi-tenant middleware to all return routes
returnsRouter.use(extractMultiTenant);
returnsRouter.use(requirePermission('cases.read'));

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
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
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
    
    if (!ret) return sendError(res, 404, 'RETURN_NOT_FOUND', 'Return not found');

    const events = db.prepare('SELECT * FROM return_events WHERE return_id = ? ORDER BY time ASC').all(req.params.id);
    res.json({ ...parseRow(ret), events: events.map(parseRow) });
  } catch (error) {
    console.error('Error fetching return detail:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});
