import { Router } from 'express';
import { getDb } from '../db/client.js';

const router = Router();

// Get subscription details for an organization
router.get('/:orgId/subscription', (req, res) => {
  try {
    const db = getDb();
    const sub = db.prepare('SELECT * FROM billing_subscriptions WHERE org_id = ?').get(req.params.orgId);
    res.json(sub || { status: 'none' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List invoices / credit ledger
router.get('/:orgId/ledger', (req, res) => {
  try {
    const db = getDb();
    const ledger = db.prepare('SELECT * FROM credit_ledger WHERE org_id = ? ORDER BY occurred_at DESC').all(req.params.orgId);
    res.json(ledger);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
