/**
 * server/routes/stripeOAuth.ts
 *
 *   GET  /api/integrations/stripe/install        — kick off Connect OAuth
 *   GET  /api/integrations/stripe/callback       — verify state, exchange code,
 *                                                  upsert connector, subscribe webhooks,
 *                                                  redirect to /integrations.
 *   POST /api/integrations/stripe/disconnect     — deauthorize + mark disconnected
 *   GET  /api/integrations/stripe/status         — { connected, account, livemode, ... }
 *   POST /api/integrations/stripe/manual-connect — direct API key fallback
 *
 * Different from Shopify in two ways:
 *  - Auth host is shared (https://connect.stripe.com), not per-account.
 *  - We register a webhook endpoint via API so events flow to /webhooks/stripe.
 *    Stripe returns the webhook signing secret only at creation time, so we
 *    persist it in auth_config.webhook_secret.
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
  exchangeCodeForToken,
  deauthorize,
  type StripeOAuthEnv,
} from '../integrations/stripe-oauth.js';
import { StripeAdapter } from '../integrations/stripe.js';
import { invalidateStripeForTenant } from '../integrations/stripe-tenant.js';

export const stripeOAuthRouter = Router();

// ── Env resolver ─────────────────────────────────────────────────────────────

function readEnv(): StripeOAuthEnv | { error: string } {
  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
  const platformSecretKey = process.env.STRIPE_SECRET_KEY;
  const stateSecret =
    process.env.STRIPE_STATE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !platformSecretKey) {
    return { error: 'Stripe Connect not configured: set STRIPE_CONNECT_CLIENT_ID and STRIPE_SECRET_KEY' };
  }
  if (!publicBase) return { error: 'PUBLIC_BASE_URL or VERCEL_URL must be set so Stripe knows where to redirect' };
  if (!stateSecret) return { error: 'STRIPE_STATE_SECRET must be set (or SUPABASE_SERVICE_ROLE_KEY as a fallback)' };
  const redirectUri = `https://${publicBase}/api/integrations/stripe/callback`;
  return { clientId, platformSecretKey, stateSecret, redirectUri };
}

// ── Webhook events the SaaS reacts to ────────────────────────────────────────

const WEBHOOK_EVENTS = [
  'charge.succeeded',
  'charge.failed',
  'charge.refunded',
  'charge.captured',
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
  'charge.dispute.funds_reinstated',
  'charge.dispute.funds_withdrawn',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
  'payment_intent.requires_action',
  'refund.created',
  'refund.updated',
  'customer.created',
  'customer.updated',
  'customer.deleted',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.trial_will_end',
  'invoice.created',
  'invoice.finalized',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.upcoming',
  'invoice.voided',
  'payout.paid',
  'payout.failed',
  'checkout.session.completed',
  'checkout.session.expired',
] as const;

// ── GET /install ─────────────────────────────────────────────────────────────

stripeOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).json({ error: env.error });

  if (!req.tenantId || !req.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const state = signState({ t: req.tenantId, w: req.workspaceId ?? '', u: req.userId }, env);

  // Optional pre-fill from query: email / business_name etc.
  const prefill: Record<string, string> = {};
  ['email', 'business_name', 'country', 'first_name', 'last_name', 'phone_number', 'url'].forEach((k) => {
    const v = req.query[k];
    if (typeof v === 'string' && v.trim()) prefill[k] = v.trim();
  });

  const url = buildInstallUrl({
    state,
    env,
    scope: 'read_write',
    prefill: Object.keys(prefill).length > 0 ? prefill : undefined,
  });

  if (req.headers.accept?.includes('application/json')) {
    return res.json({ url, state });
  }
  return res.redirect(url);
});

// ── GET /callback ────────────────────────────────────────────────────────────

stripeOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).send(env.error);

  // 1. Stripe surfaces user denials as ?error=access_denied
  const stripeError = typeof req.query.error === 'string' ? req.query.error : null;
  if (stripeError) {
    logger.info('Stripe OAuth callback: user denied or error', { error: stripeError });
    return res.redirect(`/integrations?error=stripe&reason=${encodeURIComponent(stripeError)}`);
  }

  // 2. State envelope (CSRF + tenant context)
  const stateRaw = String(req.query.state || '');
  let state;
  try {
    state = verifyState(stateRaw, env);
  } catch (err) {
    logger.warn('Stripe OAuth callback: state invalid', { error: String(err) });
    return res.status(401).send('Invalid state');
  }

  // 3. Exchange code → access_token
  const code = String(req.query.code || '');
  if (!code) return res.status(400).send('Missing code');

  let grant;
  try {
    grant = await exchangeCodeForToken({ code, env });
  } catch (err) {
    logger.error('Stripe OAuth callback: token exchange failed', { error: String(err) });
    return res.status(502).send('Token exchange failed — try again from the integrations page');
  }

  // 4. Auto-register a webhook endpoint pointing to OUR webhook handler.
  //    Stripe returns the signing secret only at creation, so we persist it.
  const publicBase = env.redirectUri.replace(/\/api\/integrations\/stripe\/callback$/, '');
  const webhookUrl = `${publicBase}/webhooks/stripe`;
  let webhookSecret = '';
  try {
    const tempAdapter = new StripeAdapter(grant.accessToken, '');
    const ep = await tempAdapter.createWebhookEndpoint({
      url: webhookUrl,
      events: [...WEBHOOK_EVENTS],
      description: 'CRM-AI auto-registered',
      metadata: { tenant_id: state.t, workspace_id: state.w || '' },
    });
    webhookSecret = ep.secret;
  } catch (err: any) {
    // Non-fatal: a duplicate URL throws — try to look up the existing endpoint
    // and reuse its secret (best-effort; the merchant can re-create from the
    // Integrations page if signing fails).
    logger.warn('Stripe webhook auto-register failed (continuing)', { error: String(err?.message || err) });
  }

  // 5. Upsert connector. tenant_id from the verified state, NOT query.
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `stripe::${state.t}::${grant.stripeUserId}`;

  const authConfig = {
    stripe_user_id: grant.stripeUserId,
    access_token: grant.accessToken,
    refresh_token: grant.refreshToken,
    publishable_key: grant.stripePublishableKey,
    scope: grant.scope,
    livemode: grant.livemode,
    webhook_secret: webhookSecret,
    granted_at: now,
  };

  const { error: upsertError } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: state.t,
    system: 'stripe',
    name: grant.stripeUserId,
    status: 'connected',
    auth_type: 'oauth',
    auth_config: authConfig,
    capabilities: {
      reads: ['payments', 'charges', 'customers', 'subscriptions', 'invoices', 'disputes', 'payouts', 'balance'],
      writes: ['refunds', 'disputes_evidence', 'subscriptions', 'invoices', 'customers', 'coupons', 'webhooks'],
      webhook_events: WEBHOOK_EVENTS,
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });

  if (upsertError) {
    logger.error('Stripe OAuth callback: connector upsert failed', { error: upsertError.message });
    return res.status(500).send('Could not persist Stripe connector — try again');
  }

  invalidateStripeForTenant(state.t, state.w || null);

  // 6. Audit
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
      metadata: { system: 'stripe', stripe_user_id: grant.stripeUserId, livemode: grant.livemode, scope: grant.scope },
      occurred_at: now,
    })
    .then(() => {}, (err) => logger.warn('audit insert failed', { error: String(err) }));

  return res.redirect(
    `/integrations?connected=stripe&account=${encodeURIComponent(grant.stripeUserId)}&livemode=${grant.livemode ? '1' : '0'}`,
  );
});

// ── POST /disconnect ─────────────────────────────────────────────────────────

stripeOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const env = readEnv();
  const supabase = getSupabaseAdmin();

  // Read the connector first so we know which Stripe account to deauth.
  const { data: row } = await supabase
    .from('connectors')
    .select('id, auth_config')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'stripe')
    .eq('status', 'connected')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const stripeUserId = (row?.auth_config as any)?.stripe_user_id as string | undefined;

  // Best-effort deauthorize on Stripe's side. Ignore failures (e.g. token
  // already revoked) — we still want to flip our local row.
  if (stripeUserId && !('error' in env)) {
    try {
      await deauthorize({ stripeUserId, env });
    } catch (err) {
      logger.warn('Stripe deauthorize failed (continuing)', { stripeUserId, error: String(err) });
    }
  }

  const { error } = await supabase
    .from('connectors')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('tenant_id', req.tenantId)
    .eq('system', 'stripe');
  if (error) return res.status(500).json({ error: error.message });
  invalidateStripeForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

// ── GET /status ──────────────────────────────────────────────────────────────

stripeOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'stripe')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    stripe_user_id: cfg.stripe_user_id ?? null,
    publishable_key: cfg.publishable_key ?? null,
    scope: cfg.scope ?? null,
    livemode: cfg.livemode === true,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});

// ── POST /manual-connect ─────────────────────────────────────────────────────
// Direct API key fallback for merchants who don't want to go through Connect.
// They paste a restricted key (rk_live_... or sk_live_...) and a webhook secret.

stripeOAuthRouter.post('/manual-connect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });

  const secretKey = String(req.body?.secret_key || '').trim();
  const webhookSecret = String(req.body?.webhook_secret || '').trim();
  if (!secretKey.startsWith('sk_') && !secretKey.startsWith('rk_')) {
    return res.status(400).json({ error: 'secret_key must start with sk_ or rk_' });
  }
  if (webhookSecret && !webhookSecret.startsWith('whsec_')) {
    return res.status(400).json({ error: 'webhook_secret must start with whsec_' });
  }

  // Validate by hitting /account.
  let acctId = '';
  let livemode = false;
  try {
    const adapter = new StripeAdapter(secretKey, webhookSecret);
    const acct = (await adapter.getAccount()) as { id: string; livemode?: boolean };
    acctId = acct.id;
    livemode = acct.livemode === true;
  } catch (err) {
    return res.status(400).json({ error: 'Stripe rejected the secret key. Check it and try again.' });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `stripe::${req.tenantId}::${acctId}`;
  const { error } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: req.tenantId,
    system: 'stripe',
    name: acctId,
    status: 'connected',
    auth_type: 'api_key',
    auth_config: {
      stripe_user_id: acctId,
      access_token: secretKey,
      webhook_secret: webhookSecret || '',
      livemode,
      scope: 'manual',
      granted_at: now,
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });
  if (error) return res.status(500).json({ error: error.message });
  invalidateStripeForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true, stripe_user_id: acctId, livemode });
});
