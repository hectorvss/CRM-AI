import { Router, Response } from 'express';
import { getDb } from '../db/client.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { parseRow } from '../db/utils.js';
import { getCustomerCanonicalState } from '../services/canonicalState.js';

const router = Router();

router.use(extractMultiTenant);

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
      const term = `%${q}%`;
      params.push(term, term);
    }

    query += ' ORDER BY lifetime_value DESC';

    const customers = db.prepare(query).all(...params);
    const enriched = customers.map((row: any) => {
      const parsed = parseRow(row) as any;
      const state = getCustomerCanonicalState(parsed.id, req.tenantId!, req.workspaceId!);
      return {
        ...parsed,
        open_cases: state?.metrics.open_cases ?? 0,
        total_cases: state?.metrics.total_cases ?? 0,
        active_conflicts: state?.metrics.active_conflicts ?? 0,
        linked_identities: state?.linked_identities ?? [],
        canonical_systems: state?.systems ?? {},
      };
    });

    res.json(enriched);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND tenant_id = ? AND workspace_id = ?').get(req.params.id, req.tenantId, req.workspaceId) as any;

    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const cases = db.prepare(`
      SELECT id, case_number, type, status, priority, created_at, updated_at, risk_level
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
      returns: returns.map(parseRow),
      state_snapshot: getCustomerCanonicalState(req.params.id, req.tenantId!, req.workspaceId!),
    });
  } catch (error) {
    console.error('Error fetching customer detail:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/state', (req: MultiTenantRequest, res: Response) => {
  try {
    const state = getCustomerCanonicalState(req.params.id, req.tenantId!, req.workspaceId!);
    if (!state) return res.status(404).json({ error: 'Customer not found' });
    res.json(state);
  } catch (error) {
    console.error('Error fetching customer state:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
