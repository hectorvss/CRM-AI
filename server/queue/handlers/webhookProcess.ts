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
import { enqueue } from '../client.js';
import { JobType } from '../types.js';
import { logger } from '../../utils/logger.js';
import { registerHandler } from './index.js';
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

  // ── 1. Load raw webhook event ────────────────────────────────────────────
  const webhookRow = await integrationRepo.getWebhookEvent(payload.webhookEventId);

  if (!webhookRow) {
    log.warn('Webhook event not found in DB — may have been deleted');
    return;
  }

  if (webhookRow.status === 'processed') {
    log.debug('Webhook event already processed, skipping');
    return;
  }

  // ── 2. Parse payload ─────────────────────────────────────────────────────
  let parsedBody: Record<string, any>;
  try {
    parsedBody = JSON.parse(webhookRow.raw_payload || payload.rawBody);
  } catch {
    log.warn('Webhook has invalid JSON body — marking as failed to avoid loop');
    await integrationRepo.updateWebhookEventStatus(payload.webhookEventId, 'failed');
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
  const scope = { tenantId: ctx.tenantId || 'org_default', workspaceId: ctx.workspaceId || 'ws_default' };

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
  await integrationRepo.updateWebhookEventStatus(payload.webhookEventId, 'processed', canonicalEventId);

  // ── 7. Enqueue CANONICALIZE job ───────────────────────────────────────────
  enqueue(
    JobType.CANONICALIZE,
    { canonicalEventId },
    {
      tenantId:    ctx.tenantId ?? 'org_default',
      workspaceId: ctx.workspaceId ?? 'ws_default',
      traceId:     ctx.traceId,
      priority:    5,  // canonicalization is higher priority than default
    }
  );

  log.debug('CANONICALIZE job enqueued', { canonicalEventId });
}

// ── Register ──────────────────────────────────────────────────────────────────

registerHandler(JobType.WEBHOOK_PROCESS, handleWebhookProcess);

export { handleWebhookProcess };
