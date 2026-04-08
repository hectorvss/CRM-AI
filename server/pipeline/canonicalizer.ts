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
import { getDb } from '../db/client.js';
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

// ── Upsert helpers ────────────────────────────────────────────────────────────

function upsertOrder(order: CanonicalOrder, tenantId: string): string {
  const db = getDb();

  // Check if we already have a record by external_order_id + source
  const existing = db.prepare(`
    SELECT id FROM orders
    WHERE external_order_id = ? AND tenant_id = ?
  `).get(order.externalId, tenantId) as any;

  const systemStates = JSON.stringify({
    canonical:   order.status,
    [order.source]: order.status,
  });

  const badges = JSON.stringify(
    order.tags.filter(t => ['high_risk', 'vip', 'dispute'].includes(t))
  );

  if (existing) {
    db.prepare(`
      UPDATE orders SET
        status         = ?,
        system_states  = ?,
        total_amount   = ?,
        currency       = ?,
        last_sync_at   = CURRENT_TIMESTAMP,
        updated_at     = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(order.status, systemStates, order.totalAmount, order.currency, existing.id);

    return existing.id;
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO orders (
      id, external_order_id, tenant_id, workspace_id,
      status, system_states, total_amount, currency,
      order_date, badges, last_sync_at, created_at, updated_at
    ) VALUES (
      ?, ?, ?, 'ws_default',
      ?, ?, ?, ?,
      ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `).run(
    id, order.externalId, tenantId,
    order.status, systemStates, order.totalAmount, order.currency,
    order.createdAt, badges,
  );

  return id;
}

function upsertPayment(payment: CanonicalPayment, tenantId: string): string {
  const db = getDb();

  const existing = db.prepare(`
    SELECT id FROM payments
    WHERE external_payment_id = ? AND tenant_id = ?
  `).get(payment.externalId, tenantId) as any;

  const systemStates = JSON.stringify({
    canonical:      payment.status,
    [payment.source]: payment.status,
  });

  if (existing) {
    db.prepare(`
      UPDATE payments SET
        status         = ?,
        system_states  = ?,
        refund_amount  = ?,
        updated_at     = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(payment.status, systemStates, payment.amountRefunded, existing.id);

    return existing.id;
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO payments (
      id, external_payment_id, tenant_id,
      amount, currency, payment_method, psp,
      status, system_states,
      refund_amount, dispute_id,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?,
      ?, ?,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `).run(
    id, payment.externalId, tenantId,
    payment.amount, payment.currency, payment.paymentMethod ?? 'card', payment.source,
    payment.status, systemStates,
    payment.amountRefunded, payment.disputeId,
  );

  return id;
}

function upsertCustomer(customer: CanonicalCustomer, tenantId: string): string {
  const db = getDb();

  // First check linked_identities for an existing mapping
  const linked = db.prepare(`
    SELECT customer_id FROM linked_identities
    WHERE system = ? AND external_id = ?
  `).get(customer.source, customer.externalId) as any;

  if (linked) {
    // Update canonical fields
    db.prepare(`
      UPDATE customers SET
        canonical_name  = COALESCE(?, canonical_name),
        canonical_email = COALESCE(?, canonical_email),
        updated_at      = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(customer.displayName, customer.email, linked.customer_id);

    return linked.customer_id;
  }

  // No existing mapping — create new customer + linked identity
  const id = randomUUID();
  db.prepare(`
    INSERT INTO customers (
      id, tenant_id, workspace_id,
      canonical_email, canonical_name,
      segment, risk_level,
      created_at, updated_at
    ) VALUES (
      ?, ?, 'ws_default',
      ?, ?,
      'regular', 'low',
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `).run(id, tenantId, customer.email, customer.displayName);

  db.prepare(`
    INSERT OR IGNORE INTO linked_identities
      (id, customer_id, system, external_id, confidence, verified)
    VALUES (?, ?, ?, ?, 1.0, 1)
  `).run(randomUUID(), id, customer.source, customer.externalId);

  return id;
}

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

  const db = getDb();

  // ── 1. Load canonical event ──────────────────────────────────────────────
  const event = db.prepare(
    'SELECT * FROM canonical_events WHERE id = ?'
  ).get(payload.canonicalEventId) as any;

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
        localEntityId = upsertOrder(order, tenantId);
        log.info('Order upserted', { localEntityId, externalId: order.externalId });

        // Also upsert customer if present
        if (order.customerExternalId) {
          try {
            const customer = await shopify.getCustomer(order.customerExternalId);
            const customerId = upsertCustomer(customer, tenantId);
            // Link order to customer
            db.prepare(
              'UPDATE orders SET customer_id = ? WHERE id = ?'
            ).run(customerId, localEntityId);
          } catch {
            // Non-fatal: customer fetch failed
          }
        }

      } else if (event.source_entity_type === 'customer' && event.source_entity_id !== 'unknown') {
        const customer = await shopify.getCustomer(event.source_entity_id);
        localEntityId = upsertCustomer(customer, tenantId);
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
        localEntityId = upsertPayment(payment, tenantId);
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
  db.prepare(`
    UPDATE canonical_events
    SET status               = 'canonicalized',
        canonical_entity_type = ?,
        canonical_entity_id  = ?,
        processed_at         = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    event.source_entity_type,
    localEntityId ?? event.source_entity_id,
    payload.canonicalEventId,
  );

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
