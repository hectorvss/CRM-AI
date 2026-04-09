/**
 * server/webhooks/stripe.ts
 *
 * Handles inbound Stripe webhook requests.
 *
 * Flow:
 *  1. Verify Stripe-Signature header (timestamp-tolerant HMAC)
 *  2. Deduplicate using the Stripe event ID
 *  3. Persist raw payload to webhook_events
 *  4. Respond 200 immediately (Stripe requires < 30 s response)
 *  5. Enqueue WEBHOOK_PROCESS job for background processing
 *
 * Stripe retries failed webhooks over 3 days with exponential back-off.
 * Idempotent deduplication prevents double-processing on retries.
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../db/client.js';
import { integrationRegistry } from '../integrations/registry.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';
import { logger } from '../utils/logger.js';

export const stripeWebhookRouter = Router();

// Stripe event types we care about
const SUPPORTED_EVENT_TYPES = new Set([
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
  'refund.updated',
  'customer.updated',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
  'invoice.payment_succeeded',
]);

stripeWebhookRouter.post('/', (req: Request, res: Response) => {
  const rawBody = (req as any).rawBody as string | undefined;
  const headers = req.headers as Record<string, string>;

  // ── 1. Signature verification ──────────────────────────────────────────────
  const adapter = integrationRegistry.get('stripe');

  if (!adapter) {
    logger.warn('Stripe webhook received but adapter not configured');
    res.status(200).send('ok');
    return;
  }

  if (!rawBody) {
    logger.warn('Stripe webhook: missing raw body');
    res.status(400).send('bad request');
    return;
  }

  const valid = adapter.verifyWebhook(rawBody, headers);
  if (!valid) {
    logger.warn('Stripe webhook: invalid signature');
    res.status(401).send('unauthorized');
    return;
  }

  // ── 2. Parse event type and ID ─────────────────────────────────────────────
  let stripeEventId: string;
  let eventType: string;

  try {
    const parsed = JSON.parse(rawBody) as { id: string; type: string };
    stripeEventId = parsed.id;
    eventType     = parsed.type;
  } catch {
    logger.warn('Stripe webhook: invalid JSON body');
    res.status(400).send('bad request');
    return;
  }

  // ── 3. Filter unsupported event types ─────────────────────────────────────
  if (!SUPPORTED_EVENT_TYPES.has(eventType)) {
    logger.debug('Stripe webhook: unsupported event type, acknowledging', { eventType });
    res.status(200).send('ok');
    return;
  }

  // ── 4. Deduplication ───────────────────────────────────────────────────────
  const dedupeKey = `stripe_${stripeEventId}`;
  const db        = getDb();

  const existing = db.prepare(
    'SELECT id FROM webhook_events WHERE dedupe_key = ?'
  ).get(dedupeKey);

  if (existing) {
    logger.debug('Stripe webhook: duplicate, ignoring', { stripeEventId, eventType });
    res.status(200).send('ok');
    return;
  }

  // ── 5. Persist raw event ───────────────────────────────────────────────────
  const eventId = randomUUID();

  try {
    db.prepare(`
      INSERT INTO webhook_events
        (id, tenant_id, source_system, event_type, raw_payload,
         received_at, status, dedupe_key)
      VALUES (?, 'org_default', 'stripe', ?, ?, CURRENT_TIMESTAMP, 'received', ?)
    `).run(eventId, eventType, rawBody, dedupeKey);
  } catch (err) {
    logger.error('Stripe webhook: failed to persist event', err, { eventType });
    res.status(200).send('ok');
    return;
  }

  // ── 6. Respond immediately ─────────────────────────────────────────────────
  res.status(200).send('ok');

  // ── 7. Enqueue for background processing ──────────────────────────────────
  try {
    enqueue(JobType.WEBHOOK_PROCESS, {
      webhookEventId: eventId,
      source:         'stripe',
      rawBody,
      headers,
    });
    logger.info('Stripe webhook enqueued', { eventId, stripeEventId, eventType });
  } catch (err) {
    logger.error('Stripe webhook: failed to enqueue job', err, { eventId, eventType });
  }
});
