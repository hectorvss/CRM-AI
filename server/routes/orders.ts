import { Router, Response } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { sendError } from '../http/errors.js';
import { createAuditRepository, createCommerceRepository } from '../data/index.js';

const router = Router();
const commerceRepo = createCommerceRepository();
const auditRepo = createAuditRepository();

function mergeSystemStates(current: any, updates: Record<string, any>) {
  let parsed: Record<string, any> = {};
  if (typeof current === 'string') {
    try {
      parsed = JSON.parse(current || '{}');
    } catch {
      parsed = {};
    }
  } else if (current && typeof current === 'object') {
    parsed = current;
  }
  return { ...parsed, ...updates };
}

// Apply multi-tenant middleware
router.use(extractMultiTenant);

// GET /api/orders
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

// GET /api/orders/:id/context
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

// POST /api/orders/:id/cancel
router.post('/:id/cancel', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const reason = req.body?.reason || 'Cancellation requested from UI';
    const order = await commerceRepo.getOrder(scope, req.params.id);

    if (!order) {
      return sendError(res, 404, 'ORDER_NOT_FOUND', 'Order not found');
    }

    if (['cancelled', 'refunded'].includes(String(order.status).toLowerCase())) {
      return res.json({ success: true, message: 'Order is already cancelled', data: order });
    }

    const updates = {
      status: 'cancelled',
      fulfillment_status: order.fulfillment_status || 'cancelled',
      approval_status: order.approval_status || 'not_required',
      summary: 'Order cancellation requested from CRM AI',
      recommended_action: 'Review refund eligibility and customer notification',
      system_states: mergeSystemStates(order.system_states, {
        oms: 'cancelled',
        canonical: 'cancelled',
      }),
    };

    await commerceRepo.updateOrder(scope, req.params.id, updates);
    const updated = await commerceRepo.getOrder(scope, req.params.id);

    await auditRepo.logEvent(scope, {
      actorId: 'user_alex',
      actorType: 'human',
      action: 'order.cancel',
      entityType: 'order',
      entityId: req.params.id,
      oldValue: { status: order.status, system_states: order.system_states },
      newValue: updates,
      metadata: { reason },
    });

    res.json({ success: true, message: 'Order cancelled and audit trail updated', data: updated });
  } catch (error) {
    console.error('Error cancelling order:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// GET /api/orders/:id
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
