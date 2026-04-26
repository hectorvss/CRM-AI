import { Router, Response } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { createAuditRepository, createCustomerRepository } from '../data/index.js';

const router = Router();
const customerRepository = createCustomerRepository();
const auditRepository = createAuditRepository();

router.use(extractMultiTenant);

router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const customers = await customerRepository.list(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId! },
      {
        segment: typeof req.query.segment === 'string' ? req.query.segment : undefined,
        risk_level: typeof req.query.risk_level === 'string' ? req.query.risk_level : undefined,
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
      },
    );

    res.json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', requirePermission('customers.write'), async (req: MultiTenantRequest, res: Response) => {
  try {
    const payload = req.body ?? {};
    const name = String(payload.canonical_name ?? payload.canonicalName ?? payload.name ?? '').trim();
    const email = String(payload.canonical_email ?? payload.canonicalEmail ?? payload.email ?? '').trim();

    if (!name && !email) {
      return res.status(400).json({ error: 'Customer name or email is required' });
    }

    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const id = await customerRepository.createStub(scope, {
      ...payload,
      canonicalName: name || email || 'Unknown Customer',
      canonicalEmail: email || null,
      email: email || null,
      identitySystem: payload.identitySystem ?? payload.source ?? 'manual',
      identityExternalId: payload.identityExternalId ?? payload.external_id ?? (email || `manual_${Date.now()}`),
    });

    await auditRepository.log(scope, {
      actorId: req.userId || 'system',
      action: 'CUSTOMER_CREATED',
      entityType: 'customer',
      entityId: id,
      newValue: { id, name, email },
      metadata: { source: 'customers_api' },
    });

    const created = await customerRepository.getDetail(scope, id);
    res.status(201).json(created ?? { id, canonical_name: name, canonical_email: email });
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const detail = await customerRepository.getDetail(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId! },
      req.params.id,
    );

    if (!detail) return res.status(404).json({ error: 'Customer not found' });

    res.json(detail);
  } catch (error) {
    console.error('Error fetching customer detail:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/state', async (req: MultiTenantRequest, res: Response) => {
  try {
    const state = await customerRepository.getState(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId! },
      req.params.id,
    );
    if (!state) return res.status(404).json({ error: 'Customer not found' });
    res.json(state);
  } catch (error) {
    console.error('Error fetching customer state:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Unified activity timeline (messages, orders, payments, agent notes, AI events, system logs)
router.get('/:id/activity', async (req: MultiTenantRequest, res: Response) => {
  try {
    const activity = await customerRepository.getActivity(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId! },
      req.params.id,
    );
    res.json(activity);
  } catch (error) {
    console.error('Error fetching customer activity:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
