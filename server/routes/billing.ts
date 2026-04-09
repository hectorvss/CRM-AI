import { Router } from 'express';
import { getDb } from '../db/client.js';
import { sendError } from '../http/errors.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';

const router = Router();
router.use(extractMultiTenant);

// Get subscription details for an organization
router.get('/:orgId/subscription', requirePermission('billing.read'), (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    const sub = db.prepare('SELECT * FROM billing_subscriptions WHERE org_id = ?').get(req.params.orgId);
    res.json(sub || { status: 'none' });
  } catch (error) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// List invoices / credit ledger
router.get('/:orgId/ledger', requirePermission('billing.read'), (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    const ledger = db.prepare('SELECT * FROM credit_ledger WHERE org_id = ? ORDER BY occurred_at DESC').all(req.params.orgId);
    res.json(ledger);
  } catch (error) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

export default router;
