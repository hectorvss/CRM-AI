import { Router } from 'express';
import { sendError } from '../http/errors.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { createBillingRepository } from '../data/index.js';

const router = Router();
const billingRepo = createBillingRepository();

router.use(extractMultiTenant);

// Get subscription details for an organization
router.get('/:orgId/subscription', requirePermission('billing.read'), async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId! };
    const sub = await billingRepo.getSubscription(scope, req.params.orgId);
    res.json(sub);
  } catch (error) {
    console.error('Error fetching subscription:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// List invoices / credit ledger
router.get('/:orgId/ledger', requirePermission('billing.read'), async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId! };
    const ledger = await billingRepo.getLedger(scope, req.params.orgId);
    res.json(ledger);
  } catch (error) {
    console.error('Error fetching ledger:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

export default router;
