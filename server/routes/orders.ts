import { Router, Response } from 'express';
import { getDb } from '../db/client.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { parseRow } from '../db/utils.js';

const router = Router();

// Apply multi-tenant middleware
router.use(extractMultiTenant);

// ── GET /api/orders ──────────────────────────────────────────
router.get('/', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const { status, risk_level, q } = req.query;
    
    let query = `
      SELECT o.*, cu.canonical_name as customer_name, cu.segment as customer_segment
      FROM orders o
      LEFT JOIN customers cu ON o.customer_id = cu.id
      WHERE o.tenant_id = ? AND o.workspace_id = ?
    `;
    const params: any[] = [req.tenantId, req.workspaceId];
    
    if (status) { query += ` AND o.status = ?`; params.push(status); }
    if (risk_level) { query += ` AND o.risk_level = ?`; params.push(risk_level); }
    if (q) { 
      query += ` AND (o.external_order_id LIKE ? OR cu.canonical_name LIKE ?)`; 
      const t = `%${q}%`; 
      params.push(t, t); 
    }
    
    query += ' ORDER BY o.updated_at DESC';

    const orders = db.prepare(query).all(...params);
    res.json(orders.map(parseRow));
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/orders/:id ──────────────────────────────────────
router.get('/:id', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const order = db.prepare(`
      SELECT o.*, cu.canonical_name as customer_name, cu.canonical_email as customer_email
      FROM orders o LEFT JOIN customers cu ON o.customer_id = cu.id
      WHERE o.id = ? AND o.tenant_id = ? AND o.workspace_id = ?
    `).get(req.params.id, req.tenantId, req.workspaceId) as any;
    
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const events = db.prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY time ASC').all(req.params.id);
    
    // Cross-link with cases: check if the order_ids JSON array in cases contains this order ID
    const relatedCases = db.prepare(`
      SELECT id, case_number, status, type 
      FROM cases 
      WHERE order_ids LIKE ? AND tenant_id = ? AND workspace_id = ?
    `).all(`%${req.params.id}%`, req.tenantId, req.workspaceId);

    res.json({ 
      ...parseRow(order), 
      events: events.map(parseRow), 
      related_cases: relatedCases.map(parseRow) 
    });
  } catch (error) {
    console.error('Error fetching order detail:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
