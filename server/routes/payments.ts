import { Router, Response } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { sendError } from '../http/errors.js';
import { createCommerceRepository } from '../data/index.js';

const router = Router();
const commerceRepo = createCommerceRepository();

// Apply multi-tenant middleware to all payment routes
router.use(extractMultiTenant);

// ── GET /api/payments ─────────────────────────────────────────
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

// ── GET /api/payments/:id/context ─────────────────────────────
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

// ── GET /api/payments/:id ─────────────────────────────────────
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

// ── Returns Router ────────────────────────────────────────────
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
