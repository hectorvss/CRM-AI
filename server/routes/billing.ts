import { Router } from 'express';
import { sendError } from '../http/errors.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';

import { createAuditRepository, createBillingRepository } from '../data/index.js';
import { getSupabaseAdmin } from '../db/supabase.js';

const router = Router();
const billingRepository = createBillingRepository();
const auditRepository = createAuditRepository();
router.use(extractMultiTenant);

// Get subscription details for an organization
router.get('/:orgId/subscription', requirePermission('billing.read'), async (req: MultiTenantRequest, res) => {
  try {
    const sub = await billingRepository.getSubscription({ tenantId: req.tenantId! }, req.params.orgId);
    res.json(sub);
  } catch (error) {
    console.error('Error fetching subscription:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// List invoices / credit ledger
router.get('/:orgId/ledger', requirePermission('billing.read'), async (req: MultiTenantRequest, res) => {
  try {
    const ledger = await billingRepository.getLedger({ tenantId: req.tenantId! }, req.params.orgId);
    res.json(ledger);
  } catch (error) {
    console.error('Error fetching ledger:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.patch('/:orgId/subscription', requirePermission('billing.manage'), async (req: MultiTenantRequest, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const updates = {
      plan_id: req.body?.plan_id ?? req.body?.plan,
      status: req.body?.status,
      seats_included: req.body?.seats_included ?? req.body?.seats,
      credits_included: req.body?.credits_included,
    };
    Object.keys(updates).forEach((key) => (updates as any)[key] === undefined && delete (updates as any)[key]);

    const { data, error } = await supabase
      .from('billing_subscriptions')
      .update(updates)
      .eq('org_id', req.params.orgId)
      .select('*')
      .maybeSingle();
    if (error) throw error;

    await auditRepository.log({ tenantId: req.tenantId!, workspaceId: req.workspaceId! }, {
      actorId: req.userId || 'system',
      action: 'BILLING_SUBSCRIPTION_UPDATED',
      entityType: 'subscription',
      entityId: req.params.orgId,
      newValue: updates,
    });

    res.json(data ?? { ok: true, orgId: req.params.orgId, ...updates });
  } catch (error) {
    console.error('Error updating subscription:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.post('/:orgId/top-up', requirePermission('billing.manage'), async (req: MultiTenantRequest, res) => {
  try {
    const credits = Number(req.body?.credits ?? req.body?.amount ?? 0);
    if (!Number.isFinite(credits) || credits <= 0) {
      return sendError(res, 400, 'INVALID_TOP_UP', 'A positive credit amount is required');
    }

    const entry = {
      id: `ledger_${Date.now()}`,
      tenant_id: req.tenantId!,
      org_id: req.params.orgId,
      entry_type: 'credit',
      amount: credits,
      reason: req.body?.description ?? req.body?.reason ?? 'Manual credit top-up',
      reference_id: req.body?.reference_id ?? null,
      balance_after: Number(req.body?.balance_after ?? credits),
      occurred_at: new Date().toISOString(),
    };

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('credit_ledger').insert(entry);
    if (error) throw error;

    await auditRepository.log({ tenantId: req.tenantId!, workspaceId: req.workspaceId! }, {
      actorId: req.userId || 'system',
      action: 'BILLING_CREDITS_TOPPED_UP',
      entityType: 'billing',
      entityId: req.params.orgId,
      newValue: entry,
    });

    res.status(201).json(entry);
  } catch (error) {
    console.error('Error topping up credits:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

export default router;
