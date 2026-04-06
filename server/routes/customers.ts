import { Router, Response } from 'express';
import { getDb } from '../db/client.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { parseRow } from '../db/utils.js';
import { sendError } from '../http/errors.js';

const router = Router();

// Apply multi-tenant middleware
router.use(extractMultiTenant);
router.use(requirePermission('cases.read'));

// ── GET /api/customers ───────────────────────────────────────
router.get('/', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const { segment, risk_level, q } = req.query;
    
    let query = 'SELECT * FROM customers WHERE tenant_id = ? AND workspace_id = ?';
    const params: any[] = [req.tenantId, req.workspaceId];

    if (segment) { query += ' AND segment = ?'; params.push(segment); }
    if (risk_level) { query += ' AND risk_level = ?'; params.push(risk_level); }
    if (q) { 
      query += ' AND (canonical_name LIKE ? OR canonical_email LIKE ?)'; 
      const t = `%${q}%`; 
      params.push(t, t); 
    }
    
    query += ' ORDER BY lifetime_value DESC';

    const customers = db.prepare(query).all(...params);

    // Enrich with metrics and identities
    const enriched = customers.map((c: any) => {
      const openCases = db.prepare(`
        SELECT COUNT(*) as count FROM cases 
        WHERE customer_id = ? AND tenant_id = ? AND status NOT IN ('resolved','closed')
      `).get(c.id, req.tenantId) as any;
      
      const allCases = db.prepare(`
        SELECT COUNT(*) as count FROM cases 
        WHERE customer_id = ? AND tenant_id = ?
      `).get(c.id, req.tenantId) as any;
      
      const identities = db.prepare(`
        SELECT * FROM linked_identities WHERE customer_id = ?
      `).all(c.id);

      return { 
        ...parseRow(c), 
        open_cases: openCases.count, 
        total_cases: allCases.count, 
        linked_identities: identities.map(parseRow) 
      };
    });

    res.json(enriched);
  } catch (error) {
    console.error('Error fetching customers:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// ── GET /api/customers/:id ───────────────────────────────────
router.get('/:id', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND tenant_id = ? AND workspace_id = ?').get(req.params.id, req.tenantId, req.workspaceId) as any;
    
    if (!customer) return sendError(res, 404, 'CUSTOMER_NOT_FOUND', 'Customer not found');

    const cases = db.prepare(`
      SELECT id, case_number, type, status, priority, created_at 
      FROM cases WHERE customer_id = ? AND tenant_id = ? 
      ORDER BY created_at DESC
    `).all(req.params.id, req.tenantId);
    
    const identities = db.prepare('SELECT * FROM linked_identities WHERE customer_id = ?').all(req.params.id);
    
    const orders = db.prepare(`
      SELECT id, external_order_id, status, total_amount, currency, order_date 
      FROM orders WHERE customer_id = ? AND tenant_id = ? 
      ORDER BY order_date DESC
    `).all(req.params.id, req.tenantId);
    
    const payments = db.prepare(`
      SELECT id, external_payment_id, status, amount, currency, created_at 
      FROM payments WHERE customer_id = ? AND tenant_id = ? 
      ORDER BY created_at DESC
    `).all(req.params.id, req.tenantId);
    
    const returns = db.prepare(`
      SELECT id, external_return_id, status, return_value, currency, created_at 
      FROM returns WHERE customer_id = ? AND tenant_id = ? 
      ORDER BY created_at DESC
    `).all(req.params.id, req.tenantId);

    res.json({ 
      ...parseRow(customer), 
      cases: cases.map(parseRow), 
      linked_identities: identities.map(parseRow), 
      orders: orders.map(parseRow), 
      payments: payments.map(parseRow), 
      returns: returns.map(parseRow) 
    });
  } catch (error) {
    console.error('Error fetching customer detail:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

export default router;
