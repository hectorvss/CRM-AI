import { Router } from 'express';
import { sendError } from '../http/errors.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { createBillingRepository } from '../data/index.js';
import { createWorkspaceRepository } from '../data/workspaces.js';
import { randomUUID } from 'crypto';

const router = Router();
const billingRepo = createBillingRepository();
const workspaceRepo = createWorkspaceRepository();

const PLAN_PRESETS: Record<string, { seatsIncluded: number; creditsIncluded: number }> = {
  starter: { seatsIncluded: 3, creditsIncluded: 5000 },
  growth: { seatsIncluded: 8, creditsIncluded: 20000 },
  scale: { seatsIncluded: 20, creditsIncluded: 60000 },
  business: { seatsIncluded: 25, creditsIncluded: 100000 },
};

router.use(extractMultiTenant);

// Get subscription details for an organization
router.get('/:orgId/subscription', requirePermission('billing.read'), async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId! };
    const sub = await billingRepo.getSubscription(scope, req.params.orgId);
    res.json(sub);
  } catch (error) {
    console.error('Error fetching subscription:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// List invoices / credit ledger
router.get('/:orgId/ledger', requirePermission('billing.read'), async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId! };
    const ledger = await billingRepo.getLedger(scope, req.params.orgId);
    res.json(ledger);
  } catch (error) {
    console.error('Error fetching ledger:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.patch('/:orgId/subscription', requirePermission('settings.write'), async (req: MultiTenantRequest, res) => {
  if (!req.tenantId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant context is missing');
  }

  const { plan_id } = req.body as { plan_id?: string };
  if (!plan_id || typeof plan_id !== 'string') {
    return sendError(res, 400, 'INVALID_PLAN', 'plan_id is required');
  }

  const preset = PLAN_PRESETS[plan_id.toLowerCase()];
  if (!preset) {
    return sendError(res, 400, 'UNKNOWN_PLAN', 'Unknown plan');
  }

  try {
    const scope = { tenantId: req.tenantId! };
    const existing = await billingRepo.getSubscription(scope, req.params.orgId);
    if (!existing) {
      return sendError(res, 404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found');
    }

    await billingRepo.updateSubscription(scope, req.params.orgId, {
      plan_id,
      seats_included: preset.seatsIncluded,
      credits_included: preset.creditsIncluded,
      status: existing.status || 'active',
    });
    const workspace = await workspaceRepo.findByOrg(req.params.orgId);
    if (workspace) {
      await workspaceRepo.updateWorkspace(workspace.id, { planId: plan_id });
    }
    await billingRepo.addLedgerEntry(scope, {
      id: randomUUID(),
      org_id: req.params.orgId,
      entry_type: 'debit',
      amount: preset.creditsIncluded > 0 ? preset.creditsIncluded / 100 : 0,
      reason: `Plan changed to ${plan_id}`,
      reference_id: existing.id || req.params.orgId,
      balance_after: preset.creditsIncluded,
    });
    const updated = await billingRepo.getSubscription(scope, req.params.orgId);
    res.json(updated);
  } catch (error) {
    console.error('Error updating subscription:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.post('/:orgId/top-ups', requirePermission('settings.write'), async (req: MultiTenantRequest, res) => {
  if (!req.tenantId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant context is missing');
  }

  const { type, quantity, amount_cents } = req.body as { type?: 'credits' | 'seats'; quantity?: number; amount_cents?: number };
  if (type !== 'credits' && type !== 'seats') {
    return sendError(res, 400, 'INVALID_TOPUP_TYPE', 'type must be credits or seats');
  }
  if (typeof quantity !== 'number' || quantity <= 0) {
    return sendError(res, 400, 'INVALID_TOPUP_QUANTITY', 'quantity must be a positive number');
  }

  try {
    const scope = { tenantId: req.tenantId! };
    const subscription = await billingRepo.getSubscription(scope, req.params.orgId);
    if (!subscription) {
      return sendError(res, 404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found');
    }

    const nextFields =
      type === 'credits'
        ? { credits_included: Number(subscription.credits_included || 0) + quantity }
        : { seats_included: Number(subscription.seats_included || 0) + quantity };

    await billingRepo.updateSubscription(scope, req.params.orgId, nextFields);
    await billingRepo.addLedgerEntry(scope, {
      id: randomUUID(),
      org_id: req.params.orgId,
      entry_type: 'debit',
      amount: typeof amount_cents === 'number' ? amount_cents / 100 : quantity,
      reason: type === 'credits' ? `Bought ${quantity.toLocaleString()} credits` : `Bought ${quantity} seats`,
      reference_id: subscription.id || req.params.orgId,
      balance_after: type === 'credits'
        ? Number(subscription.credits_included || 0) + quantity
        : Number(subscription.seats_included || 0) + quantity,
    });

    const updated = await billingRepo.getSubscription(scope, req.params.orgId);
    res.json(updated);
  } catch (error) {
    console.error('Error applying top-up:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

export default router;
