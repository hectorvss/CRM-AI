/**
 * server/webhooks/shopify.ts
 *
 * Handles inbound Shopify webhook requests.
 *
 * Flow:
 *  1. Verify HMAC signature (reject immediately if invalid)
 *  2. Deduplicate using the X-Shopify-Webhook-Id header
 *  3. Persist raw payload to webhook_events
 *  4. Respond 200 immediately (Shopify requires < 5 s response)
 *  5. Enqueue WEBHOOK_PROCESS job for background processing
 *
 * Shopify retries a webhook up to 19 times if it doesn't receive 200.
 * The deduplication key prevents double-processing on retries.
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../db/client.js';
import { integrationRegistry } from '../integrations/registry.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';
import { logger } from '../utils/logger.js';
import { resolveTenantWorkspaceContext } from '../middleware/multiTenant.js';

export const shopifyWebhookRouter = Router();

// Shopify sends the topic in X-Shopify-Topic header
// e.g. "orders/paid", "orders/updated", "refunds/create"
const SUPPORTED_TOPICS = new Set([
  'orders/paid',
  'orders/updated',
  'orders/cancelled',
  'orders/fulfilled',
  'refunds/create',
  'customers/update',
  'customers/create',
]);

shopifyWebhookRouter.post('/', (req: Request, res: Response) => {
  const rawBody = (req as any).rawBody as string | undefined;
  const headers = req.headers as Record<string, string>;
  const context = resolveTenantWorkspaceContext(
    req.headers['x-tenant-id'] as string | undefined,
    req.headers['x-workspace-id'] as string | undefined,
  );

  const topic       = headers['x-shopify-topic'];
  const webhookId   = headers['x-shopify-webhook-id'];
  const shopDomain  = headers['x-shopify-shop-domain'] ?? 'unknown';

  // ── 1. Signature verification ──────────────────────────────────────────────
  const adapter = integrationRegistry.get('shopify');

  if (!adapter) {
    // No Shopify integration configured — ignore gracefully
    logger.warn('Shopify webhook received but adapter not configured');
    res.status(200).send('ok');
    return;
  }

  if (!rawBody) {
    logger.warn('Shopify webhook: missing raw body');
    res.status(400).send('bad request');
    return;
  }

  const valid = adapter.verifyWebhook(rawBody, headers);
  if (!valid) {
    logger.warn('Shopify webhook: invalid signature', { topic, shopDomain });
    res.status(401).send('unauthorized');
    return;
  }

  // ── 2. Filter unsupported topics ───────────────────────────────────────────
  if (!topic || !SUPPORTED_TOPICS.has(topic)) {
    // Acknowledge but don't process — avoids Shopify retrying endlessly
    logger.debug('Shopify webhook: unsupported topic, acknowledging', { topic });
    res.status(200).send('ok');
    return;
  }

  // ── 3. Deduplication ───────────────────────────────────────────────────────
  const dedupeKey = webhookId ?? `shopify_${topic}_${Date.now()}`;
  const db        = getDb();

  const existing = db.prepare(
    'SELECT id FROM webhook_events WHERE dedupe_key = ?'
  ).get(dedupeKey);

  if (existing) {
    logger.debug('Shopify webhook: duplicate, ignoring', { dedupeKey, topic });
    res.status(200).send('ok');
    return;
  }

  // ── 4. Persist raw event ───────────────────────────────────────────────────
  const eventId = randomUUID();

  try {
    db.prepare(`
      INSERT INTO webhook_events
        (id, tenant_id, source_system, event_type, raw_payload,
         received_at, status, dedupe_key)
      VALUES (?, ?, 'shopify', ?, ?, CURRENT_TIMESTAMP, 'received', ?)
    `).run(eventId, context.tenantId, topic, rawBody, dedupeKey);
  } catch (err) {
    logger.error('Shopify webhook: failed to persist event', err, { topic });
    // Still respond 200 to avoid Shopify retrying and flooding logs
    res.status(200).send('ok');
    return;
  }

  // ── 5. Respond immediately ─────────────────────────────────────────────────
  res.status(200).send('ok');

  // ── 6. Enqueue for background processing ──────────────────────────────────
  try {
    enqueue(JobType.WEBHOOK_PROCESS, {
      webhookEventId: eventId,
      source:         'shopify',
      rawBody,
      headers,
    }, {
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      traceId: eventId,
      priority: 4,
    });
    logger.info('Shopify webhook enqueued', { eventId, topic, shopDomain });
  } catch (err) {
    logger.error('Shopify webhook: failed to enqueue job', err, { eventId, topic });
    // Event is persisted — a recovery sweep can re-enqueue it later
  }
});
