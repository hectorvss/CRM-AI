/**
 * server/routes/paypalIntegration.ts
 *
 * PayPal is API-key based (Client Credentials), so the modal collects
 * Client ID + Secret + sandbox/live, validates by fetching an access
 * token, auto-registers a webhook on the merchant's app, and stores it
 * all in `connectors`.
 *
 *   POST /api/integrations/paypal/connect    — paste creds + validate
 *   POST /api/integrations/paypal/disconnect — flag disconnected (deletes webhook)
 *   GET  /api/integrations/paypal/status     — full status
 *   POST /api/integrations/paypal/send-test  — list latest disputes
 *   POST /api/integrations/paypal/register-webhook — manual re-register
 */

import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { fetchAccessToken, type PayPalMode } from '../integrations/paypal-oauth.js';
import { PayPalAdapter } from '../integrations/paypal.js';
import {
  invalidatePayPalForTenant,
  loadPayPalConnector,
  paypalForTenant,
} from '../integrations/paypal-tenant.js';

export const paypalIntegrationRouter = Router();

function publicBase(): string {
  return (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
}

function webhookCallbackUrl(): string {
  const base = publicBase();
  return base ? `https://${base}/webhooks/paypal` : '';
}

const WEBHOOK_EVENTS = [
  'PAYMENT.CAPTURE.COMPLETED',
  'PAYMENT.CAPTURE.DENIED',
  'PAYMENT.CAPTURE.PENDING',
  'PAYMENT.CAPTURE.REFUNDED',
  'PAYMENT.CAPTURE.REVERSED',
  'PAYMENT.AUTHORIZATION.CREATED',
  'PAYMENT.AUTHORIZATION.VOIDED',
  'CHECKOUT.ORDER.APPROVED',
  'CHECKOUT.ORDER.COMPLETED',
  'CUSTOMER.DISPUTE.CREATED',
  'CUSTOMER.DISPUTE.UPDATED',
  'CUSTOMER.DISPUTE.RESOLVED',
  'BILLING.SUBSCRIPTION.CREATED',
  'BILLING.SUBSCRIPTION.ACTIVATED',
  'BILLING.SUBSCRIPTION.UPDATED',
  'BILLING.SUBSCRIPTION.CANCELLED',
  'BILLING.SUBSCRIPTION.SUSPENDED',
  'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
  'INVOICING.INVOICE.PAID',
  'INVOICING.INVOICE.CANCELLED',
  'INVOICING.INVOICE.REFUNDED',
];

// ── POST /connect ────────────────────────────────────────────────────────────

paypalIntegrationRouter.post('/connect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });

  const clientId = String(req.body?.client_id || '').trim();
  const clientSecret = String(req.body?.client_secret || '').trim();
  const mode: PayPalMode = req.body?.mode === 'live' ? 'live' : 'sandbox';

  if (!clientId) return res.status(400).json({ error: 'client_id required' });
  if (!clientSecret) return res.status(400).json({ error: 'client_secret required' });

  // 1. Validate by minting a token.
  let token;
  try {
    token = await fetchAccessToken({ clientId, clientSecret, mode });
  } catch (err: any) {
    return res.status(400).json({
      error: 'PayPal rejected the credentials. Verify the Client ID and Secret in developer.paypal.com.',
      paypalMessage: String(err?.message ?? err).split(': ').slice(-1)[0],
    });
  }

  // 2. Best-effort: fetch merchant info + register webhook.
  const adapter = new PayPalAdapter(token.accessToken, mode);
  let merchantEmail: string | null = null;
  let webhookId: string | null = null;
  let webhookRegistrationError: string | null = null;
  try {
    const info = (await adapter.getMerchantInfo()) as { emails?: Array<{ value: string }>; name?: { given_name?: string; surname?: string } };
    merchantEmail = info.emails?.[0]?.value ?? null;
  } catch (err) {
    logger.warn('PayPal merchant info fetch failed (continuing)', { error: String(err) });
  }

  const url = webhookCallbackUrl();
  if (url) {
    try {
      const wh = await adapter.createWebhook({ url, eventTypes: WEBHOOK_EVENTS });
      webhookId = wh.id;
    } catch (err: any) {
      // 422 = duplicate URL. Try to look up existing webhook with same URL.
      if (err?.statusCode === 422) {
        try {
          const existing = (await adapter.listWebhooks()) as Array<{ id: string; url: string }>;
          const match = existing.find((w) => w.url === url);
          if (match) webhookId = match.id;
        } catch { /* ignore */ }
      }
      if (!webhookId) webhookRegistrationError = String(err?.message ?? err);
    }
  }

  // 3. Persist connector.
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `paypal::${req.tenantId}::${token.appId}`;

  const authConfig = {
    client_id: clientId,
    client_secret: clientSecret,
    mode,
    app_id: token.appId,
    merchant_email: merchantEmail,
    webhook_id: webhookId,
    webhook_url: url,
    webhook_registration_error: webhookRegistrationError,
    access_token: token.accessToken,
    expires_at: token.expiresAt,
    scope: token.scope,
    granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: req.tenantId,
    system: 'paypal',
    name: merchantEmail || token.appId,
    status: 'connected',
    auth_type: 'api_key_pair',
    auth_config: authConfig,
    capabilities: {
      reads: ['orders', 'captures', 'authorizations', 'refunds', 'disputes', 'subscriptions', 'invoices', 'transactions'],
      writes: ['capture', 'authorize', 'void', 'refund', 'accept_dispute', 'provide_evidence', 'cancel_subscription', 'create_invoice', 'send_invoice'],
      mode,
      webhook_events: WEBHOOK_EVENTS,
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });

  if (error) {
    logger.error('PayPal connect: upsert failed', { error: error.message });
    return res.status(500).json({ error: 'Could not persist PayPal connector' });
  }

  invalidatePayPalForTenant(req.tenantId, req.workspaceId ?? null);

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: req.tenantId,
    workspace_id: req.workspaceId ?? req.tenantId,
    actor_id: req.userId,
    actor_type: 'user',
    action: 'INTEGRATION_CONNECTED',
    entity_type: 'connector',
    entity_id: connectorId,
    metadata: { system: 'paypal', mode, app_id: token.appId, merchant_email: merchantEmail, webhook_id: webhookId },
    occurred_at: now,
  }).then(() => {}, () => {});

  return res.json({
    ok: true,
    mode,
    app_id: token.appId,
    merchant_email: merchantEmail,
    webhook_id: webhookId,
    webhook_url: url,
    webhook_registration_error: webhookRegistrationError,
  });
});

// ── POST /disconnect ─────────────────────────────────────────────────────────

paypalIntegrationRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });

  // Best-effort: delete the webhook on PayPal so events stop flowing.
  const resolved = await paypalForTenant(req.tenantId, req.workspaceId ?? null);
  if (resolved?.connector.webhookId) {
    try {
      await resolved.adapter.deleteWebhook(resolved.connector.webhookId);
    } catch (err) {
      logger.warn('PayPal deleteWebhook failed', { error: String(err) });
    }
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('connectors')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('tenant_id', req.tenantId)
    .eq('system', 'paypal');
  if (error) return res.status(500).json({ error: error.message });

  invalidatePayPalForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

// ── GET /status ──────────────────────────────────────────────────────────────

paypalIntegrationRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'paypal')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    mode: cfg.mode ?? null,
    app_id: cfg.app_id ?? null,
    merchant_email: cfg.merchant_email ?? null,
    webhook_id: cfg.webhook_id ?? null,
    webhook_url: cfg.webhook_url ?? null,
    webhook_registered: Boolean(cfg.webhook_id),
    webhook_registration_error: cfg.webhook_registration_error ?? null,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});

// ── POST /send-test ──────────────────────────────────────────────────────────
// PayPal sandbox doesn't have a "send test SMS" equivalent — the cleanest test
// is to list disputes / orders and confirm the API responds.

paypalIntegrationRouter.post('/send-test', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await paypalForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'PayPal not connected' });

  try {
    const disputes = await resolved.adapter.listDisputes({ pageSize: 5 });
    return res.json({ ok: true, disputes_visible: disputes.length });
  } catch (err: any) {
    return res.status(502).json({
      error: 'PayPal API call failed — check the credentials',
      details: String(err?.message ?? err),
    });
  }
});

// ── POST /register-webhook (manual re-register) ──────────────────────────────

paypalIntegrationRouter.post('/register-webhook', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await paypalForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'PayPal not connected' });

  const url = webhookCallbackUrl();
  if (!url) return res.status(503).json({ error: 'PUBLIC_BASE_URL not configured' });

  try {
    let webhookId = resolved.connector.webhookId;
    if (webhookId) {
      // Delete the old one so we get a fresh signing material.
      try { await resolved.adapter.deleteWebhook(webhookId); } catch { /* ignore */ }
    }
    const wh = await resolved.adapter.createWebhook({ url, eventTypes: WEBHOOK_EVENTS });
    webhookId = wh.id;

    const supabase = getSupabaseAdmin();
    const merged = {
      ...resolved.connector.rawAuthConfig,
      webhook_id: webhookId,
      webhook_url: url,
      webhook_registration_error: null,
    };
    await supabase
      .from('connectors')
      .update({ auth_config: merged, last_health_check_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', resolved.connector.id);
    invalidatePayPalForTenant(req.tenantId, req.workspaceId ?? null);

    return res.json({ ok: true, webhook_id: webhookId, webhook_url: url });
  } catch (err: any) {
    return res.status(502).json({ error: String(err?.message ?? err) });
  }
});
