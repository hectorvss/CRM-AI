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
import { createIntegrationRepository } from '../data/integrations.js';
import { getDb } from '../db/client.js';
import { getDatabaseProvider } from '../db/provider.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { integrationRegistry } from '../integrations/registry.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';
import { logger } from '../utils/logger.js';

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

async function resolveTenantIdForShopify(): Promise<string | null> {
  if (getDatabaseProvider() === 'supabase') {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('tenant_id')
      .eq('system', 'shopify')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.tenant_id ?? null;
  }

  const db = getDb();
  const row = db.prepare('SELECT tenant_id FROM connectors WHERE system = ? ORDER BY created_at ASC LIMIT 1').get('shopify') as any;
  return row?.tenant_id ?? null;
}

shopifyWebhookRouter.post('/', async (req: Request, res: Response) => {
  const rawBody = (req as any).rawBody as string | undefined;
  const headers = req.headers as Record<string, string>;

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
  const integrationRepo = createIntegrationRepository();

  try {
    const existing = await integrationRepo.getWebhookEventByDedupeKey({ tenantId: await resolveTenantIdForShopify() || '' }, dedupeKey);

    if (existing) {
      logger.debug('Shopify webhook: duplicate, ignoring', { dedupeKey, topic });
      res.status(200).send('ok');
      return;
    }

    // ── 4. Persist raw event ───────────────────────────────────────────────────
    const eventId = randomUUID();

    const tenantId = await resolveTenantIdForShopify();
    if (!tenantId) {
      logger.warn('Shopify webhook: no tenant mapping found for connector, skipping persistence', { topic, shopDomain });
      res.status(200).send('ok');
      return;
    }

    await integrationRepo.createWebhookEvent({ tenantId }, {
      id: eventId,
      sourceSystem: 'shopify',
      eventType: topic,
      rawPayload: rawBody,
      status: 'received',
      dedupeKey
    });

    // ── 5. Respond immediately ─────────────────────────────────────────────────
    res.status(200).send('ok');

    // ── 6. Enqueue for background processing ──────────────────────────────────
    try {
      enqueue(JobType.WEBHOOK_PROCESS, {
        webhookEventId: eventId,
        source:         'shopify',
        rawBody,
        headers,
      });
      logger.info('Shopify webhook enqueued', { eventId, topic, shopDomain });
    } catch (err) {
      logger.error('Shopify webhook: failed to enqueue job', err, { eventId, topic });
      // Event is persisted — a recovery sweep can re-enqueue it later
    }
  } catch (error) {
    logger.error('Shopify webhook: failed to process at root', error, { topic });
    res.status(200).send('ok'); // Acknowledge to Shopify anyway
  }
});
