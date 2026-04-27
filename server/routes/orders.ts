import { Router, Response } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { createAuditRepository } from '../data/index.js';
import { createCommerceRepository } from '../data/commerce.js';
import { fireWorkflowEvent } from '../lib/workflowEventBus.js';

const router = Router();

// Apply multi-tenant middleware
router.use(extractMultiTenant);

const commerceRepo = createCommerceRepository();
const auditRepository = createAuditRepository();

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

router.post('/:id/cancel', requirePermission('orders.write'), async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const order = await commerceRepo.getOrder(scope, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const fulfillment = String(order.fulfillment_status ?? order.status ?? '').toLowerCase();
    const isBlocked = ['packed', 'shipped', 'delivered', 'fulfilled'].includes(fulfillment);
    const reason = String(req.body?.reason ?? '').trim() || 'Cancelled from CRM-AI';

    if (isBlocked) {
      await commerceRepo.updateOrder(scope, req.params.id, {
        status: order.status,
        approval_status: 'approval_needed',
        recommended_action: 'Cancellation blocked by fulfillment state. Route to approval or warehouse intervention.',
        has_conflict: true,
        conflict_detected: `Cancellation requested while fulfillment is ${fulfillment}`,
        last_update: reason,
      });

      await auditRepository.log(scope, {
        actorId: req.userId || 'system',
        action: 'ORDER_CANCEL_BLOCKED',
        entityType: 'order',
        entityId: req.params.id,
        oldValue: { status: order.status, fulfillment_status: order.fulfillment_status },
        newValue: { approval_status: 'approval_needed', conflict_detected: fulfillment },
        metadata: { reason },
      });

      return res.status(409).json({
        error: 'Cancellation requires approval',
        blocked: true,
        reason: `Order is already ${fulfillment}`,
      });
    }

    await commerceRepo.updateOrder(scope, req.params.id, {
      status: 'cancelled',
      fulfillment_status: order.fulfillment_status ?? 'not_fulfilled',
      approval_status: 'not_required',
      recommended_action: 'No further action needed',
      last_update: reason,
      system_states: { ...(order.system_states ?? {}), canonical: 'cancelled', crm_ai: 'cancelled' },
    });

    await auditRepository.log(scope, {
      actorId: req.userId || 'system',
      action: 'ORDER_CANCELLED',
      entityType: 'order',
      entityId: req.params.id,
      oldValue: { status: order.status },
      newValue: { status: 'cancelled' },
      metadata: { reason },
    });

    const updated = await commerceRepo.getOrder(scope, req.params.id);
    fireWorkflowEvent(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId },
      'order.updated',
      { orderId: req.params.id, status: 'cancelled', previousStatus: order.status, reason },
    );
    res.json({ success: true, order: updated });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
