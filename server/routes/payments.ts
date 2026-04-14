import { Router, Response } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { createCommerceRepository } from '../data/commerce.js';

const router = Router();
const commerceRepo = createCommerceRepository();

// Apply multi-tenant middleware to all payment routes
router.use(extractMultiTenant);

// ── GET /api/payments ─────────────────────────────────────────
router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const { status, risk_level, q } = req.query;
    
    const payments = await commerceRepo.listPayments(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId! },
      { 
        status: status as string, 
        risk_level: risk_level as string, 
        q: q as string 
      }
    );
    
    res.json(payments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/payments/:id ─────────────────────────────────────
router.get('/:id/context', async (req: MultiTenantRequest, res: Response) => {
  try {
    const context = await commerceRepo.getPaymentContext(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId! },
      req.params.id
    );
    if (!context) return res.status(404).json({ error: 'Payment context not found' });
    res.json(context);
  } catch (error) {
    console.error('Error fetching payment context:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const payment = await commerceRepo.getPayment(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId! },
      req.params.id
    );
    
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    
    res.json(payment);
  } catch (error) {
    console.error('Error fetching payment detail:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

// ── Returns Router ────────────────────────────────────────────
export const returnsRouter = Router();

// Apply multi-tenant middleware to all return routes
returnsRouter.use(extractMultiTenant);

// GET /api/returns
returnsRouter.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const { status, risk_level, q } = req.query;
    
    const returns = await commerceRepo.listReturns(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId! },
      { 
        status: status as string, 
        risk_level: risk_level as string, 
        q: q as string 
      }
    );
    
    res.json(returns);
  } catch (error) {
    console.error('Error fetching returns:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/returns/:id
returnsRouter.get('/:id/context', async (req: MultiTenantRequest, res: Response) => {
  try {
    const context = await commerceRepo.getReturnContext(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId! },
      req.params.id
    );
    if (!context) return res.status(404).json({ error: 'Return context not found' });
    res.json(context);
  } catch (error) {
    console.error('Error fetching return context:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

returnsRouter.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const ret = await commerceRepo.getReturn(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId! },
      req.params.id
    );
    
    if (!ret) return res.status(404).json({ error: 'Return not found' });

    res.json(ret);
  } catch (error) {
    console.error('Error fetching return detail:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
