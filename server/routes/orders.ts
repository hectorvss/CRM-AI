import { Router, Response } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { sendError } from '../http/errors.js';
import { createCommerceRepository } from '../data/index.js';

const router = Router();
const commerceRepo = createCommerceRepository();

// Apply multi-tenant middleware
router.use(extractMultiTenant);

// ── GET /api/orders ──────────────────────────────────────────
router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const filters = {
      status: req.query.status as string,
      risk_level: req.query.risk_level as string,
      q: req.query.q as string,
    };
    
    const orders = await commerceRepo.listOrders(scope, filters);
    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// ── GET /api/orders/:id/context ──────────────────────────────
router.get('/:id/context', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const context = await commerceRepo.getOrderContext(scope, req.params.id);
    if (!context) return res.status(404).json({ error: 'Order context not found' });
    res.json(context);
  } catch (error) {
    console.error('Error fetching order context:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// ── GET /api/orders/:id ──────────────────────────────────────
router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const order = await commerceRepo.getOrder(scope, req.params.id);
    
    if (!order) return res.status(404).json({ error: 'Order not found' });

    res.json(order);
  } catch (error) {
    console.error('Error fetching order detail:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

export default router;
