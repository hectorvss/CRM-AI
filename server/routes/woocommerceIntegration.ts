/**
 * server/routes/woocommerceIntegration.ts
 *
 * WooCommerce uses API-key auth (consumer_key + consumer_secret) over
 * HTTPS — no OAuth dance. The merchant pastes their site URL + keys,
 * we validate by hitting /coupons, auto-register webhooks for the
 * 9 most-relevant topics with a Clain-generated signing secret.
 *
 *   POST /api/integrations/woocommerce/connect
 *   POST /api/integrations/woocommerce/disconnect
 *   GET  /api/integrations/woocommerce/status
 *   POST /api/integrations/woocommerce/sync             — list latest orders
 *   POST /api/integrations/woocommerce/register-webhooks — manual re-register
 */

import { Router, Response } from 'express';
import { randomBytes, randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { WooCommerceAdapter } from '../integrations/woocommerce.js';
import {
  invalidateWooForTenant,
  wooForTenant,
} from '../integrations/woocommerce-tenant.js';

export const woocommerceIntegrationRouter = Router();

function publicBase(): string {
  return (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
}

function webhookCallbackUrl(): string {
  const base = publicBase();
  return base ? `https://${base}/webhooks/woocommerce` : '';
}

const WEBHOOK_TOPICS = [
  'order.created',
  'order.updated',
  'order.deleted',
  'order.restored',
  'customer.created',
  'customer.updated',
  'customer.deleted',
  'product.updated',
  'coupon.created',
];

function normaliseSiteUrl(raw: string): string {
  let s = raw.trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s.replace(/\/+$/, '');
}

woocommerceIntegrationRouter.post('/connect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });

  const siteUrl = normaliseSiteUrl(String(req.body?.site_url || ''));
  const consumerKey = String(req.body?.consumer_key || '').trim();
  const consumerSecret = String(req.body?.consumer_secret || '').trim();
  const storeNameInput = String(req.body?.store_name || '').trim();

  if (!siteUrl) return res.status(400).json({ error: 'site_url required (e.g. https://shop.acme.com)' });
  if (!/^https:\/\//i.test(siteUrl)) {
    return res.status(400).json({ error: 'site_url must be HTTPS for secure Basic auth' });
  }
  if (!consumerKey.startsWith('ck_')) return res.status(400).json({ error: 'consumer_key should start with "ck_"' });
  if (!consumerSecret.startsWith('cs_')) return res.status(400).json({ error: 'consumer_secret should start with "cs_"' });

  // 1. Validate creds.
  const adapter = new WooCommerceAdapter({ siteUrl, consumerKey, consumerSecret });
  const ping = await adapter.ping();
  if (!ping.ok) {
    return res.status(400).json({
      error: 'WooCommerce rejected the credentials. Verify the site URL and that the consumer key has read+write scopes.',
      woo_status: ping.statusCode ?? null,
    });
  }

  // 2. Generate per-tenant webhook secret and register all 9 topics.
  const webhookSecret = randomBytes(32).toString('hex');
  const callback = webhookCallbackUrl();
  let webhookIds: number[] = [];
  let webhookError: string | null = null;

  if (callback) {
    try {
      // Best-effort: list existing Clain webhooks first and remove them
      // so we don't pile duplicates on reconnect.
      const existing = await adapter.listWebhooks();
      for (const wh of existing) {
        if (wh.delivery_url === callback) {
          try { await adapter.deleteWebhook(wh.id); } catch { /* ignore */ }
        }
      }
      for (const topic of WEBHOOK_TOPICS) {
        try {
          const wh = await adapter.createWebhook({
            name: `Clain — ${topic}`,
            topic,
            delivery_url: callback,
            secret: webhookSecret,
            status: 'active',
          });
          webhookIds.push(wh.id);
        } catch (err: any) {
          logger.warn(`Woo webhook create failed for ${topic}`, { error: String(err) });
        }
      }
    } catch (err: any) {
      webhookError = String(err?.message ?? err);
      logger.warn('Woo webhook registration failed (continuing)', { error: webhookError });
    }
  }

  // 3. Persist connector.
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const host = new URL(siteUrl).host;
  const connectorId = `woocommerce::${req.tenantId}::${host}`;

  const authConfig = {
    site_url: siteUrl,
    consumer_key: consumerKey,
    consumer_secret: consumerSecret,
    store_name: storeNameInput || host,
    webhook_secret: webhookSecret,
    webhook_url: callback,
    webhook_ids: webhookIds,
    webhook_topics: WEBHOOK_TOPICS,
    webhook_error: webhookError,
    granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: req.tenantId,
    system: 'woocommerce',
    name: storeNameInput || host,
    status: 'connected',
    auth_type: 'api_key_pair',
    auth_config: authConfig,
    capabilities: {
      reads: ['orders', 'customers', 'products', 'coupons', 'order_notes', 'system_status'],
      writes: ['update_order', 'add_order_note', 'refund_order', 'create_customer', 'update_customer'],
      events: WEBHOOK_TOPICS,
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });

  if (error) {
    logger.error('Woo connect: upsert failed', { error: error.message });
    return res.status(500).json({ error: 'Could not persist WooCommerce connector' });
  }

  invalidateWooForTenant(req.tenantId, req.workspaceId ?? null);

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: req.tenantId,
    workspace_id: req.workspaceId ?? req.tenantId,
    actor_id: req.userId,
    actor_type: 'user',
    action: 'INTEGRATION_CONNECTED',
    entity_type: 'connector',
    entity_id: connectorId,
    metadata: { system: 'woocommerce', site_url: siteUrl, webhook_ids: webhookIds.length, webhook_error: webhookError },
    occurred_at: now,
  }).then(() => {}, () => {});

  return res.json({
    ok: true,
    site_url: siteUrl,
    store_name: storeNameInput || host,
    webhook_url: callback,
    webhooks_registered: webhookIds.length,
    webhook_topics: WEBHOOK_TOPICS,
    webhook_error: webhookError,
  });
});

woocommerceIntegrationRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  // Best-effort: delete the Woo-side webhooks so events stop flowing.
  const resolved = await wooForTenant(req.tenantId, req.workspaceId ?? null);
  if (resolved?.connector.webhookIds?.length) {
    for (const id of resolved.connector.webhookIds) {
      try { await resolved.adapter.deleteWebhook(id); } catch (err) {
        logger.warn('Woo deleteWebhook failed (continuing)', { id, error: String(err) });
      }
    }
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('connectors')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('tenant_id', req.tenantId)
    .eq('system', 'woocommerce');
  if (error) return res.status(500).json({ error: error.message });
  invalidateWooForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

woocommerceIntegrationRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'woocommerce')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    site_url: cfg.site_url ?? null,
    store_name: cfg.store_name ?? null,
    webhook_url: cfg.webhook_url ?? null,
    webhooks_registered: Array.isArray(cfg.webhook_ids) ? (cfg.webhook_ids as unknown[]).length : 0,
    webhook_topics: cfg.webhook_topics ?? [],
    webhook_error: cfg.webhook_error ?? null,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});

woocommerceIntegrationRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await wooForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'WooCommerce not connected' });
  try {
    const orders = await resolved.adapter.listOrders({ perPage: 5, orderBy: 'date', order: 'desc' });
    return res.json({
      ok: true,
      orders_visible: orders.length,
      sample: orders.slice(0, 3).map(o => ({
        id: o.id, number: o.number, status: o.status, total: o.total, currency: o.currency,
      })),
    });
  } catch (err: any) {
    return res.status(502).json({
      error: 'WooCommerce API call failed',
      details: err?.wooError ?? String(err?.message ?? err),
    });
  }
});

woocommerceIntegrationRouter.post('/register-webhooks', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await wooForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'WooCommerce not connected' });
  const callback = webhookCallbackUrl();
  if (!callback) return res.status(503).json({ error: 'PUBLIC_BASE_URL not configured' });

  try {
    // Tear down any existing Clain webhooks pointing at our callback.
    const existing = await resolved.adapter.listWebhooks();
    for (const wh of existing) {
      if (wh.delivery_url === callback) {
        try { await resolved.adapter.deleteWebhook(wh.id); } catch { /* ignore */ }
      }
    }
    // Re-register all topics with a fresh secret so old captures can't be replayed.
    const newSecret = randomBytes(32).toString('hex');
    const newIds: number[] = [];
    for (const topic of WEBHOOK_TOPICS) {
      try {
        const wh = await resolved.adapter.createWebhook({
          name: `Clain — ${topic}`,
          topic, delivery_url: callback, secret: newSecret, status: 'active',
        });
        newIds.push(wh.id);
      } catch (err) {
        logger.warn(`Woo webhook re-register failed for ${topic}`, { error: String(err) });
      }
    }

    const supabase = getSupabaseAdmin();
    const merged = {
      ...resolved.connector.rawAuthConfig,
      webhook_secret: newSecret,
      webhook_ids: newIds,
      webhook_url: callback,
      webhook_error: null,
    };
    await supabase
      .from('connectors')
      .update({ auth_config: merged, last_health_check_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', resolved.connector.id);
    invalidateWooForTenant(req.tenantId, req.workspaceId ?? null);

    return res.json({ ok: true, webhooks_registered: newIds.length, webhook_url: callback });
  } catch (err: any) {
    return res.status(502).json({ error: String(err?.message ?? err) });
  }
});
