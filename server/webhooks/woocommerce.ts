/**
 * server/webhooks/woocommerce.ts
 *
 * WooCommerce webhook handler.
 *
 * Each webhook delivery includes:
 *   - X-WC-Webhook-Topic     (e.g. "order.created")
 *   - X-WC-Webhook-Resource   (e.g. "order")
 *   - X-WC-Webhook-Event      (e.g. "created")
 *   - X-WC-Webhook-Source     (the merchant's site URL)
 *   - X-WC-Webhook-ID         (numeric)
 *   - X-WC-Webhook-Signature  (base64 HMAC-SHA256 of raw body, secret-keyed)
 *   - X-WC-Webhook-Delivery-ID
 *
 * The signature secret is unique per webhook (we generate one secret per
 * tenant when registering all 9 topics during /connect). Signature
 * verification + tenant lookup happen by iterating active connectors and
 * checking each `webhook_secret` until one matches.
 */

import { Router, Request, Response, raw } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { verifyWooWebhookSignature } from '../integrations/woocommerce.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const woocommerceWebhookRouter = Router();

woocommerceWebhookRouter.post(
  '/',
  raw({ type: '*/*', limit: '5mb' }),
  async (req: Request, res: Response) => {
    const signature = String(req.header('X-WC-Webhook-Signature') || '');
    const topic = String(req.header('X-WC-Webhook-Topic') || 'unknown');
    const source = String(req.header('X-WC-Webhook-Source') || '');
    const deliveryId = String(req.header('X-WC-Webhook-Delivery-ID') || '');
    const wcWebhookId = String(req.header('X-WC-Webhook-ID') || '');

    if (!signature) {
      logger.warn('woo webhook: missing signature');
      return res.status(401).end();
    }

    const rawBody = (req.body as Buffer).toString('utf8');

    // Iterate active Woo connectors and find the one whose webhook_secret
    // verifies. Cheaper than including site_url in lookup because Woo also
    // sends pings before delivery — those have empty bodies.
    const supabase = getSupabaseAdmin();
    const { data: rows } = await supabase
      .from('connectors')
      .select('id, tenant_id, auth_config')
      .eq('system', 'woocommerce')
      .eq('status', 'connected');

    let matched: { tenantId: string; connectorId: string; siteUrl: string } | null = null;
    for (const row of rows ?? []) {
      const cfg = (row.auth_config ?? {}) as Record<string, unknown>;
      const secret = typeof cfg.webhook_secret === 'string' ? cfg.webhook_secret : '';
      if (!secret) continue;
      if (verifyWooWebhookSignature({ rawBody, signature, secret })) {
        matched = {
          tenantId: String(row.tenant_id),
          connectorId: String(row.id),
          siteUrl: typeof cfg.site_url === 'string' ? cfg.site_url : '',
        };
        break;
      }
    }
    if (!matched) {
      logger.warn('woo webhook: no connector signature matched', { topic, source });
      return res.status(401).end();
    }

    // Empty-body ping — Woo sends one when the webhook is created. Ack 200
    // so the topic stays active.
    if (!rawBody || rawBody.trim() === '') return res.status(200).end();

    let event: any;
    try { event = JSON.parse(rawBody); } catch { return res.status(200).end(); }

    const externalId = `woo::${matched.connectorId}::${deliveryId || `${topic}::${event?.id ?? randomUUID()}`}`;

    const eventId = randomUUID();
    const { error } = await supabase.from('webhook_events').insert({
      id: eventId,
      tenant_id: matched.tenantId,
      source_system: 'woocommerce',
      event_type: `woocommerce.${topic.replace(/\W+/g, '.').toLowerCase()}`,
      raw_payload: {
        topic,
        source,
        wc_webhook_id: wcWebhookId,
        wc_delivery_id: deliveryId,
        site_url: matched.siteUrl,
        // Top-level fields by topic family
        order_id: topic.startsWith('order.') ? event?.id ?? null : null,
        order_number: topic.startsWith('order.') ? event?.number ?? null : null,
        order_status: topic.startsWith('order.') ? event?.status ?? null : null,
        customer_id: topic.startsWith('customer.') ? event?.id ?? null : null,
        customer_email: topic.startsWith('customer.') ? event?.email ?? null : null,
        product_id: topic.startsWith('product.') ? event?.id ?? null : null,
        coupon_code: topic.startsWith('coupon.') ? event?.code ?? null : null,
        connector_id: matched.connectorId,
        body: event,
      },
      received_at: new Date().toISOString(),
      status: 'received',
      dedupe_key: externalId,
    });

    if (error && error.code !== '23505') {
      logger.warn('woo persist failed', { error: error.message });
      return res.status(500).end();
    }

    if (error?.code !== '23505') {
      try {
        await enqueue(JobType.WEBHOOK_PROCESS, {
          webhookEventId: eventId,
          source: 'woocommerce',
        }, { tenantId: matched.tenantId });
      } catch (err) {
        logger.warn('woo enqueue failed', { error: String(err) });
      }
    }

    return res.status(200).end();
  },
);
