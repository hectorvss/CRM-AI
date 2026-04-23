/**
 * server/agents/planEngine/tools/orders.ts
 *
 * ToolSpecs for order operations.
 *
 * Extracted from the monolithic executeAction() in server/routes/superAgent.ts.
 * The domain logic (repo calls, audit) is preserved exactly. The difference is
 * that now args are validated by schema before execution, and the tools can be
 * evaluated by the policy engine and traced independently.
 */

import { createCommerceRepository, createAuditRepository } from '../../../data/index.js';
import type { ToolSpec } from '../types.js';
import { s } from '../schema.js';

const commerceRepo = createCommerceRepository();
const auditRepo = createAuditRepository();

// ── order.get ────────────────────────────────────────────────────────────────

interface OrderGetArgs {
  orderId: string;
}

export const orderGetTool: ToolSpec<OrderGetArgs, unknown> = {
  name: 'order.get',
  version: '1.0.0',
  description: 'Retrieve a single order by ID. Returns full order details including status, line items, and fulfilment info.',
  category: 'order',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'cases.read',
  args: s.object({
    orderId: s.string({ description: 'UUID of the order to fetch' }),
  }),
  returns: s.any('Full order object or null if not found'),
  async run({ args, context }) {
    const order = await commerceRepo.getOrder(
      { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' },
      args.orderId,
    );
    if (!order) return { ok: false, error: 'Order not found', errorCode: 'NOT_FOUND' };
    return { ok: true, value: order };
  },
};

// ── order.list ───────────────────────────────────────────────────────────────

interface OrderListArgs {
  customerId?: string;
  status?: string;
  limit?: number;
}

export const orderListTool: ToolSpec<OrderListArgs, unknown> = {
  name: 'order.list',
  version: '1.0.0',
  description: 'List orders. Optionally filter by customer ID or status. Returns up to `limit` orders (default 20, max 50).',
  category: 'order',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'cases.read',
  args: s.object({
    customerId: s.string({ required: false, description: 'Filter by customer UUID' }),
    status: s.string({ required: false, description: 'Filter by order status (e.g. pending, shipped, delivered, cancelled)' }),
    limit: s.number({ required: false, integer: true, min: 1, max: 50, description: 'Max results (default 20)' }),
  }),
  returns: s.any('Array of order objects'),
  async run({ args, context }) {
    const scope = { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' };
    const filters: { status?: string; q?: string } = {};
    if (args.status) filters.status = args.status;
    // customerId is used as a query term since OrderFilters supports q
    if (args.customerId) filters.q = args.customerId;

    const allOrders = await commerceRepo.listOrders(scope, filters);
    const orders = allOrders.slice(0, args.limit ?? 20);
    return { ok: true, value: orders };
  },
};

// ── order.cancel ─────────────────────────────────────────────────────────────

interface OrderCancelArgs {
  orderId: string;
  reason?: string;
  /** Populated by executor context — the current fulfillment status for policy checks. */
  currentStatus?: string;
}

export const orderCancelTool: ToolSpec<OrderCancelArgs, unknown> = {
  name: 'order.cancel',
  version: '1.0.0',
  description: 'Cancel an order. High-risk if the order is packed, shipped, or delivered — those cases require approval.',
  category: 'order',
  sideEffect: 'write',
  risk: 'high',
  idempotent: false,
  requiredPermission: 'cases.write',
  compensate: 'order.reopen',
  args: s.object({
    orderId: s.string({ description: 'UUID of the order to cancel' }),
    reason: s.string({ required: false, max: 500, description: 'Reason for cancellation (shown in audit log)' }),
    currentStatus: s.string({ required: false, description: 'Current fulfillment status (used by policy engine)' }),
  }),
  returns: s.any('{ orderId, status: "cancelled" }'),
  async run({ args, context }) {
    if (context.dryRun) {
      return { ok: true, value: { orderId: args.orderId, status: 'cancelled', dryRun: true } };
    }

    const scope = { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' };

    const order = await commerceRepo.getOrder(scope, args.orderId);
    if (!order) return { ok: false, error: 'Order not found', errorCode: 'NOT_FOUND' };

    await commerceRepo.updateOrder(scope, args.orderId, {
      status: 'cancelled',
      approval_status: 'not_required',
      summary: args.reason ?? 'Cancelled via Super Agent',
      updated_at: new Date().toISOString(),
    });

    await context.audit({
      action: 'PLAN_ENGINE_ORDER_CANCELLED',
      entityType: 'order',
      entityId: args.orderId,
      oldValue: { status: (order as any).status },
      newValue: { status: 'cancelled', reason: args.reason ?? null },
      metadata: { source: 'plan-engine', planId: context.planId },
    });

    return { ok: true, value: { orderId: args.orderId, status: 'cancelled' } };
  },
};
