import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { validate } from '../middleware/validate.js';
import { createAuditRepository, createCustomerRepository } from '../data/index.js';
import { getSupabaseAdmin } from '../db/supabase.js';

const MergeCustomerBodySchema = z.object({
  sourceId: z.string().min(1, 'sourceId is required'),
});

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

// ── PATCH /api/customers/:id ─────────────────────────────────
// Update mutable fields: segment, risk_level, preferred_channel, fraud_flag, name, email, phone
router.patch('/:id', requirePermission('customers.write'), async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };

    const existing = await customerRepository.getDetail(scope, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Customer not found' });

    const ALLOWED_FIELDS = ['segment', 'risk_level', 'preferred_channel', 'fraud_flag', 'canonical_name', 'canonical_email', 'phone'];
    const body = req.body ?? {};
    const updates: Record<string, any> = {};
    for (const field of ALLOWED_FIELDS) {
      if (field in body) updates[field] = body[field];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: `At least one updatable field required: ${ALLOWED_FIELDS.join(', ')}`,
      });
    }

    await customerRepository.update(scope, req.params.id, {
      ...updates,
      updated_at: new Date().toISOString(),
    });

    await auditRepository.log(scope, {
      actorId: req.userId || 'system',
      action: 'CUSTOMER_UPDATED',
      entityType: 'customer',
      entityId: req.params.id,
      oldValue: Object.fromEntries(Object.keys(updates).map((k) => [k, (existing as any)[k] ?? null])),
      newValue: updates,
      metadata: { source: 'customers_api' },
    });

    const updated = await customerRepository.getDetail(scope, req.params.id);
    res.json(updated ?? { id: req.params.id, ...updates });
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/customers/:id/merge ─────────────────────────────────────────────
//
// Merges sourceId INTO :id (the target/survivor). All linked records are
// re-pointed at the target; source customer is tagged as merged.
//
// Body: { sourceId: string }

router.post('/:id/merge', requirePermission('customers.write'), validate({ body: MergeCustomerBodySchema }), async (req: MultiTenantRequest, res: Response) => {
  const targetId = req.params.id;
  const { sourceId } = req.body as z.infer<typeof MergeCustomerBodySchema>;

  if (sourceId === targetId) return res.status(400).json({ error: 'sourceId and targetId must be different' });

  const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
  const supabase = getSupabaseAdmin();

  // Verify both customers exist in this tenant
  const [targetRes, sourceRes] = await Promise.all([
    customerRepository.getDetail(scope, targetId),
    customerRepository.getDetail(scope, sourceId),
  ]);
  if (!targetRes) return res.status(404).json({ error: 'Target customer not found' });
  if (!sourceRes) return res.status(404).json({ error: 'Source customer not found' });

  try {
    // ── 1. Re-point all linked records ─────────────────────────────────────
    await Promise.all([
      supabase.from('cases').update({ customer_id: targetId }).eq('customer_id', sourceId).eq('tenant_id', scope.tenantId),
      supabase.from('orders').update({ customer_id: targetId }).eq('customer_id', sourceId).eq('tenant_id', scope.tenantId),
      supabase.from('payments').update({ customer_id: targetId }).eq('customer_id', sourceId).eq('tenant_id', scope.tenantId),
    ]);

    // ── 2. Tag source customer as merged (non-destructive) ──────────────────
    await customerRepository.update(scope, sourceId, {
      segment:        'Merged',
      canonical_name: `${(sourceRes as any).canonical_name ?? (sourceRes as any).name ?? ''} [merged into ${targetId.slice(0, 8)}]`,
      updated_at:     new Date().toISOString(),
    } as any);

    // ── 3. Audit ────────────────────────────────────────────────────────────
    await auditRepository.log(scope, {
      actorId:    req.userId || 'system',
      action:     'CUSTOMER_MERGED',
      entityType: 'customer',
      entityId:   targetId,
      newValue:   { sourceId, targetId },
    });

    res.json({ ok: true, targetId, sourceId });
  } catch (err: any) {
    console.error('Error merging customers:', err);
    res.status(500).json({ error: err.message ?? 'Internal server error' });
  }
});

export default router;
