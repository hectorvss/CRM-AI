import { Router } from 'express';
import { sendError } from '../http/errors.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';

import { createAuditRepository, createBillingRepository } from '../data/index.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { getStripe } from '../integrations/stripe/client.js';
import {
  getPlanPriceId,
  getTopupPriceId,
  getFlexibleUsagePriceId,
  TOPUP_CREDITS,
  type PlanCode,
  type PlanInterval,
  type TopupPack,
} from '../integrations/stripe/plans.js';
import { logger } from '../utils/logger.js';
import { getUsageSummary } from '../services/aiUsageMeter.js';

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

// ── Stripe-backed endpoints ─────────────────────────────────────────────────

/**
 * Resolve (and lazily create) the Stripe customer for an organization.
 * Persists the customer ID into billing_subscriptions.external_customer_id.
 */
async function ensureStripeCustomer(
  orgId: string,
  tenantId: string,
  options: { email?: string; name?: string } = {},
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const stripe = getStripe();

  const { data: existing } = await supabase
    .from('billing_subscriptions')
    .select('id, external_customer_id')
    .eq('org_id', orgId)
    .maybeSingle();

  if (existing?.external_customer_id) return existing.external_customer_id;

  const customer = await stripe.customers.create({
    email: options.email,
    name: options.name,
    metadata: { org_id: orgId, tenant_id: tenantId },
  });

  if (existing?.id) {
    await supabase
      .from('billing_subscriptions')
      .update({ external_customer_id: customer.id })
      .eq('id', existing.id);
  } else {
    await supabase.from('billing_subscriptions').insert({
      id: `sub_${Date.now()}`,
      org_id: orgId,
      tenant_id: tenantId,
      external_customer_id: customer.id,
      status: 'incomplete',
      plan_id: 'starter',
    });
  }

  return customer.id;
}

router.post('/:orgId/checkout-session', requirePermission('billing.manage'), async (req: MultiTenantRequest, res) => {
  try {
    const stripe = getStripe();

    // New shape: { plan: 'starter'|'growth'|'scale', interval: 'month'|'year' }
    // Back-compat: a raw priceId in the body still works, and if neither is
    // provided we fall back to the legacy STRIPE_PRICE_ID_PRO env var.
    const planRaw = String(req.body?.plan ?? '').toLowerCase() as PlanCode;
    const intervalRaw = String(req.body?.interval ?? 'month').toLowerCase() as PlanInterval;
    const validPlans: PlanCode[] = ['starter', 'growth', 'scale'];
    const validIntervals: PlanInterval[] = ['month', 'year'];

    let priceId: string | null | undefined = req.body?.priceId || null;
    let resolvedPlan: PlanCode | null = null;
    let resolvedInterval: PlanInterval | null = null;

    if (!priceId && validPlans.includes(planRaw)) {
      const interval: PlanInterval = validIntervals.includes(intervalRaw) ? intervalRaw : 'month';
      priceId = getPlanPriceId(planRaw, interval);
      resolvedPlan = planRaw;
      resolvedInterval = interval;
      if (!priceId) {
        return sendError(
          res,
          501,
          'PRICE_ID_NOT_CONFIGURED',
          `Stripe Price ID for plan="${planRaw}" interval="${interval}" is not configured. ` +
          `Set STRIPE_PRICE_ID_${planRaw.toUpperCase()}_${interval === 'year' ? 'ANNUAL' : 'MONTHLY'}.`,
        );
      }
    }

    // Final fallback to legacy single-price env var.
    if (!priceId) priceId = process.env.STRIPE_PRICE_ID_PRO || process.env.STRIPE_PRICE_PRO || null;

    if (!priceId) {
      return sendError(
        res,
        400,
        'MISSING_PRICE_ID',
        'No Stripe Price ID could be resolved. Pass {plan, interval} or configure STRIPE_PRICE_ID_*_MONTHLY/ANNUAL.',
      );
    }

    const successUrl =
      req.body?.successUrl ||
      process.env.STRIPE_SUCCESS_URL ||
      `${process.env.APP_URL ?? 'http://localhost:3005'}/billing/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl =
      req.body?.cancelUrl ||
      process.env.STRIPE_CANCEL_URL ||
      `${process.env.APP_URL ?? 'http://localhost:3005'}/billing/cancel`;

    const customerEmail = req.body?.email || (req as any).userEmail || undefined;

    const customerId = await ensureStripeCustomer(req.params.orgId, req.tenantId!, {
      email: customerEmail,
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      client_reference_id: req.params.orgId,
      metadata: {
        org_id: req.params.orgId,
        tenant_id: req.tenantId!,
        workspace_id: req.workspaceId ?? '',
        plan: resolvedPlan ?? '',
        interval: resolvedInterval ?? '',
      },
      subscription_data: {
        metadata: {
          org_id: req.params.orgId,
          tenant_id: req.tenantId!,
          workspace_id: req.workspaceId ?? '',
          plan: resolvedPlan ?? '',
          interval: resolvedInterval ?? '',
        },
      },
    });

    await auditRepository.log({ tenantId: req.tenantId!, workspaceId: req.workspaceId! }, {
      actorId: req.userId || 'system',
      action: 'BILLING_CHECKOUT_SESSION_CREATED',
      entityType: 'subscription',
      entityId: req.params.orgId,
      newValue: { sessionId: session.id, priceId },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (error: any) {
    logger.error('Stripe checkout-session error', error, { orgId: req.params.orgId });
    sendError(res, 500, 'STRIPE_CHECKOUT_FAILED', error?.message || 'Could not create checkout session');
  }
});

router.post('/:orgId/portal-session', requirePermission('billing.manage'), async (req: MultiTenantRequest, res) => {
  try {
    const stripe = getStripe();
    const supabase = getSupabaseAdmin();

    const { data: sub } = await supabase
      .from('billing_subscriptions')
      .select('external_customer_id')
      .eq('org_id', req.params.orgId)
      .maybeSingle();

    let customerId = sub?.external_customer_id;
    if (!customerId) {
      customerId = await ensureStripeCustomer(req.params.orgId, req.tenantId!, {
        email: req.body?.email || (req as any).userEmail,
      });
    }

    const returnUrl =
      req.body?.returnUrl ||
      process.env.STRIPE_PORTAL_RETURN_URL ||
      `${process.env.APP_URL ?? 'http://localhost:3005'}/settings/billing`;

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    res.json({ url: portal.url });
  } catch (error: any) {
    logger.error('Stripe portal-session error', error, { orgId: req.params.orgId });
    sendError(res, 500, 'STRIPE_PORTAL_FAILED', error?.message || 'Could not create portal session');
  }
});

// ── Top-up checkout (one-time payment for a credit pack) ────────────────────
router.post('/:orgId/topup-checkout', requirePermission('billing.manage'), async (req: MultiTenantRequest, res) => {
  try {
    const stripe = getStripe();
    const pack = String(req.body?.pack ?? '').toLowerCase() as TopupPack;
    if (!['5k', '20k', '50k'].includes(pack)) {
      return sendError(res, 400, 'INVALID_TOPUP_PACK', 'pack must be one of "5k", "20k", "50k"');
    }

    const priceId = getTopupPriceId(pack);
    if (!priceId) {
      return sendError(
        res,
        501,
        'TOPUP_PRICE_NOT_CONFIGURED',
        `STRIPE_PRICE_ID_TOPUP_${pack.toUpperCase()} is not configured`,
      );
    }

    const credits = TOPUP_CREDITS[pack];
    const customerEmail = req.body?.email || (req as any).userEmail || undefined;
    const customerId = await ensureStripeCustomer(req.params.orgId, req.tenantId!, { email: customerEmail });

    const successUrl =
      req.body?.successUrl ||
      `${process.env.APP_URL ?? 'http://localhost:3005'}/billing/success?topup=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl =
      req.body?.cancelUrl ||
      `${process.env.APP_URL ?? 'http://localhost:3005'}/billing/cancel?topup=cancelled`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: req.params.orgId,
      metadata: {
        org_id: req.params.orgId,
        tenant_id: req.tenantId!,
        workspace_id: req.workspaceId ?? '',
        kind: 'topup',
        pack,
        credits: String(credits),
      },
      payment_intent_data: {
        metadata: {
          org_id: req.params.orgId,
          tenant_id: req.tenantId!,
          workspace_id: req.workspaceId ?? '',
          kind: 'topup',
          pack,
          credits: String(credits),
        },
      },
    });

    await auditRepository.log({ tenantId: req.tenantId!, workspaceId: req.workspaceId! }, {
      actorId: req.userId || 'system',
      action: 'BILLING_TOPUP_CHECKOUT_CREATED',
      entityType: 'billing',
      entityId: req.params.orgId,
      newValue: { sessionId: session.id, pack, credits, priceId },
    });

    res.json({ url: session.url, sessionId: session.id, pack, credits });
  } catch (error: any) {
    logger.error('Stripe topup-checkout error', error, { orgId: req.params.orgId });
    sendError(res, 500, 'STRIPE_TOPUP_FAILED', error?.message || 'Could not create top-up checkout session');
  }
});

// ── Flexible (metered) usage on/off ─────────────────────────────────────────
router.post('/:orgId/flexible-usage/enable', requirePermission('billing.manage'), async (req: MultiTenantRequest, res) => {
  try {
    const stripe = getStripe();
    const supabase = getSupabaseAdmin();

    const flexPriceId = getFlexibleUsagePriceId();
    if (!flexPriceId) {
      return sendError(res, 501, 'FLEXIBLE_PRICE_NOT_CONFIGURED', 'STRIPE_PRICE_ID_FLEXIBLE_USAGE is not configured');
    }

    const capCredits =
      req.body?.capCredits === null || req.body?.capCredits === undefined
        ? null
        : Number(req.body.capCredits);
    if (capCredits !== null && (!Number.isFinite(capCredits) || capCredits < 0)) {
      return sendError(res, 400, 'INVALID_CAP', 'capCredits must be a non-negative number or omitted');
    }

    const { data: sub } = await supabase
      .from('billing_subscriptions')
      .select('id, external_subscription_id, status')
      .eq('org_id', req.params.orgId)
      .maybeSingle();

    if (!sub?.external_subscription_id || !['active', 'trialing', 'past_due'].includes(sub.status ?? '')) {
      return sendError(res, 400, 'NO_ACTIVE_SUBSCRIPTION', 'Active subscription required');
    }

    // Skip if already attached.
    const stripeSub = await stripe.subscriptions.retrieve(sub.external_subscription_id);
    let item = stripeSub.items.data.find((it) => it.price?.id === flexPriceId);
    if (!item) {
      item = await stripe.subscriptionItems.create({
        subscription: sub.external_subscription_id,
        price: flexPriceId,
      });
    }

    await supabase
      .from('billing_subscriptions')
      .update({
        flexible_usage_enabled: true,
        flexible_usage_cap_credits: capCredits,
        flexible_usage_subscription_item_id: item.id,
      })
      .eq('id', sub.id);

    await auditRepository.log({ tenantId: req.tenantId!, workspaceId: req.workspaceId! }, {
      actorId: req.userId || 'system',
      action: 'BILLING_FLEXIBLE_USAGE_ENABLED',
      entityType: 'subscription',
      entityId: req.params.orgId,
      newValue: { subscriptionItemId: item.id, capCredits },
    });

    res.json({ enabled: true, subscriptionItemId: item.id, capCredits });
  } catch (error: any) {
    logger.error('Stripe flexible-usage/enable error', error, { orgId: req.params.orgId });
    sendError(res, 500, 'FLEXIBLE_USAGE_ENABLE_FAILED', error?.message || 'Could not enable flexible usage');
  }
});

router.post('/:orgId/flexible-usage/disable', requirePermission('billing.manage'), async (req: MultiTenantRequest, res) => {
  try {
    const stripe = getStripe();
    const supabase = getSupabaseAdmin();

    const { data: sub } = await supabase
      .from('billing_subscriptions')
      .select('id, external_subscription_id, flexible_usage_subscription_item_id')
      .eq('org_id', req.params.orgId)
      .maybeSingle();

    if (sub?.flexible_usage_subscription_item_id) {
      try {
        await stripe.subscriptionItems.del(sub.flexible_usage_subscription_item_id, {
          clear_usage: false,
        });
      } catch (err: any) {
        // If Stripe says the item is gone, swallow and continue clearing local state.
        logger.warn('Stripe flexible-usage/disable: subscriptionItems.del failed', {
          error: err?.message,
          itemId: sub.flexible_usage_subscription_item_id,
        });
      }
    }

    if (sub?.id) {
      await supabase
        .from('billing_subscriptions')
        .update({
          flexible_usage_enabled: false,
          flexible_usage_cap_credits: null,
          flexible_usage_subscription_item_id: null,
        })
        .eq('id', sub.id);
    }

    await auditRepository.log({ tenantId: req.tenantId!, workspaceId: req.workspaceId! }, {
      actorId: req.userId || 'system',
      action: 'BILLING_FLEXIBLE_USAGE_DISABLED',
      entityType: 'subscription',
      entityId: req.params.orgId,
    });

    res.json({ enabled: false });
  } catch (error: any) {
    logger.error('Stripe flexible-usage/disable error', error, { orgId: req.params.orgId });
    sendError(res, 500, 'FLEXIBLE_USAGE_DISABLE_FAILED', error?.message || 'Could not disable flexible usage');
  }
});

// ── AI credits usage (Cluster I) ────────────────────────────────────────────

/**
 * GET /api/billing/usage
 * Returns the AI credits usage summary for the caller's workspace.
 */
router.get('/usage', requirePermission('billing.read'), async (req: MultiTenantRequest, res) => {
  try {
    const summary = await getUsageSummary({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      userId: req.userId,
    });
    res.json(summary);
  } catch (error: any) {
    logger.error('Billing usage fetch error', error, { tenantId: req.tenantId });
    sendError(res, 500, 'USAGE_FETCH_FAILED', error?.message || 'Could not load usage');
  }
});

/**
 * GET /api/billing/usage/events?limit=50&offset=0
 * Paginated list of ai_usage_events for the workspace, newest first.
 */
router.get('/usage/events', requirePermission('billing.read'), async (req: MultiTenantRequest, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const supabase = getSupabaseAdmin();
    const { data, error, count } = await supabase
      .from('ai_usage_events')
      .select('*', { count: 'exact' })
      .eq('tenant_id', req.tenantId!)
      .eq('workspace_id', req.workspaceId!)
      .order('occurred_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    res.json({ events: data ?? [], total: count ?? 0, limit, offset });
  } catch (error: any) {
    logger.error('Billing usage events fetch error', error, { tenantId: req.tenantId });
    sendError(res, 500, 'USAGE_EVENTS_FETCH_FAILED', error?.message || 'Could not load usage events');
  }
});

/**
 * POST /api/billing/flexible-usage/toggle
 * Body: { enabled: boolean, capCredits?: number }
 *
 * Note: cluster J also exposes /:orgId/flexible-usage/enable and /:orgId/flexible-usage/disable
 * (which talk to Stripe). This endpoint is the simpler in-app toggle that
 * only flips the database flag; the UI should prefer the Stripe-aware
 * variants in production.
 */
router.post('/flexible-usage/toggle', requirePermission('billing.manage'), async (req: MultiTenantRequest, res) => {
  try {
    const enabled = Boolean(req.body?.enabled);
    const capCredits = req.body?.capCredits != null ? Number(req.body.capCredits) : null;
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('billing_subscriptions')
      .update({
        flexible_usage_enabled: enabled,
        flexible_usage_cap_credits: capCredits && Number.isFinite(capCredits) ? Math.max(0, Math.floor(capCredits)) : null,
      })
      .or(`org_id.eq.${req.tenantId},tenant_id.eq.${req.tenantId}`)
      .select('id, flexible_usage_enabled, flexible_usage_cap_credits')
      .maybeSingle();
    if (error) throw error;
    res.json({ ok: true, ...data });
  } catch (error: any) {
    logger.error('Flexible usage toggle error', error, { tenantId: req.tenantId });
    sendError(res, 500, 'FLEXIBLE_TOGGLE_FAILED', error?.message || 'Could not toggle flexible usage');
  }
});

export default router;
