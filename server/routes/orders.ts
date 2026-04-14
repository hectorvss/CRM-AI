import { Router, Response } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { createCommerceRepository } from '../data/commerce.js';

const router = Router();

// Apply multi-tenant middleware
router.use(extractMultiTenant);

const commerceRepo = createCommerceRepository();

// ── GET /api/orders ──────────────────────────────────────────
router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const { status, risk_level, q } = req.query;
    
    const orders = await commerceRepo.listOrders(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId! },
      { 
        status: status as string, 
        risk_level: risk_level as string, 
        q: q as string 
      }
    );
    
    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/orders/:id ──────────────────────────────────────
router.get('/:id/context', async (req: MultiTenantRequest, res: Response) => {
  try {
    const context = await commerceRepo.getOrderContext(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId! },
      req.params.id
    );
    if (!context) return res.status(404).json({ error: 'Order context not found' });
    res.json(context);
  } catch (error) {
    console.error('Error fetching order context:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const order = await commerceRepo.getOrder(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId! },
      req.params.id
    );
    
    if (!order) return res.status(404).json({ error: 'Order not found' });

    res.json(order);
  } catch (error) {
    console.error('Error fetching order detail:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
