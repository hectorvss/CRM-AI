/**
 * server/pipeline/canonicalizer.ts
 *
 * The Canonicalizer agent — Phase 2 pipeline step 2.
 *
 * Responsibilities:
 *  1. Read the canonical_event record
 *  2. Call the relevant integration adapter to fetch the full entity data
 *  3. Upsert the entity into the local DB (orders / payments / customers / etc.)
 *  4. Update the canonical_event status to 'canonicalized'
 *  5. Enqueue INTENT_ROUTE job to continue the pipeline
 *
 * After this step, all local DB tables (orders, payments, customers…) reflect
 * the latest state from external systems. The rest of the pipeline works
 * exclusively from the local DB — never from raw webhook payloads.
 */

import { randomUUID } from 'crypto';
import { createCommerceRepository } from '../data/commerce.js';
import { createCustomerRepository } from '../data/customers.js';
import { createCanonicalRepository } from '../data/canonical.js';
import { integrationRegistry } from '../integrations/registry.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';
import { registerHandler } from '../queue/handlers/index.js';
import { logger } from '../utils/logger.js';
import type { CanonicalizePayload, JobContext } from '../queue/types.js';
import type {
  CanonicalOrder,
  CanonicalPayment,
  CanonicalCustomer,
  CanonicalFulfillment,
} from '../integrations/types.js';

// ── Main handler ──────────────────────────────────────────────────────────────

async function handleCanonicalize(
  payload: CanonicalizePayload,
  ctx: JobContext
): Promise<void> {
  const log = logger.child({
    jobId:           ctx.jobId,
    canonicalEventId: payload.canonicalEventId,
    traceId:         ctx.traceId,
  });

  const commerceRepo  = createCommerceRepository();
  const customerRepo  = createCustomerRepository();
  const canonicalRepo = createCanonicalRepository();

  // ── 1. Load canonical event ──────────────────────────────────────────────
  const scope = { tenantId: ctx.tenantId || 'org_default', workspaceId: ctx.workspaceId || 'ws_default' };
  const event = await canonicalRepo.getEventById(scope, payload.canonicalEventId);

  if (!event) {
    log.warn('Canonical event not found');
    return;
  }

  if (event.status === 'canonicalized' || event.status === 'linked') {
    log.debug('Already canonicalized, skipping');
    return;
  }

  const tenantId    = ctx.tenantId    ?? event.tenant_id    ?? 'org_default';
  const workspaceId = ctx.workspaceId ?? event.workspace_id ?? 'ws_default';

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
      }
    }

  } catch (err) {
    log.warn('Entity fetch from integration failed — proceeding without full data', {
      error: err instanceof Error ? err.message : String(err),
    });
    // Non-fatal: pipeline continues, reconciliation will catch stale state
  }

  // ── 3. Update canonical_event ────────────────────────────────────────────
  await canonicalRepo.updateEventStatus(scope, payload.canonicalEventId, {
    status:               'canonicalized',
    canonical_entity_type: event.source_entity_type,
    canonical_entity_id:   localEntityId ?? event.source_entity_id,
  });

  // ── 4. Enqueue INTENT_ROUTE ──────────────────────────────────────────────
  enqueue(
    JobType.INTENT_ROUTE,
    { canonicalEventId: payload.canonicalEventId },
    { tenantId, workspaceId, traceId: ctx.traceId, priority: 5 }
  );

  log.debug('INTENT_ROUTE enqueued');
}

// ── Register ──────────────────────────────────────────────────────────────────

registerHandler(JobType.CANONICALIZE, handleCanonicalize);

export { handleCanonicalize };
