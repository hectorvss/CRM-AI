/**
 * server/webhooks/shopify.ts
 *
 * Inbound Shopify webhook handler — Flow 10 (Integraciones externas).
 *
 * Contract:
 *  1. SIGNATURE VALIDATION FIRST. The X-Shopify-Hmac-SHA256 header is verified
 *     against the raw body using SHOPIFY_WEBHOOK_SECRET BEFORE the payload is
 *     parsed or persisted. Mismatch → 401.
 *  2. FAIL-SAFE WHEN NOT CONFIGURED. If the Shopify integration has no
 *     credentials, the endpoint returns 503 with `WEBHOOK_NOT_CONFIGURED`.
 *     Crash-on-import is impossible because the registry registers the
 *     adapter in stub mode.
 *  3. PERSISTENCE BEFORE WORK. The raw event is stored in `webhook_events`
 *     and a canonical row is upserted into `canonical_events` with
 *     source='shopify' and the resolved tenant. A WEBHOOK_PROCESS job is
 *     enqueued so the worker (Flow 5) can process it asynchronously.
 *  4. IDEMPOTENCY. Deduplication uses `X-Shopify-Webhook-Id`; duplicates
 *     return 200 without re-enqueuing.
 *
 * Shopify retries up to 19 times if the response is non-200, so we ack
 * (200) for any case the merchant should not see retried (duplicates,
 * unsupported topic). Only signature failures (401) and missing config
 * (503) are surfaced as errors.
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { createIntegrationRepository } from '../data/integrations.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { integrationRegistry } from '../integrations/registry.js';
import {
  ShopifyNotConfiguredError,
  isIntegrationNotConfiguredError,
} from '../integrations/types.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';
import { logger } from '../utils/logger.js';
import type { ShopifyAdapter } from '../integrations/shopify.js';

export const shopifyWebhookRouter = Router();

/**
 * Topics that should fan out to canonical_events for downstream processing.
 * Anything else is acknowledged but skipped so Shopify doesn't retry.
 */
const SUPPORTED_TOPICS = new Set([
  'orders/create',
  'orders/paid',
  'orders/updated',
  'orders/cancelled',
  'orders/fulfilled',
  'refunds/create',
  'customers/create',
  'customers/update',
]);

/**
 * Map a Shopify topic to a coarse `event_category` used by the canonical
 * event store. Mirrors the conventions used by the Stripe webhook handler.
 */
function eventCategoryForTopic(topic: string): string {
  if (topic.startsWith('orders/'))    return 'order';
  if (topic.startsWith('refunds/'))   return 'refund';
  if (topic.startsWith('customers/')) return 'customer';
  return 'unknown';
}

/**
 * Resolve the tenant a webhook should be attributed to. Strategy:
 *   1. Look up a connector with system='shopify' and matching shop_domain.
 *   2. Fall back to the first Shopify connector ordered by created_at (single-
 *      tenant deployments where exactly one shop is connected).
 *
 * Returns null if no Shopify connector exists in the database — caller acks
 * with 200 to avoid Shopify retrying forever.
 */
async function resolveTenantForShopWebhook(shopDomain: string | undefined): Promise<{
  tenantId: string | null;
  workspaceId: string | null;
}> {
  const supabase = getSupabaseAdmin();

  if (shopDomain) {
    const { data, error } = await supabase
      .from('connectors')
      .select('tenant_id, workspace_id')
      .eq('system', 'shopify')
      .eq('shop_domain', shopDomain)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!error && data) {
      return {
        tenantId:    data.tenant_id ?? null,
        workspaceId: data.workspace_id ?? null,
      };
    }
  }

  const { data, error } = await supabase
    .from('connectors')
    .select('tenant_id, workspace_id')
    .eq('system', 'shopify')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  return {
    tenantId:    data?.tenant_id ?? null,
    workspaceId: data?.workspace_id ?? null,
  };
}

shopifyWebhookRouter.post('/', async (req: Request, res: Response) => {
  const rawBody = (req as any).rawBody as string | undefined;
  const headers = req.headers as Record<string, string>;

  const topic       = headers['x-shopify-topic']       as string | undefined;
  const webhookId   = headers['x-shopify-webhook-id']  as string | undefined;
  const shopDomain  = headers['x-shopify-shop-domain'] as string | undefined;
  const hmacHeader  = headers['x-shopify-hmac-sha256'] as string | undefined;

  // ── 0. Body presence ──────────────────────────────────────────────────────
  if (!rawBody) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Missing raw body' });
    return;
  }

  // ── 1. Adapter / configuration check ──────────────────────────────────────
  // The HMAC header MUST be present on every Shopify webhook delivery.
  // If the header is there but we have no secret, that's a server-side
  // misconfiguration → 503 so the merchant retries against a configured
  // environment instead of having webhooks silently fall on the floor.
  const adapter = integrationRegistry.get<ShopifyAdapter>('shopify');

  if (!adapter || !adapter.configured) {
    if (hmacHeader) {
      // Only warn loudly when a real Shopify delivery hits an unconfigured env.
      logger.warn(
        'Shopify webhook received but integration is not configured. ' +
        'Set SHOPIFY_SHOP_DOMAIN, SHOPIFY_ADMIN_API_TOKEN and SHOPIFY_WEBHOOK_SECRET.',
        { topic, shopDomain, missing: adapter?.missingCredentials() ?? ['SHOPIFY_*'] },
      );
    }
    res.status(503).json({
      error:   'WEBHOOK_NOT_CONFIGURED',
      code:    'SHOPIFY_NOT_CONFIGURED',
      message: 'Shopify webhook secret is not configured on this deployment.',
      missing: adapter?.missingCredentials() ?? ['SHOPIFY_WEBHOOK_SECRET'],
    });
    return;
  }

  // ── 2. Signature verification ─────────────────────────────────────────────
  // Adapter.verifyWebhook returns false for missing header OR mismatched HMAC.
  // We distinguish the two so the merchant gets a useful 4xx vs 5xx mapping.
  if (!hmacHeader) {
    logger.warn('Shopify webhook: missing X-Shopify-Hmac-SHA256 header', { topic, shopDomain });
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing signature header' });
    return;
  }

  const valid = adapter.verifyWebhook(rawBody, headers);
  if (!valid) {
    logger.warn('Shopify webhook: invalid signature', { topic, shopDomain });
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid signature' });
    return;
  }

  // ── 3. Topic filter ───────────────────────────────────────────────────────
  if (!topic || !SUPPORTED_TOPICS.has(topic)) {
    logger.debug('Shopify webhook: unsupported topic, acknowledging', { topic });
    res.status(200).json({ ok: true, skipped: true, reason: 'topic_not_supported' });
    return;
  }

  // ── 4. Tenant resolution ──────────────────────────────────────────────────
  let tenantInfo;
  try {
    tenantInfo = await resolveTenantForShopWebhook(shopDomain);
  } catch (err) {
    logger.error('Shopify webhook: tenant lookup failed', err, { topic, shopDomain });
    // 200 ack to avoid Shopify retry storms while we sort the DB out.
    res.status(200).json({ ok: true, skipped: true, reason: 'tenant_lookup_failed' });
    return;
  }

  if (!tenantInfo.tenantId) {
    logger.warn('Shopify webhook: no tenant mapping for shop', { topic, shopDomain });
    res.status(200).json({ ok: true, skipped: true, reason: 'no_tenant_mapping' });
    return;
  }

  const tenantId    = tenantInfo.tenantId;
  const workspaceId = tenantInfo.workspaceId;

  // ── 5. Persist + dedupe ───────────────────────────────────────────────────
  const dedupeKey = webhookId
    ? `shopify:webhook:${webhookId}`
    : `shopify:${topic}:${randomUUID()}`;

  const integrationRepo = createIntegrationRepository();
  const scope = { tenantId };

  try {
    const existing = await integrationRepo.getWebhookEventByDedupeKey(scope, dedupeKey);
    if (existing) {
      logger.debug('Shopify webhook: duplicate, skipping', { dedupeKey, topic });
      res.status(200).json({ ok: true, deduped: true });
      return;
    }
  } catch (err) {
    logger.warn('Shopify webhook: dedupe lookup failed (continuing)', {
      error: err instanceof Error ? err.message : String(err),
      topic,
    });
  }

  let parsedBody: Record<string, any>;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    logger.warn('Shopify webhook: invalid JSON body', { topic });
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Body is not valid JSON' });
    return;
  }

  const eventId = randomUUID();
  const now     = new Date().toISOString();
  const externalEntityId = parsedBody?.id ? String(parsedBody.id) : null;

  try {
    // Persist the raw delivery for auditability + recovery.
    await integrationRepo.createWebhookEvent(scope, {
      id:           eventId,
      sourceSystem: 'shopify',
      eventType:    topic,
      rawPayload:   parsedBody,
      status:       'received',
      dedupeKey,
      received_at:  now,
    });

    // Persist a canonical event with all fields the worker pipeline needs.
    await integrationRepo.createCanonicalEvent(scope, {
      id:                    eventId,
      source_system:         'shopify',
      source_entity_type:    eventCategoryForTopic(topic),
      source_entity_id:      externalEntityId,
      event_type:            topic,
      event_category:        eventCategoryForTopic(topic),
      canonical_entity_type: eventCategoryForTopic(topic),
      canonical_entity_id:   externalEntityId,
      normalized_payload:    parsedBody,
      dedupe_key:            dedupeKey,
      status:                'received',
      tenant_id:             tenantId,
      workspace_id:          workspaceId,
      occurred_at:           now,
      ingested_at:           now,
      updated_at:            now,
    });
  } catch (err) {
    logger.error('Shopify webhook: persistence failed', err, { topic, eventId });
    // Tell Shopify to retry — we want the event eventually.
    res.status(500).json({ error: 'PERSISTENCE_FAILED' });
    return;
  }

  // ── 6. Enqueue worker job ─────────────────────────────────────────────────
  try {
    await enqueue(
      JobType.WEBHOOK_PROCESS,
      {
        webhookEventId: eventId,
        source:         'shopify',
        rawBody,
        headers,
      },
      { tenantId, workspaceId: workspaceId ?? undefined, traceId: eventId, priority: 5 },
    );
    logger.info('Shopify webhook accepted', { eventId, topic, shopDomain });
  } catch (err) {
    // Persisted event + recovery sweep can re-enqueue later — don't fail the webhook.
    logger.error('Shopify webhook: enqueue failed (event persisted)', err, { topic, eventId });
  }

  res.status(200).json({ ok: true, eventId });
});

// Shared error handler for legacy paths; not currently mounted but kept so
// other webhook handlers can reuse the same translation rule.
export function shopifyErrorToHttp(err: unknown): { status: number; body: any } {
  if (err instanceof ShopifyNotConfiguredError || isIntegrationNotConfiguredError(err)) {
    return {
      status: 503,
      body:   { error: 'SHOPIFY_NOT_CONFIGURED', message: (err as Error).message },
    };
  }
  return { status: 500, body: { error: 'INTERNAL_ERROR' } };
}
