/**
 * server/routes/shopifyOAuth.ts
 *
 * Shopify-specific OAuth install + callback. Different enough from the
 * generic OAuth connectors (Google/Slack/MS) that it lives in its own file:
 *
 *  - The auth URL host depends on the SHOP, not the provider.
 *  - Shopify HMAC-signs the callback with the app secret (not just `state`).
 *  - On success we ALSO programmatically subscribe to webhooks — Shopify
 *    doesn't auto-register them.
 *
 *  GET  /api/integrations/shopify/install?shop=acme.myshopify.com
 *       → 302 to https://{shop}/admin/oauth/authorize?...
 *
 *  GET  /api/integrations/shopify/callback?code=&shop=&hmac=&state=&host=
 *       → Verify hmac+state, exchange code for offline token, upsert
 *         `connectors` row, subscribe webhook topics, redirect back to UI.
 *
 *  POST /api/integrations/shopify/disconnect
 *       → Marks the connector status='disconnected' and revokes the
 *         GraphQL session. Webhooks remain registered until the merchant
 *         uninstalls (Shopify clears them via app/uninstalled).
 *
 *  GET  /api/integrations/shopify/status
 *       → JSON: { connected, shop_domain, scope, last_health_check_at }
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import {
  buildInstallUrl,
  signState,
  verifyState,
  verifyCallbackHmac,
  exchangeCodeForToken,
  isValidShopDomain,
  SCOPES,
  type OAuthEnv,
} from '../integrations/shopify-oauth.js';
import { ShopifyAdapter } from '../integrations/shopify.js';
import { invalidateShopifyForTenant } from '../integrations/shopify-tenant.js';

export const shopifyOAuthRouter = Router();

// ── Env resolver ─────────────────────────────────────────────────────────────

function readEnv(): OAuthEnv | { error: string } {
  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  const stateSecret =
    process.env.SHOPIFY_STATE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!apiKey || !apiSecret) return { error: 'Shopify OAuth not configured: set SHOPIFY_API_KEY and SHOPIFY_API_SECRET' };
  if (!publicBase) return { error: 'PUBLIC_BASE_URL or VERCEL_URL must be set so Shopify knows where to redirect' };
  if (!stateSecret) return { error: 'SHOPIFY_STATE_SECRET must be set (or SUPABASE_SERVICE_ROLE_KEY as a fallback)' };
  const redirectUri = `https://${publicBase}/api/integrations/shopify/callback`;
  return { apiKey, apiSecret, stateSecret, redirectUri };
}

// ── Webhook topics auto-subscribed at install time ───────────────────────────

const WEBHOOK_TOPICS = [
  'orders/create',
  'orders/updated',
  'orders/cancelled',
  'orders/fulfilled',
  'orders/paid',
  'orders/edited',
  'fulfillments/create',
  'fulfillments/update',
  'refunds/create',
  'customers/create',
  'customers/update',
  'customers/redact',
  'app/uninstalled',
  'shop/redact',
  'returns/request',
  'returns/approve',
  'returns/decline',
  'returns/cancel',
  'returns/close',
  'disputes/create',
  'disputes/update',
] as const;

// ── GET /install ─────────────────────────────────────────────────────────────

shopifyOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).json({ error: env.error });

  const shop = String(req.query.shop || '').trim().toLowerCase();
  if (!isValidShopDomain(shop)) {
    return res.status(400).json({ error: 'shop param must be a valid <name>.myshopify.com domain' });
  }
  if (!req.tenantId || !req.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const state = signState(
    { t: req.tenantId, w: req.workspaceId ?? '', u: req.userId },
    env,
  );
  const url = buildInstallUrl({ shop, state, env, scopes: SCOPES });

  // For browser-initiated installs we 302-redirect; for fetch() callers we
  // return JSON so they can window.location it themselves.
  if (req.headers.accept?.includes('application/json')) {
    return res.json({ url, state });
  }
  return res.redirect(url);
});

// ── GET /callback ────────────────────────────────────────────────────────────

shopifyOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).send(env.error);

  // 1. HMAC over query string
  if (!verifyCallbackHmac(req.query as Record<string, any>, env)) {
    logger.warn('Shopify OAuth callback: hmac mismatch', { query: req.query });
    return res.status(401).send('Invalid HMAC signature');
  }

  // 2. State envelope
  const stateRaw = String(req.query.state || '');
  let state;
  try {
    state = verifyState(stateRaw, env);
  } catch (err) {
    logger.warn('Shopify OAuth callback: state invalid', { error: String(err) });
    return res.status(401).send('Invalid state');
  }

  // 3. Shop domain sanity
  const shop = String(req.query.shop || '').trim().toLowerCase();
  if (!isValidShopDomain(shop)) {
    return res.status(400).send('Invalid shop domain');
  }

  // 4. Exchange code → offline token
  const code = String(req.query.code || '');
  if (!code) return res.status(400).send('Missing code');

  let grant;
  try {
    grant = await exchangeCodeForToken({ shop, code, env });
  } catch (err) {
    logger.error('Shopify OAuth callback: token exchange failed', { error: String(err), shop });
    return res.status(502).send('Token exchange failed — try again from the integrations page');
  }

  // 5. Upsert the connector row. tenant_id is taken from the verified state,
  // NOT from the query string — this is the security boundary.
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `shopify::${state.t}::${shop}`;
  const webhookSecret = env.apiSecret; // Shopify uses the app secret for webhook HMAC.

  const authConfig = {
    shop_domain: shop,
    access_token: grant.accessToken,
    scope: grant.scope,
    webhook_secret: webhookSecret,
    associated_user: grant.associatedUser,
    granted_at: now,
  };

  // The `connectors` schema is tenant-scoped (no workspace_id column).
  const { error: upsertError } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: state.t,
    system: 'shopify',
    name: shop,
    status: 'connected',
    auth_type: 'oauth',
    auth_config: authConfig,
    capabilities: {
      reads: ['orders', 'customers', 'products', 'fulfillments', 'returns', 'inventory', 'metafields'],
      writes: ['orders', 'customers', 'refunds', 'returns', 'fulfillments', 'draft_orders', 'metafields'],
      webhooks: WEBHOOK_TOPICS,
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });

  if (upsertError) {
    logger.error('Shopify OAuth callback: connector upsert failed', { error: upsertError.message });
    return res.status(500).send('Could not persist Shopify connector — try again');
  }

  invalidateShopifyForTenant(state.t, state.w || null);

  // 6. Subscribe to webhook topics. Failures here are NOT fatal — we log and
  // continue; the Integrations page will surface a "needs re-sync" warning.
  void subscribeWebhooks({
    shop,
    accessToken: grant.accessToken,
    webhookSecret,
    publicBase: env.redirectUri.replace(/\/api\/integrations\/shopify\/callback$/, ''),
  }).catch((err) => {
    logger.warn('Shopify webhook auto-subscribe failed', { shop, error: String(err) });
  });

  // 7. Audit
  await supabase
    .from('audit_events')
    .insert({
      id: randomUUID(),
      tenant_id: state.t,
      workspace_id: state.w || state.t,
      actor_id: state.u,
      actor_type: 'user',
      action: 'INTEGRATION_CONNECTED',
      entity_type: 'connector',
      entity_id: connectorId,
      metadata: { system: 'shopify', shop, scope: grant.scope },
      occurred_at: now,
    })
    .then(() => {}, (err) => logger.warn('audit insert failed', { error: String(err) }));

  // 8. Redirect to the SaaS UI integrations page.
  const redirectTarget = `/integrations?connected=shopify&shop=${encodeURIComponent(shop)}`;
  return res.redirect(redirectTarget);
});

// ── POST /disconnect ─────────────────────────────────────────────────────────

shopifyOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('connectors')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('tenant_id', req.tenantId)
    .eq('system', 'shopify');
  if (error) return res.status(500).json({ error: error.message });
  invalidateShopifyForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

// ── GET /status ──────────────────────────────────────────────────────────────

shopifyOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'shopify')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  return res.json({
    connected: data.status === 'connected',
    shop_domain: (data.auth_config as any)?.shop_domain ?? null,
    scope: (data.auth_config as any)?.scope ?? null,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});

// ── Webhook subscription helper ──────────────────────────────────────────────

async function subscribeWebhooks(opts: {
  shop: string;
  accessToken: string;
  webhookSecret: string;
  publicBase: string;
}): Promise<void> {
  const adapter = new ShopifyAdapter({
    shopDomain: opts.shop,
    adminApiToken: opts.accessToken,
    webhookSecret: opts.webhookSecret,
  });
  const callbackUrl = `${opts.publicBase}/webhooks/shopify`;

  // Re-subscribe is safe — `createWebhookSubscription` swallows the 422 dup.
  for (const topic of WEBHOOK_TOPICS) {
    try {
      await adapter.createWebhookSubscription({
        topic,
        address: callbackUrl,
        format: 'json',
      });
    } catch (err: any) {
      logger.warn('webhook subscribe failed', { shop: opts.shop, topic, error: String(err?.message || err) });
    }
  }
}
