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

// Apply multi-tenant middleware to all payment routes
router.use(extractMultiTenant);

// GET /api/payments
router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const { status, risk_level, q } = req.query;
    const filters = {
      status: status as string,
      risk_level: risk_level as string,
      q: q as string,
    };
    
    const payments = await commerceRepo.listPayments(scope, filters);
    res.json(payments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// GET /api/payments/:id/context
router.get('/:id/context', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const context = await commerceRepo.getPaymentContext(scope, req.params.id);
    if (!context) return res.status(404).json({ error: 'Payment context not found' });
    res.json(context);
  } catch (error) {
    console.error('Error fetching payment context:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// POST /api/payments/:id/refund
router.post('/:id/refund', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const payment = await commerceRepo.getPayment(scope, req.params.id);

    if (!payment) {
      return sendError(res, 404, 'PAYMENT_NOT_FOUND', 'Payment not found');
    }

    const requestedAmount = Number(req.body?.amount ?? payment.amount ?? 0);
    const amount = Number.isFinite(requestedAmount) && requestedAmount > 0
      ? Math.min(requestedAmount, Number(payment.amount ?? requestedAmount))
      : Number(payment.amount ?? 0);
    const reason = req.body?.reason || 'Refund issued from CRM AI';
    const needsApproval = amount > 50 || payment.risk_level === 'high';
    const refundStatus = needsApproval ? 'pending_approval' : 'succeeded';

    const updates = {
      refund_amount: amount,
      status: refundStatus === 'succeeded' ? 'refunded' : payment.status,
      approval_status: needsApproval ? 'pending' : 'approved',
      summary: needsApproval
        ? 'Refund requested and routed to approvals'
        : 'Refund issued from CRM AI',
      recommended_action: needsApproval
        ? 'Review refund approval request'
        : 'Notify customer that refund was issued',
      system_states: mergeSystemStates(payment.system_states, {
        refund: refundStatus,
        psp: refundStatus === 'succeeded' ? 'refunded' : payment.status,
        canonical: needsApproval ? 'refund_pending_approval' : 'refunded',
      }),
    };

    await commerceRepo.updatePayment(scope, req.params.id, updates);
    const updated = await commerceRepo.getPayment(scope, req.params.id);

    await auditRepo.logEvent(scope, {
      actorId: 'user_alex',
      actorType: 'human',
      action: 'payment.refund',
      entityType: 'payment',
      entityId: req.params.id,
      oldValue: {
        status: payment.status,
        refund_amount: payment.refund_amount,
      },
      newValue: updates,
      metadata: { amount, reason, needsApproval },
    });

    res.json({
      success: true,
      message: needsApproval
        ? 'Refund request saved and routed for approval'
        : 'Refund saved and audit trail updated',
      data: updated,
    });
  } catch (error) {
    console.error('Error processing refund:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// GET /api/payments/:id
router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const payment = await commerceRepo.getPayment(scope, req.params.id);
    
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.json(payment);
  } catch (error) {
    console.error('Error fetching payment detail:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

export default router;

// Returns Router
export const returnsRouter = Router();

returnsRouter.use(extractMultiTenant);

// GET /api/returns
returnsRouter.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const { status, risk_level, q } = req.query;
    const filters = {
      status: status as string,
      risk_level: risk_level as string,
      q: q as string,
    };
    
    const returns = await commerceRepo.listReturns(scope, filters);
    res.json(returns);
  } catch (error) {
    console.error('Error fetching returns:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// GET /api/returns/:id/context
returnsRouter.get('/:id/context', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const context = await commerceRepo.getReturnContext(scope, req.params.id);
    if (!context) return res.status(404).json({ error: 'Return context not found' });
    res.json(context);
  } catch (error) {
    console.error('Error fetching return context:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// GET /api/returns/:id
returnsRouter.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const ret = await commerceRepo.getReturn(scope, req.params.id);
    
    if (!ret) return res.status(404).json({ error: 'Return not found' });
    res.json(ret);
  } catch (error) {
    console.error('Error fetching return detail:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});
