/**
 * server/webhooks/stripe.ts
 *
 * Real Stripe webhook handler.
 *
 * Flow:
 *  1. Verify Stripe-Signature header using `stripe.webhooks.constructEvent`
 *     against the raw request body and STRIPE_WEBHOOK_SECRET.
 *  2. Deduplicate using the Stripe event ID (webhook_events.dedupe_key).
 *  3. Persist the raw payload to webhook_events.
 *  4. Process the event inline (subscription/invoice → DB writes).
 *  5. Respond 200 to Stripe. Transient handler errors return 5xx so Stripe
 *     retries with exponential back-off.
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import type Stripe from 'stripe';
import { createIntegrationRepository } from '../data/integrations.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import {
  getStripe,
  getStripeWebhookSecret,
  isStripeNotConfiguredError,
} from '../integrations/stripe/client.js';
import {
  resolvePlanFromPriceId as resolvePlanFromPriceIdNew,
  creditsForPlan,
  type PlanCode,
} from '../integrations/stripe/plans.js';
import { logger } from '../utils/logger.js';

export const stripeWebhookRouter = Router();

const HANDLED_EVENT_TYPES = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
]);

function resolvePlanFromPriceId(priceId: string | null | undefined): string {
  return resolvePlanFromPriceIdNew(priceId);
}

function extractWorkspaceId(obj: Record<string, any> | null | undefined): string | null {
  if (!obj) return null;
  return obj?.metadata?.workspace_id ?? null;
}

/**
 * Insert a credit_grants row idempotently.  Conflicts on stripe_session_id /
 * stripe_invoice_id (the UNIQUE columns) are swallowed: webhook retries
 * arriving after the first successful processing must not double-credit.
 */
async function recordCreditGrant(opts: {
  tenantId: string;
  workspaceId: string;
  subscriptionId?: string | null;
  stripeSessionId?: string | null;
  stripeInvoiceId?: string | null;
  credits: number;
  source: 'plan_renewal' | 'topup' | 'manual' | 'enterprise';
  status?: 'pending' | 'active' | 'consumed';
  metadata?: Record<string, any>;
}): Promise<{ inserted: boolean }> {
  const supabase = getSupabaseAdmin();
  const row = {
    tenant_id: opts.tenantId,
    workspace_id: opts.workspaceId,
    subscription_id: opts.subscriptionId ?? null,
    stripe_session_id: opts.stripeSessionId ?? null,
    stripe_invoice_id: opts.stripeInvoiceId ?? null,
    credits: opts.credits,
    source: opts.source,
    status: opts.status ?? 'active',
    metadata: opts.metadata ?? null,
  };

  const { error } = await supabase.from('credit_grants').insert(row);
  if (error) {
    // 23505 = unique_violation → already processed, treat as success.
    if ((error as any).code === '23505') {
      logger.debug('credit_grants: duplicate suppressed', {
        sessionId: opts.stripeSessionId, invoiceId: opts.stripeInvoiceId,
      });
      return { inserted: false };
    }
    logger.warn('credit_grants insert failed', { error: error.message });
    throw error;
  }
  return { inserted: true };
}

function extractOrgId(obj: Record<string, any> | null | undefined): string | null {
  if (!obj) return null;
  return (
    obj?.metadata?.org_id ??
    obj?.metadata?.tenant_id ??
    obj?.client_reference_id ??
    null
  );
}

async function resolveOrgIdByCustomer(customerId: string | null | undefined): Promise<string | null> {
  if (!customerId) return null;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('billing_subscriptions')
    .select('org_id, tenant_id')
    .eq('external_customer_id', customerId)
    .maybeSingle();
  return data?.org_id ?? data?.tenant_id ?? null;
}

async function handleTopupCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const supabase = getSupabaseAdmin();
  const orgId = extractOrgId(session as any) || (await resolveOrgIdByCustomer(session.customer as string));
  if (!orgId) {
    logger.warn('Stripe checkout.session.completed (topup): no org_id mapping', { sessionId: session.id });
    return;
  }
  const workspaceId = extractWorkspaceId(session as any) ?? orgId;
  const credits = Number(session.metadata?.credits ?? 0);
  if (!Number.isFinite(credits) || credits <= 0) {
    logger.warn('Stripe topup checkout: missing/invalid credits metadata', {
      sessionId: session.id, metadata: session.metadata,
    });
    return;
  }

  const { inserted } = await recordCreditGrant({
    tenantId: orgId,
    workspaceId,
    stripeSessionId: session.id,
    credits,
    source: 'topup',
    status: 'active',
    metadata: { pack: session.metadata?.pack, payment_intent: session.payment_intent },
  });

  if (!inserted) return; // duplicate — balance already updated

  // Bump the topup balance on billing_subscriptions.  Use raw SQL via RPC
  // when available; otherwise read-modify-write.  We use read-modify-write
  // here for simplicity — the UNIQUE on credit_grants prevents double-apply.
  const { data: sub } = await supabase
    .from('billing_subscriptions')
    .select('id, ai_credits_topup_balance')
    .eq('org_id', orgId)
    .maybeSingle();

  if (sub?.id) {
    const current = Number(sub.ai_credits_topup_balance ?? 0);
    const { error } = await supabase
      .from('billing_subscriptions')
      .update({ ai_credits_topup_balance: current + credits })
      .eq('id', sub.id);
    if (error) {
      // Column may not exist yet (cluster I migration not applied) — log soft.
      logger.warn('billing_subscriptions.ai_credits_topup_balance update failed (cluster I migration?)', {
        error: error.message, orgId, credits,
      });
    }
  }

  logger.info('Stripe topup processed', { orgId, credits, sessionId: session.id });
}

async function handleCheckoutCompleted(event: Stripe.Event): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  const supabase = getSupabaseAdmin();

  // Branch top-up (one-time) checkouts.
  if (session.mode === 'payment' && session.metadata?.kind === 'topup') {
    return handleTopupCheckoutCompleted(session);
  }

  const orgId = extractOrgId(session as any) || (await resolveOrgIdByCustomer(session.customer as string));
  if (!orgId) {
    logger.warn('Stripe checkout.session.completed: no org_id mapping', { sessionId: session.id });
    return;
  }
  const workspaceId = extractWorkspaceId(session as any) ?? orgId;

  let priceId: string | null = null;
  let currentPeriodStart: string | undefined;
  let currentPeriodEnd: string | undefined;
  let subscriptionStatus: string = 'active';
  if (session.subscription) {
    try {
      const stripe = getStripe();
      const sub = await stripe.subscriptions.retrieve(session.subscription as string);
      priceId = sub.items?.data?.[0]?.price?.id ?? null;
      subscriptionStatus = sub.status ?? 'active';
      const start = (sub as any).current_period_start;
      const end = (sub as any).current_period_end;
      if (start) currentPeriodStart = new Date(start * 1000).toISOString();
      if (end)   currentPeriodEnd   = new Date(end * 1000).toISOString();
    } catch (err) {
      logger.warn('Could not retrieve subscription from session', { sessionId: session.id });
    }
  }

  const planCode = resolvePlanFromPriceId(priceId) as PlanCode;
  const includedCredits = creditsForPlan(planCode);
  const nowIso = new Date().toISOString();
  const oneMonthLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const updates: Record<string, any> = {
    org_id: orgId,
    external_customer_id: session.customer as string,
    external_subscription_id: session.subscription as string,
    status: subscriptionStatus,
    plan_id: planCode,
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
    // AI credit ledger fields owned by cluster I; we set them defensively.
    ai_credits_included: includedCredits,
    ai_credits_used_period: 0,
    ai_credits_period_start: currentPeriodStart ?? nowIso,
    ai_credits_period_end: currentPeriodEnd ?? oneMonthLater,
  };
  Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k]);

  const { data: existing } = await supabase
    .from('billing_subscriptions')
    .select('id')
    .eq('org_id', orgId)
    .maybeSingle();

  await upsertBillingSubscription(orgId, existing?.id, updates);

  if (includedCredits > 0 && session.subscription) {
    try {
      await recordCreditGrant({
        tenantId: orgId,
        workspaceId,
        subscriptionId: session.subscription as string,
        stripeSessionId: session.id,
        credits: includedCredits,
        source: 'plan_renewal',
        status: 'active',
        metadata: { plan: planCode, priceId },
      });
    } catch (err) {
      logger.warn('credit_grants insert failed for plan checkout', { error: (err as Error).message });
    }
  }

  logger.info('Stripe checkout.session.completed processed', {
    orgId, subscriptionId: session.subscription, plan: updates.plan_id,
  });
}

/**
 * UPDATE/INSERT helper that retries without cluster-I-owned ai_credits_*
 * columns when those have not yet been added to the schema.  This keeps
 * cluster J runnable independently of cluster I migration order.
 */
async function upsertBillingSubscription(
  orgId: string,
  existingId: string | null | undefined,
  updates: Record<string, any>,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const aiKeys = ['ai_credits_included', 'ai_credits_used_period', 'ai_credits_period_start', 'ai_credits_period_end'];

  const tryWrite = async (payload: Record<string, any>) => {
    if (existingId) {
      const { error } = await supabase.from('billing_subscriptions').update(payload).eq('id', existingId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('billing_subscriptions').insert({
        id: `sub_${Date.now()}`,
        tenant_id: orgId,
        ...payload,
      });
      if (error) throw error;
    }
  };

  try {
    await tryWrite(updates);
  } catch (err: any) {
    const msg = String(err?.message ?? '');
    const hasUnknownAiCol = aiKeys.some((k) => msg.includes(k));
    if (!hasUnknownAiCol) throw err;
    logger.warn('billing_subscriptions: ai_credits_* columns missing, retrying without them (cluster I migration?)');
    const stripped = { ...updates };
    aiKeys.forEach((k) => delete stripped[k]);
    await tryWrite(stripped);
  }
}

async function handleSubscriptionUpsert(event: Stripe.Event): Promise<void> {
  const sub = event.data.object as Stripe.Subscription;
  const supabase = getSupabaseAdmin();

  const orgId = extractOrgId(sub as any) || (await resolveOrgIdByCustomer(sub.customer as string));
  const isDeleted = event.type === 'customer.subscription.deleted';

  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  const start = (sub as any).current_period_start;
  const end = (sub as any).current_period_end;
  const updates: Record<string, any> = {
    status: isDeleted ? 'canceled' : (sub.status ?? 'active'),
    external_subscription_id: sub.id,
    external_customer_id: sub.customer as string,
    plan_id: resolvePlanFromPriceId(priceId),
    current_period_start: start ? new Date(start * 1000).toISOString() : undefined,
    current_period_end:   end   ? new Date(end * 1000).toISOString()   : undefined,
  };
  Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k]);

  const { data: bySub } = await supabase
    .from('billing_subscriptions')
    .update(updates)
    .eq('external_subscription_id', sub.id)
    .select('id')
    .maybeSingle();
  if (bySub) return;

  if (orgId) {
    const { data: byOrg } = await supabase
      .from('billing_subscriptions')
      .update(updates)
      .eq('org_id', orgId)
      .select('id')
      .maybeSingle();
    if (byOrg) return;

    await supabase.from('billing_subscriptions').insert({
      id: `sub_${Date.now()}`,
      tenant_id: orgId,
      org_id: orgId,
      ...updates,
    });
  }
}

async function handleInvoicePaymentSucceeded(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const supabase = getSupabaseAdmin();
  const orgId = extractOrgId(invoice as any) || (await resolveOrgIdByCustomer(invoice.customer as string));
  if (!orgId) {
    logger.warn('Stripe invoice.payment_succeeded: no org mapping', { invoiceId: invoice.id });
    return;
  }

  // ── Subscription renewal: reset period + re-apply included credits ──────
  const subscriptionId = (invoice as any).subscription as string | null | undefined;
  if (subscriptionId) {
    try {
      const stripe = getStripe();
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      // Pick the first non-metered price as the "plan" price.
      const planPrice = sub.items.data.find((it) => it.price?.recurring?.usage_type !== 'metered');
      const priceId = planPrice?.price?.id ?? sub.items.data[0]?.price?.id ?? null;
      const planCode = resolvePlanFromPriceId(priceId) as PlanCode;
      const includedCredits = creditsForPlan(planCode);

      const periodStart = (invoice as any).period_start
        ? new Date((invoice as any).period_start * 1000).toISOString()
        : (sub as any).current_period_start
          ? new Date((sub as any).current_period_start * 1000).toISOString()
          : new Date().toISOString();
      const periodEnd = (invoice as any).period_end
        ? new Date((invoice as any).period_end * 1000).toISOString()
        : (sub as any).current_period_end
          ? new Date((sub as any).current_period_end * 1000).toISOString()
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const renewalUpdates: Record<string, any> = {
        plan_id: planCode,
        ai_credits_included: includedCredits,
        ai_credits_used_period: 0,
        ai_credits_period_start: periodStart,
        ai_credits_period_end: periodEnd,
        current_period_start: periodStart,
        current_period_end: periodEnd,
      };

      const { data: subRow } = await supabase
        .from('billing_subscriptions')
        .select('id')
        .eq('external_subscription_id', subscriptionId)
        .maybeSingle();

      if (subRow?.id) {
        await upsertBillingSubscription(orgId, subRow.id, renewalUpdates);
      } else {
        await upsertBillingSubscription(orgId, null, {
          ...renewalUpdates,
          org_id: orgId,
          external_subscription_id: subscriptionId,
          external_customer_id: invoice.customer as string,
          status: 'active',
        });
      }

      if (includedCredits > 0 && invoice.id) {
        try {
          await recordCreditGrant({
            tenantId: orgId,
            workspaceId: extractWorkspaceId(invoice as any) ?? orgId,
            subscriptionId,
            stripeInvoiceId: invoice.id,
            credits: includedCredits,
            source: 'plan_renewal',
            status: 'active',
            metadata: { plan: planCode, priceId, period_start: periodStart, period_end: periodEnd },
          });
        } catch (err) {
          logger.warn('credit_grants insert failed on invoice renewal', { error: (err as Error).message });
        }
      }
    } catch (err) {
      logger.warn('invoice.payment_succeeded: subscription renewal block failed', {
        error: (err as Error).message, invoiceId: invoice.id,
      });
    }
  }

  const dedupId = `stripe_invoice_${invoice.id}`;
  const { data: existing } = await supabase
    .from('credit_ledger')
    .select('id')
    .eq('id', dedupId)
    .maybeSingle();
  if (existing) return;

  const amountPaid = typeof invoice.amount_paid === 'number' ? invoice.amount_paid / 100 : 0;
  const paidAt = (invoice as any).status_transitions?.paid_at;
  const occurredAt = paidAt ? new Date(paidAt * 1000).toISOString() : new Date().toISOString();

  const { error } = await supabase.from('credit_ledger').insert({
    id: dedupId,
    org_id: orgId,
    tenant_id: orgId,
    entry_type: 'charge',
    amount: amountPaid,
    reason: `Stripe invoice ${invoice.number ?? invoice.id} paid`,
    reference_id: invoice.id,
    balance_after: 0,
    occurred_at: occurredAt,
  });
  if (error) logger.warn('Stripe invoice ledger insert failed', { error: error.message });
}

async function handleInvoicePaymentFailed(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const supabase = getSupabaseAdmin();

  const subscriptionId = (invoice as any).subscription as string | null;
  if (subscriptionId) {
    await supabase
      .from('billing_subscriptions')
      .update({ status: 'past_due' })
      .eq('external_subscription_id', subscriptionId);
    return;
  }

  const orgId = extractOrgId(invoice as any) || (await resolveOrgIdByCustomer(invoice.customer as string));
  if (orgId) {
    await supabase.from('billing_subscriptions').update({ status: 'past_due' }).eq('org_id', orgId);
  }
}

async function dispatchEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed':       return handleCheckoutCompleted(event);
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':    return handleSubscriptionUpsert(event);
    case 'invoice.payment_succeeded':        return handleInvoicePaymentSucceeded(event);
    case 'invoice.payment_failed':           return handleInvoicePaymentFailed(event);
    default: return;
  }
}

stripeWebhookRouter.post('/', async (req: Request, res: Response) => {
  const rawBody = (req as any).rawBody as string | undefined;
  const sigHeader = req.headers['stripe-signature'] as string | undefined;

  if (!rawBody || !sigHeader) {
    logger.warn('Stripe webhook: missing raw body or signature');
    res.status(400).send('bad request');
    return;
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    const secret = getStripeWebhookSecret();
    event = stripe.webhooks.constructEvent(rawBody, sigHeader, secret);
  } catch (err: any) {
    // Stripe credentials not configured → 503 with a stable code so Stripe's
    // retry policy can be tracked but the server doesn't 500.
    if (isStripeNotConfiguredError(err)) {
      logger.warn('Stripe webhook received but Stripe not configured', {
        missingVar: err.missingVar,
      });
      res.status(503).json({ error: 'STRIPE_NOT_CONFIGURED', missingVar: err.missingVar });
      return;
    }
    logger.warn('Stripe webhook: signature verification failed', { error: err?.message });
    res.status(401).send('invalid signature');
    return;
  }

  const dedupeKey = `stripe_${event.id}`;
  const integrationRepo = createIntegrationRepository();
  const tenantIdForPersistence = extractOrgId((event.data.object as any)) || 'unknown';

  try {
    const existing = await integrationRepo.getWebhookEventByDedupeKey(
      { tenantId: tenantIdForPersistence },
      dedupeKey,
    );
    if (existing) {
      logger.debug('Stripe webhook: duplicate, ignoring', { eventId: event.id, type: event.type });
      res.status(200).send('ok');
      return;
    }
  } catch (err) {
    logger.debug('Stripe webhook: dedupe lookup failed (non-fatal)', { error: (err as Error).message });
  }

  try {
    await integrationRepo.createWebhookEvent({ tenantId: tenantIdForPersistence }, {
      id: randomUUID(),
      sourceSystem: 'stripe',
      eventType: event.type,
      rawPayload: rawBody,
      status: 'received',
      dedupeKey,
    });
  } catch (err) {
    logger.warn('Stripe webhook: failed to persist raw event (non-fatal)', { error: (err as Error).message });
  }

  if (!HANDLED_EVENT_TYPES.has(event.type)) {
    logger.debug('Stripe webhook: unhandled event type, acknowledging', { type: event.type });
    res.status(200).send('ok');
    return;
  }

  try {
    await dispatchEvent(event);
    res.status(200).send('ok');
  } catch (err: any) {
    logger.error('Stripe webhook: handler error', err, { eventId: event.id, type: event.type });
    res.status(500).send('processing error');
  }
});
