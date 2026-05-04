/**
 * server/routes/whatsappIntegration.ts
 *
 * Direct Meta WhatsApp Cloud API integration — independent from Twilio's
 * WhatsApp path. The auth model is API-key based (System User token from
 * Meta Business Manager). Embedded Signup with Facebook Login is the
 * recommended UX for production but adds significant Meta App setup; for
 * "advanced level day one" we ship manual paste + webhook auto-subscribe.
 *
 *   POST /api/integrations/whatsapp/connect          — paste creds + validate
 *   POST /api/integrations/whatsapp/disconnect       — flag disconnected
 *   GET  /api/integrations/whatsapp/status           — full status
 *   GET  /api/integrations/whatsapp/templates        — list approved templates
 *   POST /api/integrations/whatsapp/send-test        — test message via template
 *   POST /api/integrations/whatsapp/subscribe-webhook — bind app to WABA
 */

import { Router, Response } from 'express';
import { randomBytes, randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { WhatsAppAdapter } from '../integrations/whatsapp.js';
import {
  invalidateWhatsAppForTenant,
  whatsappForTenant,
} from '../integrations/whatsapp-tenant.js';

export const whatsappIntegrationRouter = Router();

function publicBase(): string {
  return (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
}

function webhookCallbackUrl(): string {
  const base = publicBase();
  return base ? `https://${base}/webhooks/whatsapp` : '';
}

// ── POST /connect ────────────────────────────────────────────────────────────

whatsappIntegrationRouter.post('/connect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });

  const phoneNumberId = String(req.body?.phone_number_id || '').trim();
  const accessToken = String(req.body?.access_token || '').trim();
  const wabaId = req.body?.waba_id ? String(req.body.waba_id).trim() : '';
  const appSecret = req.body?.app_secret ? String(req.body.app_secret).trim() : '';
  // If the merchant doesn't pass a verify token, we generate one for them.
  const verifyToken = req.body?.verify_token
    ? String(req.body.verify_token).trim()
    : randomBytes(20).toString('base64url');

  if (!phoneNumberId) return res.status(400).json({ error: 'phone_number_id required' });
  if (!accessToken) return res.status(400).json({ error: 'access_token required' });
  if (!appSecret) {
    return res.status(400).json({
      error: 'app_secret required (Meta App → Settings → Basic → App Secret)',
    });
  }

  // Validate by hitting Graph API GET /{phone-number-id}
  let phoneInfo;
  let templates: unknown[] = [];
  let allPhones: any[] = [];
  try {
    const adapter = new WhatsAppAdapter({
      accessToken,
      phoneNumberId,
      verifyToken,
      webhookSecret: appSecret,
    });
    phoneInfo = await adapter.getPhoneNumber();
    if (wabaId) {
      [templates, allPhones] = await Promise.all([
        adapter.listTemplates(wabaId, { limit: 50, status: 'APPROVED' }).catch(() => []),
        adapter.listPhoneNumbersForWaba(wabaId).catch(() => []),
      ]);
    }
  } catch (err: any) {
    return res.status(400).json({
      error: 'Meta rejected the credentials. Verify the Phone Number ID and Access Token in WhatsApp Manager.',
      metaMessage: String(err?.message ?? err).split(': ').slice(-1)[0],
    });
  }

  // Auto-subscribe the app to the WABA so events flow.
  let webhookSubscribed = false;
  if (wabaId) {
    try {
      const adapter = new WhatsAppAdapter({ accessToken, phoneNumberId, verifyToken, webhookSecret: appSecret });
      await adapter.subscribeAppToWaba(wabaId);
      webhookSubscribed = true;
    } catch (err) {
      logger.warn('WhatsApp subscribeAppToWaba failed (continuing)', { error: String(err) });
    }
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `whatsapp::${req.tenantId}::${phoneNumberId}`;

  const authConfig = {
    phone_number_id: phoneNumberId,
    access_token: accessToken,
    waba_id: wabaId || null,
    app_secret: appSecret,
    verify_token: verifyToken,
    display_phone_number: phoneInfo.display_phone_number,
    verified_name: phoneInfo.verified_name,
    quality_rating: phoneInfo.quality_rating ?? null,
    code_verification_status: phoneInfo.code_verification_status ?? null,
    webhook_callback_url: webhookCallbackUrl(),
    webhook_subscribed: webhookSubscribed,
    template_count: templates.length,
    granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: req.tenantId,
    system: 'whatsapp',
    name: phoneInfo.display_phone_number || phoneNumberId,
    status: 'connected',
    auth_type: 'api_key',
    auth_config: authConfig,
    capabilities: {
      sends: ['text', 'template', 'interactive_buttons', 'interactive_list', 'image', 'video', 'document', 'audio', 'reaction'],
      reads: ['templates', 'business_profile', 'phone_numbers'],
      realtime: webhookSubscribed ? 'webhook' : 'unsubscribed',
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });

  if (error) {
    logger.error('WhatsApp connect: upsert failed', { error: error.message });
    return res.status(500).json({ error: 'Could not persist WhatsApp connector' });
  }

  invalidateWhatsAppForTenant(req.tenantId, req.workspaceId ?? null);

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: req.tenantId,
    workspace_id: req.workspaceId ?? req.tenantId,
    actor_id: req.userId,
    actor_type: 'user',
    action: 'INTEGRATION_CONNECTED',
    entity_type: 'connector',
    entity_id: connectorId,
    metadata: {
      system: 'whatsapp',
      phone_number_id: phoneNumberId,
      display_phone_number: phoneInfo.display_phone_number,
      waba_id: wabaId || null,
      webhook_subscribed: webhookSubscribed,
    },
    occurred_at: now,
  }).then(() => {}, () => {});

  return res.json({
    ok: true,
    phone_number: phoneInfo,
    waba_id: wabaId || null,
    available_phones: allPhones,
    template_count: templates.length,
    verify_token: verifyToken,
    webhook_callback_url: webhookCallbackUrl(),
    webhook_subscribed: webhookSubscribed,
  });
});

// ── POST /disconnect ─────────────────────────────────────────────────────────

whatsappIntegrationRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();

  // Best-effort: unsubscribe the app from the WABA so we stop getting events.
  const resolved = await whatsappForTenant(req.tenantId, req.workspaceId ?? null);
  if (resolved?.connector.wabaId) {
    try {
      await resolved.adapter.unsubscribeAppFromWaba(resolved.connector.wabaId);
    } catch (err) {
      logger.warn('WhatsApp unsubscribe failed', { error: String(err) });
    }
  }

  const { error } = await supabase
    .from('connectors')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('tenant_id', req.tenantId)
    .eq('system', 'whatsapp');
  if (error) return res.status(500).json({ error: error.message });
  invalidateWhatsAppForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

// ── GET /status ──────────────────────────────────────────────────────────────

whatsappIntegrationRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'whatsapp')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    phone_number_id: cfg.phone_number_id ?? null,
    display_phone_number: cfg.display_phone_number ?? null,
    verified_name: cfg.verified_name ?? null,
    quality_rating: cfg.quality_rating ?? null,
    waba_id: cfg.waba_id ?? null,
    verify_token: cfg.verify_token ?? null,
    webhook_callback_url: cfg.webhook_callback_url ?? webhookCallbackUrl(),
    webhook_subscribed: cfg.webhook_subscribed === true,
    template_count: cfg.template_count ?? 0,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});

// ── GET /templates ───────────────────────────────────────────────────────────

whatsappIntegrationRouter.get('/templates', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await whatsappForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'WhatsApp not connected' });
  if (!resolved.connector.wabaId) return res.status(400).json({ error: 'waba_id missing — re-connect with WABA id' });
  try {
    const status = req.query.status as 'APPROVED' | 'PENDING' | 'REJECTED' | 'DISABLED' | undefined;
    const templates = await resolved.adapter.listTemplates(resolved.connector.wabaId, { limit: 100, status });
    return res.json({ templates });
  } catch (err: any) {
    return res.status(502).json({ error: String(err?.message ?? err) });
  }
});

// ── POST /send-test ──────────────────────────────────────────────────────────
// body: { to: string, mode?: 'template' | 'text', template_name?: string, template_language?: string, body_parameters?: string[] }

whatsappIntegrationRouter.post('/send-test', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await whatsappForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'WhatsApp not connected' });

  const to = String(req.body?.to || '').trim().replace(/^whatsapp:/i, '').replace(/\s+/g, '');
  if (!to) return res.status(400).json({ error: 'to required' });

  const mode = req.body?.mode === 'text' ? 'text' : 'template';
  try {
    if (mode === 'text') {
      const result = await resolved.adapter.sendTextMessage(to, String(req.body?.body || 'Test desde Clain ✅'));
      return res.json({ ok: true, message_id: result.messageId, mode: 'text' });
    }
    // Template (the only outbound allowed outside the 24h window).
    const templateName = String(req.body?.template_name || 'hello_world');
    const templateLang = String(req.body?.template_language || 'en_US');
    const bodyParameters = Array.isArray(req.body?.body_parameters)
      ? (req.body.body_parameters as unknown[]).map(String)
      : undefined;
    const result = await resolved.adapter.sendTemplate(to, {
      name: templateName,
      language: templateLang,
      bodyParameters,
    });
    return res.json({ ok: true, message_id: result.messageId, mode: 'template', template: templateName });
  } catch (err: any) {
    return res.status(502).json({
      error: 'Meta rejected the test message',
      details: String(err?.message ?? err),
    });
  }
});

// ── POST /subscribe-webhook (manual re-subscribe) ────────────────────────────

whatsappIntegrationRouter.post('/subscribe-webhook', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await whatsappForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'WhatsApp not connected' });
  if (!resolved.connector.wabaId) return res.status(400).json({ error: 'waba_id missing — re-connect with WABA id' });
  try {
    await resolved.adapter.subscribeAppToWaba(resolved.connector.wabaId);
    const supabase = getSupabaseAdmin();
    const cfg = resolved.connector.rawAuthConfig;
    await supabase
      .from('connectors')
      .update({
        auth_config: { ...cfg, webhook_subscribed: true },
        last_health_check_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', resolved.connector.id);
    invalidateWhatsAppForTenant(req.tenantId, req.workspaceId ?? null);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(502).json({ error: String(err?.message ?? err) });
  }
});
