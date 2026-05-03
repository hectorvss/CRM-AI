/**
 * server/queue/handlers/webhookProcess.ts
 *
 * Handler for the WEBHOOK_PROCESS job type.
 *
 * Responsibilities:
 *  1. Load the raw webhook_event from DB
 *  2. Parse the payload and extract entity type / entity ID
 *  3. Create (or find existing) canonical_event record with deduplication
 *  4. Mark webhook_event as processed
 *  5. Enqueue CANONICALIZE job to continue the pipeline
 *
 * This handler is deliberately lightweight — it only creates the canonical
 * event record and hands off. Heavy work (API calls, reconciliation) happens
 * in later pipeline stages.
 */

import { randomUUID } from 'crypto';
import { createIntegrationRepository } from '../../data/integrations.js';
import { createCanonicalRepository } from '../../data/canonical.js';
import { createCaseRepository, createCommerceRepository, createCustomerRepository } from '../../data/index.js';
import { enqueue } from '../client.js';
import { JobType } from '../types.js';
import { logger } from '../../utils/logger.js';
import { registerHandler } from './index.js';
import { requireScope } from '../../lib/scope.js';
import { fireWorkflowEvent } from '../../lib/workflowEventBus.js';
import { broadcastSSE } from '../../routes/sse.js';
import type { WebhookProcessPayload, JobContext } from '../types.js';

// ── Topic → canonical entity type mapping ─────────────────────────────────────

interface EntityExtraction {
  entityType:  string;
  entityId:    string | null;
  eventCategory: string;
}

function extractShopify(topic: string, body: Record<string, any>): EntityExtraction {
  if (topic.startsWith('orders/')) {
    return {
      entityType:    'order',
      entityId:      body.id ? String(body.id) : null,
      eventCategory: 'commerce',
    };
  }
  if (topic.startsWith('refunds/')) {
    return {
      entityType:    'refund',
      entityId:      body.id ? String(body.id) : null,
      eventCategory: 'commerce',
    };
  }
  if (topic.startsWith('customers/')) {
    return {
      entityType:    'customer',
      entityId:      body.id ? String(body.id) : null,
      eventCategory: 'customer',
    };
  }
  return { entityType: 'unknown', entityId: null, eventCategory: 'unknown' };
}

function extractStripe(eventType: string, body: Record<string, any>): EntityExtraction {
  const obj = body.data?.object ?? {};

  if (eventType.startsWith('payment_intent.')) {
    return {
      entityType:    'payment',
      entityId:      obj.id ?? body.id ?? null,
      eventCategory: 'payment',
    };
  }
  if (eventType.startsWith('charge.refunded') || eventType.startsWith('refund.')) {
    return {
      entityType:    'refund',
      entityId:      obj.id ?? null,
      eventCategory: 'payment',
    };
  }
  if (eventType.startsWith('charge.dispute.')) {
    return {
      entityType:    'dispute',
      entityId:      obj.id ?? null,
      eventCategory: 'payment',
    };
  }
  if (eventType.startsWith('customer.')) {
    return {
      entityType:    'customer',
      entityId:      obj.id ?? null,
      eventCategory: 'customer',
    };
  }
  if (eventType.startsWith('invoice.')) {
    return {
      entityType:    'invoice',
      entityId:      obj.id ?? null,
      eventCategory: 'billing',
    };
  }
  return { entityType: 'unknown', entityId: null, eventCategory: 'unknown' };
}

// ── Handler ───────────────────────────────────────────────────────────────────

async function handleWebhookProcess(
  payload: WebhookProcessPayload,
  ctx: JobContext
): Promise<void> {
  const log = logger.child({
    jobId:          ctx.jobId,
    webhookEventId: payload.webhookEventId,
    source:         payload.source,
    traceId:        ctx.traceId,
  });

  const integrationRepo = createIntegrationRepository();
  const canonicalRepo   = createCanonicalRepository();
  const scope = requireScope(ctx, 'webhookProcess');

  // ── 1. Load raw webhook event ────────────────────────────────────────────
  const webhookRow = await integrationRepo.getWebhookEvent(scope, payload.webhookEventId);

  if (!webhookRow) {
    log.warn('Webhook event not found in DB — may have been deleted');
    return;
  }

  if (webhookRow.status === 'processed') {
    log.debug('Webhook event already processed, skipping');
    return;
  }

  // ── 2. Parse payload ─────────────────────────────────────────────────────
  // raw_payload may come back as a plain object (JSONB) from Supabase or as a
  // JSON string when the event was stored that way. Handle both cases.
  let parsedBody: Record<string, any>;
  try {
    const rawData = webhookRow.raw_payload;
    if (rawData && typeof rawData === 'object') {
      parsedBody = rawData as Record<string, any>;
    } else {
      parsedBody = JSON.parse(rawData || payload.rawBody);
    }
  } catch {
    log.warn('Webhook has invalid JSON body — marking as failed to avoid loop');
    await integrationRepo.updateWebhookEventStatus(scope, payload.webhookEventId, 'failed');
    return;
  }

  // ── 3. Extract entity info ───────────────────────────────────────────────
  const topic = webhookRow.event_type as string;
  let extraction: EntityExtraction;

  if (payload.source === 'shopify') {
    extraction = extractShopify(topic, parsedBody);
  } else if (payload.source === 'stripe') {
    extraction = extractStripe(topic, parsedBody);
  } else {
    extraction = { entityType: 'unknown', entityId: null, eventCategory: 'unknown' };
  }

  // ── 4. Determine occurred_at ─────────────────────────────────────────────
  let occurredAt: string;
  if (payload.source === 'shopify') {
    occurredAt = parsedBody.updated_at ?? parsedBody.created_at ?? new Date().toISOString();
  } else if (payload.source === 'stripe') {
    const unixTs = parsedBody.created;
    occurredAt = unixTs
      ? new Date(unixTs * 1000).toISOString()
      : new Date().toISOString();
  } else {
    occurredAt = new Date().toISOString();
  }

  // ── 5. Upsert canonical_event (deduplication by topic + entityId + source) ─
  const canonicalDedupeKey =
    `${payload.source}:${topic}:${extraction.entityId ?? randomUUID()}`;

  let canonicalEventId: string;
  const existing = await canonicalRepo.getEventByDedupeKey(scope, canonicalDedupeKey);

  if (existing) {
    canonicalEventId = existing.id;
    log.debug('Canonical event already exists', { canonicalEventId });
  } else {
    canonicalEventId = randomUUID();

    await canonicalRepo.createEvent(scope, {
      id: canonicalEventId,
      dedupeKey: canonicalDedupeKey,
      sourceSystem: payload.source,
      sourceEntityType: extraction.entityType,
      sourceEntityId: extraction.entityId || 'unknown',
      eventType: topic,
      eventCategory: extraction.eventCategory,
      occurredAt,
      normalizedPayload: JSON.stringify({
        rawEventId:  payload.webhookEventId,
        source:      payload.source,
        topic,
        entityType:  extraction.entityType,
        entityId:    extraction.entityId,
      }),
      status: 'received'
    });

    log.info('Canonical event created', {
      canonicalEventId,
      entityType: extraction.entityType,
      entityId:   extraction.entityId,
      topic,
    });
  }

  // ── 6. Mark webhook_event as processed ───────────────────────────────────
  await integrationRepo.updateWebhookEventStatus(scope, payload.webhookEventId, 'processed', {
    canonical_event_id: canonicalEventId,
  });

  // ── 7. Enqueue CANONICALIZE job ───────────────────────────────────────────
  enqueue(
    JobType.CANONICALIZE,
    { canonicalEventId },
    {
      tenantId:    scope.tenantId,
      workspaceId: scope.workspaceId,
      traceId:     ctx.traceId,
      priority:    5,
    }
  );

  log.debug('CANONICALIZE job enqueued', { canonicalEventId });

  // ── 8. Auto-create case + fire workflow event for high-value topics ────────
  // Run asynchronously — never block the job completion
  setImmediate(() => {
    void autoCreateCaseAndFireEvent(scope, payload.source, topic, parsedBody, extraction, log)
      .catch((err) => log.warn('webhookProcess: auto-case/event dispatch failed', { error: String(err?.message ?? err) }));
  });
}

// ── Topics that should automatically create a CRM case ───────────────────────

const CASE_AUTO_CREATE_TOPICS = new Set([
  // Shopify
  'orders/cancelled',
  'refunds/create',
  'orders/fulfilled',
  // Stripe
  'charge.dispute.created',
  'charge.dispute.funds_withdrawn',
  'payment_intent.payment_failed',
  'charge.failed',
  'charge.refunded',
]);

// Mapping from webhook topic → workflow event type
function topicToWorkflowEvent(source: string, topic: string): string {
  const map: Record<string, string> = {
    // Shopify
    'orders/paid':        'order.updated',
    'orders/updated':     'order.updated',
    'orders/cancelled':   'order.updated',
    'orders/fulfilled':   'order.updated',
    'refunds/create':     'payment.refunded',
    'customers/update':   'customer.updated',
    'customers/create':   'customer.created',
    // Stripe
    'charge.dispute.created':          'payment.dispute.created',
    'charge.dispute.funds_withdrawn':   'payment.dispute.created',
    'charge.dispute.closed':            'payment.dispute.updated',
    'payment_intent.succeeded':         'payment.updated',
    'payment_intent.payment_failed':    'payment.failed',
    'charge.failed':                    'payment.failed',
    'charge.refunded':                  'payment.refunded',
  };
  return map[topic] ?? `${source}.${topic.replace('/', '.')}`;
}

async function autoCreateCaseAndFireEvent(
  scope: { tenantId: string; workspaceId: string },
  source: string,
  topic: string,
  body: Record<string, any>,
  extraction: EntityExtraction,
  log: ReturnType<typeof logger.child>,
): Promise<void> {
  const caseRepo     = createCaseRepository();
  const commerceRepo = createCommerceRepository();
  const customerRepo = createCustomerRepository();

  // ── Auto-create case for high-value events ──────────────────────────────
  if (CASE_AUTO_CREATE_TOPICS.has(topic)) {
    try {
      // Determine case type + summary from the event
      const { caseType, summary, priority, caseSubType } = classifyWebhookForCase(source, topic, body);

      // Look up existing order/payment in our DB to link the case
      let orderId: string | null = null;
      let paymentId: string | null = null;
      let customerId: string | null = null;

      if (extraction.entityType === 'order' && extraction.entityId) {
        const orders = await commerceRepo.listOrders(scope, { q: extraction.entityId });
        const order = orders.find((o: any) => o.external_order_id === extraction.entityId || o.id === extraction.entityId);
        if (order) {
          orderId = (order as any).id;
          customerId = (order as any).customer_id ?? null;
        }
      } else if ((extraction.entityType === 'payment' || extraction.entityType === 'refund' || extraction.entityType === 'dispute') && extraction.entityId) {
        // Find by external ID
        const allPayments = await commerceRepo.listPayments(scope, { q: extraction.entityId });
        const payment = allPayments.find((p: any) => p.external_payment_id === extraction.entityId || p.id === extraction.entityId);
        if (payment) {
          paymentId = (payment as any).id;
          customerId = (payment as any).customer_id ?? null;
        }
      } else if (extraction.entityType === 'customer' && extraction.entityId) {
        const customers = await customerRepo.list(scope, { q: extraction.entityId });
        const customer = customers.find((c: any) => c.external_id === extraction.entityId || c.id === extraction.entityId);
        if (customer) customerId = (customer as any).id;
      }

      // Generate next sequential case number (e.g. CS-0042)
      const caseNumber = await caseRepo.getNextCaseNumber(scope);

      // Create the case — use the actual DB column names:
      //  source_system / source_channel  instead of source
      //  ai_diagnosis                    instead of description
      //  order_ids / payment_ids         (arrays) instead of order_id / payment_id
      const caseId = await caseRepo.createCase(scope, {
        id:             randomUUID(),
        case_number:    caseNumber,
        tenant_id:      scope.tenantId,
        workspace_id:   scope.workspaceId,
        type:           caseType,
        sub_type:       caseSubType ?? null,
        status:         'open',
        priority,
        source_system:  `webhook:${source}`,
        source_channel: source,
        ai_diagnosis:   summary,
        customer_id:    customerId ?? null,
        order_ids:      orderId ? [orderId] : null,
        payment_ids:    paymentId ? [paymentId] : null,
        tags:           [`webhook`, source, topic.replace('/', '_')],
      } as any);

      // Notify connected SSE clients of the new case (scoped to workspace)
      broadcastSSE(scope.tenantId, 'case:created', {
        caseId,
        caseNumber: caseNumber,
        caseType:   caseType,
        priority,
        source,
        topic,
        tenantId:    scope.tenantId,
        workspaceId: scope.workspaceId,
      }, scope.workspaceId);

      log.info('webhookProcess: auto-created case from webhook', {
        caseId, source, topic, entityType: extraction.entityType,
      });
    } catch (caseErr) {
      log.warn('webhookProcess: case auto-creation failed', { source, topic, error: String(caseErr) });
    }
  }

  // ── Fire workflow event ────────────────────────────────────────────────────
  const eventType = topicToWorkflowEvent(source, topic);
  await fireWorkflowEvent(
    scope,
    eventType,
    {
      source,
      topic,
      entityType:  extraction.entityType,
      entityId:    extraction.entityId,
      payload:     body,
    },
  );

  log.debug('webhookProcess: workflow event fired', { eventType });
}

function classifyWebhookForCase(
  source: string,
  topic: string,
  body: Record<string, any>,
): { caseType: string; caseSubType?: string; summary: string; priority: string } {
  if (source === 'shopify') {
    if (topic === 'orders/cancelled') {
      return {
        caseType:    'order_issue',
        caseSubType: 'cancellation',
        summary:     `Order ${body.name ?? body.id ?? ''} was cancelled in Shopify`,
        priority:    'medium',
      };
    }
    if (topic === 'refunds/create') {
      const amount = body.transactions?.[0]?.amount ?? body.refund_line_items?.[0]?.price ?? '';
      return {
        caseType:    'refund',
        caseSubType: 'shopify_refund',
        summary:     `Shopify refund created${amount ? ` for ${amount}` : ''} on order ${body.order_id ?? ''}`,
        priority:    'medium',
      };
    }
    if (topic === 'orders/fulfilled') {
      return {
        caseType:    'fulfillment',
        caseSubType: 'fulfilled',
        summary:     `Order ${body.name ?? body.id ?? ''} fulfilled — verify delivery`,
        priority:    'low',
      };
    }
  }

  if (source === 'stripe') {
    if (topic === 'charge.dispute.created' || topic === 'charge.dispute.funds_withdrawn') {
      return {
        caseType:    'dispute',
        caseSubType: 'chargeback',
        summary:     `Stripe dispute created for charge ${body.data?.object?.charge ?? body.id ?? ''}`,
        priority:    'critical',
      };
    }
    if (topic === 'payment_intent.payment_failed' || topic === 'charge.failed') {
      return {
        caseType:    'payment_issue',
        caseSubType: 'payment_failed',
        summary:     `Payment failed: ${body.data?.object?.last_payment_error?.message ?? 'Unknown reason'}`,
        priority:    'high',
      };
    }
    if (topic === 'charge.refunded') {
      return {
        caseType:    'refund',
        caseSubType: 'stripe_refund',
        summary:     `Stripe charge refunded: ${body.data?.object?.id ?? ''}`,
        priority:    'low',
      };
    }
  }

  return {
    caseType: 'general',
    summary:  `Webhook event: ${source}/${topic}`,
    priority: 'medium',
  };
}

// ── Register ──────────────────────────────────────────────────────────────────

registerHandler(JobType.WEBHOOK_PROCESS, handleWebhookProcess);

export { handleWebhookProcess };
