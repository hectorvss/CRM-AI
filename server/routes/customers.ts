import { Router, Response } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { sendError } from '../http/errors.js';
import { createCustomerRepository } from '../data/index.js';

const router = Router();
const customerRepo = createCustomerRepository();

router.use(extractMultiTenant);

router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const filters = {
      segment: req.query.segment as string,
      risk_level: req.query.risk_level as string,
      q: req.query.q as string,
    };

    const customers = await customerRepo.list(scope, filters);
    res.json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const detail = await customerRepo.getDetail(scope, req.params.id);

    if (!detail) return res.status(404).json({ error: 'Customer not found' });
    res.json(detail);
  } catch (error) {
    console.error('Error fetching customer detail:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.get('/:id/state', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const state = await customerRepo.getState(scope, req.params.id);
    
    if (!state) return res.status(404).json({ error: 'Customer not found' });
    res.json(state);
  } catch (error) {
    console.error('Error fetching customer state:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

export default router;
