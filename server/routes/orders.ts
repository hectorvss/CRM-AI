import { Router, Response } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { createAuditRepository } from '../data/index.js';
import { createCommerceRepository } from '../data/commerce.js';
import {
  createApprovalRequest,
  findCaseIdForEntity,
  findPendingApprovalRequest,
} from '../data/approvals.js';
import { fireWorkflowEvent } from '../lib/workflowEventBus.js';
import { integrationRegistry } from '../integrations/registry.js';
import { logger } from '../utils/logger.js';
import type { WritableOrders } from '../integrations/types.js';
import { isValidStatus, invalidStatusMessage, ORDER_STATUSES } from '../utils/statusEnums.js';

const router = Router();

// Apply multi-tenant middleware
router.use(extractMultiTenant);

const commerceRepo = createCommerceRepository();
const auditRepository = createAuditRepository();

// ── GET /api/orders ──────────────────────────────────────────
router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const { status, risk_level, q, tab } = req.query;

    // "tab" filter used by the Orders frontend (all / cancellations / returns / refunds)
    let statusFilter = status as string | undefined;
    if (!statusFilter && tab) {
      const tabMap: Record<string, string> = {
        cancellations: 'cancelled',
        returns: 'return_requested',
        refunds: 'refunded',
      };
      statusFilter = tabMap[tab as string];
    }

    const orders = await commerceRepo.listOrders(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId! },
      {
        status: statusFilter,
        risk_level: risk_level as string,
        q: q as string,
      }
    );

    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/orders/:id/context ──────────────────────────────
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

// ── GET /api/orders/:id ──────────────────────────────────────
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

// ── PATCH /api/orders/:id/status ─────────────────────────────
// Update order status (e.g. mark as shipped, fulfilled, on_hold)
router.patch('/:id/status', requirePermission('orders.write'), async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const order = await commerceRepo.getOrder(scope, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const newStatus = String(req.body?.status ?? '').trim();
    if (!newStatus) return res.status(400).json({ error: 'status is required' });
    if (!isValidStatus(newStatus, ORDER_STATUSES)) {
      return res.status(400).json({ error: invalidStatusMessage('status', ORDER_STATUSES) });
    }

    const note = String(req.body?.note ?? '').trim() || `Status updated to ${newStatus}`;

    await commerceRepo.updateOrder(scope, req.params.id, {
      status: newStatus,
      last_update: note,
      system_states: { ...(order.system_states ?? {}), canonical: newStatus, crm_ai: newStatus },
    });

    await auditRepository.log(scope, {
      actorId: req.userId || 'system',
      action: 'ORDER_STATUS_UPDATED',
      entityType: 'order',
      entityId: req.params.id,
      oldValue: { status: order.status },
      newValue: { status: newStatus },
      metadata: { note },
    });

    const updated = await commerceRepo.getOrder(scope, req.params.id);
    await fireWorkflowEvent(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId },
      'order.updated',
      { orderId: req.params.id, status: newStatus, previousStatus: order.status },
    );
    res.json({ success: true, order: updated });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/orders/:id/cancel ──────────────────────────────
router.post('/:id/cancel', requirePermission('orders.write'), async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const order = await commerceRepo.getOrder(scope, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const fulfillment = String(order.fulfillment_status ?? order.status ?? '').toLowerCase();
    const isBlocked = ['packed', 'shipped', 'delivered', 'fulfilled'].includes(fulfillment);
    const reason = String(req.body?.reason ?? '').trim() || 'Cancelled from CRM-AI';

    if (isBlocked) {
      // Resolve case_id (cancellation must be linked to a case for the manager queue).
      const caseId = await findCaseIdForEntity({
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        entity: 'order',
        entityId: req.params.id,
      });

      // Idempotency: avoid creating duplicate approval rows for the same order.
      let existing: any = null;
      if (caseId) {
        existing = await findPendingApprovalRequest({
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          caseId,
          requestType: 'order_cancel',
          entityKey: 'order_id',
          entityValue: req.params.id,
        });
      }

      await commerceRepo.updateOrder(scope, req.params.id, {
        status: order.status,
        approval_status: 'approval_needed',
        recommended_action: 'Cancellation blocked by fulfillment state. Route to approval or warehouse intervention.',
        has_conflict: true,
        conflict_detected: `Cancellation requested while fulfillment is ${fulfillment}`,
        last_update: reason,
      });

      let approvalRequestId: string | null = existing?.id ?? null;
      if (!existing && caseId) {
        const riskLevel = ['high', 'critical'].includes(String(order.risk_level ?? '').toLowerCase())
          ? (String(order.risk_level).toLowerCase() as 'high' | 'critical')
          : 'medium';
        const created = await createApprovalRequest({
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          caseId,
          requestType: 'order_cancel',
          requestedBy: req.userId || 'system',
          requestedByType: req.userId ? 'human' : 'system',
          riskLevel,
          metadata: {
            order_id: req.params.id,
            fulfillment_status: order.fulfillment_status ?? null,
            current_status: order.status ?? null,
            reason,
          },
          evidencePackage: {
            previous_approval_status: order.approval_status,
            conflict_detected: `Cancellation requested while fulfillment is ${fulfillment}`,
          },
        });
        approvalRequestId = created.id;
      } else if (!caseId) {
        logger.warn('orders.cancel: blocked cancellation has no linked case; cannot create approval_request row', {
          orderId: req.params.id,
        });
      }

      await auditRepository.log(scope, {
        actorId: req.userId || 'system',
        action: 'ORDER_CANCEL_APPROVAL_REQUESTED',
        entityType: 'order',
        entityId: req.params.id,
        oldValue: { status: order.status, fulfillment_status: order.fulfillment_status },
        newValue: { approval_status: 'approval_needed', conflict_detected: fulfillment, approval_request_id: approvalRequestId },
        metadata: { reason, approval_request_id: approvalRequestId, case_id: caseId, fulfillment_status: order.fulfillment_status },
      });

      return res.status(409).json({
        error: 'Cancellation requires approval',
        blocked: true,
        reason: `Order is already ${fulfillment}`,
        approvalRequestId,
        caseId,
      });
    }

    // ── Attempt live Shopify cancellation if adapter is configured ────────
    let executedVia: 'shopify' | 'db-only' = 'db-only';
    const shopifyAdapter = integrationRegistry.get('shopify') as unknown as (WritableOrders & { cancelOrder?: Function }) | null;
    const externalOrderId: string | null = (order as any).external_order_id ?? (order as any).shopify_id ?? null;

    if (shopifyAdapter && typeof shopifyAdapter.cancelOrder === 'function' && externalOrderId) {
      try {
        await shopifyAdapter.cancelOrder({
          orderExternalId: externalOrderId,
          reason,
          email: true,
          restock: true,
        });
        executedVia = 'shopify';
        logger.info('orders.cancel: Shopify order cancelled', { orderId: req.params.id, externalOrderId });
      } catch (shopifyErr) {
        logger.warn('orders.cancel: Shopify call failed, proceeding with DB-only update', {
          orderId: req.params.id,
          error: shopifyErr instanceof Error ? shopifyErr.message : String(shopifyErr),
        });
      }
    }

    // ── Always update CRM DB ──────────────────────────────────────────────
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
      newValue: { status: 'cancelled', executedVia },
      metadata: { reason, executedVia },
    });

    const updated = await commerceRepo.getOrder(scope, req.params.id);
    await fireWorkflowEvent(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId },
      'order.updated',
      { orderId: req.params.id, status: 'cancelled', previousStatus: order.status, reason, executedVia },
    );
    res.json({ success: true, order: updated, executedVia });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
