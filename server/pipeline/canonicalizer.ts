/**
 * server/pipeline/canonicalizer.ts
 *
 * Refactored to use repository pattern (provider-agnostic).
 */

import { createCommerceRepository, createCustomerRepository, createCanonicalRepository } from '../data/index.js';
import { integrationRegistry } from '../integrations/registry.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';
import { registerHandler } from '../queue/handlers/index.js';
import { logger } from '../utils/logger.js';
import type { CanonicalizePayload, JobContext } from '../queue/types.js';
import { getSupabaseAdmin } from '../db/supabase.js';

const commerceRepo = createCommerceRepository();
const customerRepo = createCustomerRepository();
const canonicalRepo = createCanonicalRepository();

async function handleCanonicalize(
  payload: CanonicalizePayload,
  ctx: JobContext
): Promise<void> {
  const log = logger.child({
    jobId:           ctx.jobId,
    canonicalEventId: payload.canonicalEventId,
    traceId:         ctx.traceId,
  });

  const supabase = getSupabaseAdmin();
  const scope = { tenantId: ctx.tenantId ?? 'org_default', workspaceId: ctx.workspaceId ?? 'ws_default' };

  // ── 1. Load canonical event ──────────────────────────────────────────────
  const { data: event } = await supabase
    .from('canonical_events')
    .select('*')
    .eq('id', payload.canonicalEventId)
    .single();

  if (!event) {
    log.warn('Canonical event not found');
    return;
  }

  if (event.status === 'canonicalized' || event.status === 'linked') {
    log.debug('Already canonicalized, skipping');
    return;
  }

  log.info('Canonicalizing event', {
    source:     event.source_system,
    entityType: event.source_entity_type,
    entityId:   event.source_entity_id,
    eventType:  event.event_type,
  });

  let localEntityId: string | null = null;

  try {
    // ── 2. Fetch full entity from integration + upsert locally ─────────────
    if (event.source_system === 'shopify') {
      const shopify = integrationRegistry.get('shopify') as any;

      if (!shopify) {
        log.warn('Shopify adapter not available, skipping fetch');
      } else if (event.source_entity_type === 'order' && event.source_entity_id !== 'unknown') {
        const order = await shopify.getOrder(event.source_entity_id);
        localEntityId = await commerceRepo.upsertOrder(scope, order);
        log.info('Order upserted', { localEntityId, externalId: order.externalId });

        // Also upsert customer if present
        if (order.customerExternalId) {
          try {
            const customer = await shopify.getCustomer(order.customerExternalId);
            const customerId = await customerRepo.upsertCustomer(scope, customer);
            // Link order to customer
            await commerceRepo.updateOrder(scope, localEntityId, { customer_id: customerId });
          } catch {
            // Non-fatal: customer fetch failed
          }
        }

      } else if (event.source_entity_type === 'customer' && event.source_entity_id !== 'unknown') {
        const customer = await shopify.getCustomer(event.source_entity_id);
        localEntityId = await customerRepo.upsertCustomer(scope, customer);
        log.info('Customer upserted', { localEntityId });
      }

    } else if (event.source_system === 'stripe') {
      const stripe = integrationRegistry.get('stripe') as any;

      if (!stripe) {
        log.warn('Stripe adapter not available, skipping fetch');
      } else if (
        (event.source_entity_type === 'payment' || event.source_entity_type === 'refund') &&
        event.source_entity_id !== 'unknown'
      ) {
        const payment = await stripe.getPayment(event.source_entity_id);
        localEntityId = await commerceRepo.upsertPayment(scope, payment);
        log.info('Payment upserted', { localEntityId, externalId: payment.externalId });

      } else if (
        event.source_entity_type === 'customer' &&
        (event.event_type.startsWith('customer.subscription.'))
      ) {
        // ── Sync subscription state to billing_subscriptions ──────────────────
        localEntityId = await syncStripeSubscription(supabase, scope, event, log);

      } else if (event.source_entity_type === 'invoice') {
        // ── Log successful invoice payment to credit_ledger ───────────────────
        localEntityId = await syncStripeInvoice(supabase, scope, event, log);
      }
    }

  } catch (err) {
    log.warn('Entity fetch from integration failed — proceeding without full data', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── 3. Update canonical_event ────────────────────────────────────────────
  await canonicalRepo.updateEventStatus(scope, payload.canonicalEventId, {
    status: 'canonicalized',
    canonical_entity_type: event.source_entity_type,
    canonical_entity_id: localEntityId ?? event.source_entity_id,
  });

  // ── 4. Enqueue INTENT_ROUTE ──────────────────────────────────────────────
  enqueue(
    JobType.INTENT_ROUTE,
    { canonicalEventId: payload.canonicalEventId },
    { tenantId: scope.tenantId, workspaceId: scope.workspaceId, traceId: ctx.traceId, priority: 5 }
  );

  log.debug('INTENT_ROUTE enqueued');
}

// ── Billing sync helpers ──────────────────────────────────────────────────────

/**
 * Fetch the raw Stripe event body stored in webhook_events and return the
 * `data.object` payload.  Returns null if not found or unparseable.
 */
async function fetchStripeEventObject(
  supabase: ReturnType<typeof import('../db/supabase.js').getSupabaseAdmin>,
  normalizedPayload: string | null,
): Promise<Record<string, any> | null> {
  try {
    const meta = JSON.parse(normalizedPayload || '{}') as Record<string, any>;
    const rawEventId = meta.rawEventId as string | undefined;
    if (!rawEventId) return null;

    const { data: row } = await supabase
      .from('webhook_events')
      .select('raw_payload')
      .eq('id', rawEventId)
      .maybeSingle();

    if (!row) return null;

    const parsed: Record<string, any> =
      typeof row.raw_payload === 'string'
        ? JSON.parse(row.raw_payload)
        : (row.raw_payload as Record<string, any>);

    return (parsed?.data?.object as Record<string, any>) ?? null;
  } catch {
    return null;
  }
}

/**
 * Sync a Stripe subscription object into billing_subscriptions.
 * Matches on external_subscription_id; falls back to org_id = tenantId.
 */
async function syncStripeSubscription(
  supabase: ReturnType<typeof import('../db/supabase.js').getSupabaseAdmin>,
  scope: { tenantId: string; workspaceId: string },
  event: Record<string, any>,
  log: ReturnType<typeof logger.child>,
): Promise<string | null> {
  const sub = await fetchStripeEventObject(supabase, event.normalized_payload);
  if (!sub?.id) {
    log.warn('Stripe subscription sync: could not parse subscription object');
    return null;
  }

  const isDeleted = event.event_type === 'customer.subscription.deleted';

  const updates: Record<string, any> = {
    status:               isDeleted ? 'canceled' : (sub.status ?? 'active'),
    external_subscription_id: sub.id,
    current_period_start: sub.current_period_start
      ? new Date((sub.current_period_start as number) * 1000).toISOString()
      : undefined,
    current_period_end: sub.current_period_end
      ? new Date((sub.current_period_end as number) * 1000).toISOString()
      : undefined,
  };

  // Extract plan_id from subscription items if present
  const priceId: string | undefined =
    sub.items?.data?.[0]?.price?.id ??
    sub.plan?.id ??
    undefined;
  if (priceId) updates.plan_id = priceId;

  // Remove undefined values
  Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k]);

  // Try to update by external_subscription_id first, then by org_id
  const { data: byExternal } = await supabase
    .from('billing_subscriptions')
    .update(updates)
    .eq('external_subscription_id', sub.id)
    .select('id')
    .maybeSingle();

  if (byExternal) {
    log.info('Billing subscription updated (by external_subscription_id)', {
      subscriptionId: sub.id, status: updates.status,
    });
    return byExternal.id as string;
  }

  // Fallback: update by org_id (single-tenant mapping)
  const { data: byOrg } = await supabase
    .from('billing_subscriptions')
    .update(updates)
    .eq('org_id', scope.tenantId)
    .select('id')
    .maybeSingle();

  if (byOrg) {
    log.info('Billing subscription updated (by org_id fallback)', {
      subscriptionId: sub.id, status: updates.status,
    });
    return byOrg.id as string;
  }

  log.warn('Stripe subscription sync: no matching billing_subscriptions row found', {
    subscriptionId: sub.id, tenantId: scope.tenantId,
  });
  return sub.id as string;
}

/**
 * Log a successful Stripe invoice payment into credit_ledger.
 * Only acts on invoice.payment_succeeded — failed payments are informational.
 */
async function syncStripeInvoice(
  supabase: ReturnType<typeof import('../db/supabase.js').getSupabaseAdmin>,
  scope: { tenantId: string; workspaceId: string },
  event: Record<string, any>,
  log: ReturnType<typeof logger.child>,
): Promise<string | null> {
  if (event.event_type !== 'invoice.payment_succeeded') {
    // payment_failed is handled by the intent router → case auto-creation
    return null;
  }

  const invoice = await fetchStripeEventObject(supabase, event.normalized_payload);
  if (!invoice?.id) {
    log.warn('Stripe invoice sync: could not parse invoice object');
    return null;
  }

  const dedupId = `stripe_invoice_${invoice.id as string}`;

  // Idempotency check
  const { data: existing } = await supabase
    .from('credit_ledger')
    .select('id')
    .eq('id', dedupId)
    .maybeSingle();

  if (existing) {
    log.debug('Invoice already in credit_ledger, skipping', { invoiceId: invoice.id });
    return invoice.id as string;
  }

  const amountPaid = typeof invoice.amount_paid === 'number'
    ? invoice.amount_paid / 100
    : 0;

  const occurredAt = invoice.status_transitions?.paid_at
    ? new Date((invoice.status_transitions.paid_at as number) * 1000).toISOString()
    : new Date().toISOString();

  const { error } = await supabase.from('credit_ledger').insert({
    id:           dedupId,
    org_id:       scope.tenantId,
    tenant_id:    scope.tenantId,
    entry_type:   'charge',
    amount:       amountPaid,
    reason:       `Stripe invoice ${(invoice.number as string) ?? (invoice.id as string)} paid`,
    reference_id: invoice.id as string,
    balance_after: 0,   // balance tracking is handled separately
    occurred_at:  occurredAt,
  });

  if (error) {
    log.warn('Stripe invoice sync: credit_ledger insert failed', { error: error.message });
    return null;
  }

  log.info('Invoice payment logged to credit_ledger', {
    invoiceId: invoice.id, amount: amountPaid,
  });
  return invoice.id as string;
}

// ── Register ──────────────────────────────────────────────────────────────────

registerHandler(JobType.CANONICALIZE, handleCanonicalize);

export { handleCanonicalize };
