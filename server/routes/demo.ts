import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';

const router = Router();

router.use(extractMultiTenant);

const SCENARIOS = [
  {
    id: 'refund-psp-oms-mismatch',
    title: 'Refund approved in Stripe but pending in OMS',
    description: 'Stripe says the refund succeeded, while the order workflow still believes the refund is pending.',
  },
  {
    id: 'cancel-after-packing',
    title: 'Cancellation requested after packing',
    description: 'Customer asks to cancel after warehouse packing has started.',
  },
  {
    id: 'damaged-item-return',
    title: 'Delivered item arrived damaged',
    description: 'Delivered order with customer-reported damage and return flow in progress.',
  },
  {
    id: 'vip-policy-exception',
    title: 'VIP return outside standard policy',
    description: 'VIP customer is outside the return window but may deserve a goodwill exception.',
  },
];

router.get('/scenarios', (_req: MultiTenantRequest, res: Response) => {
  res.json({ scenarios: SCENARIOS });
});

router.post('/scenarios/:id/run', (req: MultiTenantRequest, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Demo routes are disabled in production' });
  }

  const scenario = SCENARIOS.find(item => item.id === req.params.id);
  if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

  res.status(202).json({
    run_id: `demo:${new Date().toISOString()}:${randomUUID()}`,
    scenario: scenario.id,
    status: 'accepted',
    note: 'Demo scenario catalogue is available. Seed injection is handled by the local demo sandbox when installed.',
  });
});

router.post('/scenarios/all/run', (req: MultiTenantRequest, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Demo routes are disabled in production' });
  }

  res.status(202).json({
    run_id: `demo:${new Date().toISOString()}:${randomUUID()}`,
    scenarios: SCENARIOS.map(item => item.id),
    status: 'accepted',
    note: 'Demo scenario catalogue is available. Seed injection is handled by the local demo sandbox when installed.',
  });
});

router.post('/reset', (_req: MultiTenantRequest, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Demo routes are disabled in production' });
  }

  res.json({ success: true, reset: false });
});

export default router;
