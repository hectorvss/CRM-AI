/**
 * server/routes/twilioIntegration.ts
 *
 * Twilio is API-key based — no OAuth flow. The merchant pastes their
 * Account SID + Auth Token (or API Key + Secret) and we validate by
 * hitting /v1/Accounts/{SID}.json. After that:
 *
 *   - GET  /api/integrations/twilio/status            — connector status + balance
 *   - POST /api/integrations/twilio/connect           — paste creds, validate, persist
 *   - POST /api/integrations/twilio/disconnect        — flag disconnected
 *   - GET  /api/integrations/twilio/phone-numbers     — list owned numbers (picker UI)
 *   - POST /api/integrations/twilio/configure-webhooks — auto-set SmsUrl on selected
 *                                                        numbers so the merchant
 *                                                        doesn't have to do it
 *   - POST /api/integrations/twilio/send-test         — send a test SMS / WhatsApp
 *
 * After connect, the merchant typically picks one or more numbers in the
 * UI and we save them to `auth_config.default_sms_from` /
 * `default_whatsapp_from` + `phone_numbers[]`. The webhook handler uses
 * those for tenant lookup.
 */

import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { TwilioAdapter } from '../integrations/twilio.js';
import {
  invalidateTwilioForTenant,
  loadTwilioConnector,
  twilioForTenant,
} from '../integrations/twilio-tenant.js';

export const twilioIntegrationRouter = Router();

function publicBase(): string {
  return (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
}

function smsWebhookUrl(): string {
  const base = publicBase();
  return base ? `https://${base}/webhooks/sms` : '';
}

function statusCallbackUrl(): string {
  const base = publicBase();
  return base ? `https://${base}/webhooks/sms/status` : '';
}

// ── POST /connect ────────────────────────────────────────────────────────────

twilioIntegrationRouter.post('/connect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });

  const accountSid = String(req.body?.account_sid || '').trim();
  const authToken = String(req.body?.auth_token || '').trim();
  const apiKeySid = req.body?.api_key_sid ? String(req.body.api_key_sid).trim() : null;
  const apiKeySecret = req.body?.api_key_secret ? String(req.body.api_key_secret).trim() : null;

  if (!accountSid.startsWith('AC')) {
    return res.status(400).json({ error: 'account_sid must start with "AC"' });
  }
  if (!authToken && !(apiKeySid && apiKeySecret)) {
    return res.status(400).json({ error: 'Provide either auth_token, or api_key_sid + api_key_secret' });
  }
  if (apiKeySid && !apiKeySid.startsWith('SK')) {
    return res.status(400).json({ error: 'api_key_sid must start with "SK"' });
  }

  // Validate by calling Twilio's Account endpoint with the provided creds.
  let account;
  try {
    const adapter = new TwilioAdapter({
      accountSid,
      authToken: authToken || undefined,
      apiKeySid: apiKeySid ?? undefined,
      apiKeySecret: apiKeySecret ?? undefined,
    });
    account = await adapter.getAccount();
  } catch (err: any) {
    return res.status(400).json({
      error: 'Twilio rejected the credentials. Double-check the Account SID and Auth Token (or API Key).',
      twilioMessage: String(err?.message ?? err).split(': ').slice(-1)[0],
    });
  }

  // Best-effort: pull balance and the list of owned numbers so the modal
  // can show them straight after connect.
  let balance = null;
  let phoneNumbers: Array<{ phone_number: string; sid: string; capabilities?: any; sms_url?: string | null }> = [];
  try {
    const adapter = new TwilioAdapter({
      accountSid,
      authToken: authToken || undefined,
      apiKeySid: apiKeySid ?? undefined,
      apiKeySecret: apiKeySecret ?? undefined,
    });
    [balance, phoneNumbers] = await Promise.all([
      adapter.getBalance().catch(() => null),
      adapter.listIncomingPhoneNumbers({ pageSize: 50 }).catch(() => []),
    ]);
  } catch { /* non-fatal */ }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `twilio::${req.tenantId}::${accountSid}`;

  const authConfig = {
    account_sid: accountSid,
    auth_token: authToken,
    api_key_sid: apiKeySid,
    api_key_secret: apiKeySecret,
    account_name: account.friendly_name,
    account_status: account.status,
    balance: balance,
    phone_numbers: phoneNumbers.map((p) => ({
      sid: p.sid,
      phone_number: p.phone_number,
      capabilities: p.capabilities,
    })),
    granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: req.tenantId,
    system: 'twilio',
    name: account.friendly_name || accountSid,
    status: 'connected',
    auth_type: apiKeySid ? 'api_key_pair' : 'api_key',
    auth_config: authConfig,
    capabilities: {
      sends: ['sms', 'whatsapp', 'media'],
      reads: ['messages', 'phone_numbers', 'balance'],
      webhook_signature: 'hmac-sha1',
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });

  if (error) {
    logger.error('Twilio connect: upsert failed', { error: error.message });
    return res.status(500).json({ error: 'Could not persist Twilio connector' });
  }

  invalidateTwilioForTenant(req.tenantId, req.workspaceId ?? null);

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: req.tenantId,
    workspace_id: req.workspaceId ?? req.tenantId,
    actor_id: req.userId,
    actor_type: 'user',
    action: 'INTEGRATION_CONNECTED',
    entity_type: 'connector',
    entity_id: connectorId,
    metadata: { system: 'twilio', account_sid: accountSid, account_name: account.friendly_name },
    occurred_at: now,
  }).then(() => {}, () => {});

  return res.json({
    ok: true,
    account: {
      sid: account.sid,
      friendly_name: account.friendly_name,
      status: account.status,
    },
    phone_numbers: phoneNumbers,
    balance,
  });
});

// ── POST /disconnect ─────────────────────────────────────────────────────────

twilioIntegrationRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('connectors')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('tenant_id', req.tenantId)
    .eq('system', 'twilio');
  if (error) return res.status(500).json({ error: error.message });
  invalidateTwilioForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

// ── GET /status ──────────────────────────────────────────────────────────────

twilioIntegrationRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'twilio')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    account_sid: cfg.account_sid ?? null,
    account_name: cfg.account_name ?? data.name,
    account_status: cfg.account_status ?? null,
    balance: cfg.balance ?? null,
    phone_numbers: cfg.phone_numbers ?? [],
    default_sms_from: cfg.default_sms_from ?? null,
    default_whatsapp_from: cfg.default_whatsapp_from ?? null,
    auth_type: data.auth_config && (data.auth_config as any).api_key_sid ? 'api_key_pair' : 'api_key',
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});

// ── GET /phone-numbers ───────────────────────────────────────────────────────

twilioIntegrationRouter.get('/phone-numbers', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await twilioForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Twilio not connected' });
  try {
    const numbers = await resolved.adapter.listIncomingPhoneNumbers({ pageSize: 100 });
    return res.json({ phone_numbers: numbers });
  } catch (err: any) {
    return res.status(502).json({ error: String(err?.message ?? err) });
  }
});

// ── POST /configure-webhooks ─────────────────────────────────────────────────
// body: { phone_number_sids: string[], default_sms_from?: string, default_whatsapp_from?: string }

twilioIntegrationRouter.post('/configure-webhooks', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await twilioForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Twilio not connected' });

  const sids: string[] = Array.isArray(req.body?.phone_number_sids) ? req.body.phone_number_sids : [];
  if (!sids.length) return res.status(400).json({ error: 'phone_number_sids required' });

  const smsUrl = smsWebhookUrl();
  if (!smsUrl) return res.status(503).json({ error: 'PUBLIC_BASE_URL not configured' });

  const results: Array<{ sid: string; ok: boolean; error?: string }> = [];
  const updatedNumbers: Array<{ sid: string; phone_number: string }> = [];
  for (const sid of sids) {
    try {
      const updated = await resolved.adapter.configurePhoneNumberWebhooks({
        phoneNumberSid: sid,
        smsUrl,
        smsMethod: 'POST',
        statusCallback: statusCallbackUrl(),
      });
      results.push({ sid, ok: true });
      updatedNumbers.push({ sid: updated.sid, phone_number: updated.phone_number });
    } catch (err: any) {
      results.push({ sid, ok: false, error: String(err?.message ?? err) });
    }
  }

  // Persist user's chosen "default from" + the configured numbers so the
  // webhook handler can resolve tenant by phone number.
  const supabase = getSupabaseAdmin();
  const cfg = resolved.connector.rawAuthConfig;
  const merged = {
    ...cfg,
    default_sms_from: req.body?.default_sms_from ?? cfg.default_sms_from ?? updatedNumbers[0]?.phone_number ?? null,
    default_whatsapp_from: req.body?.default_whatsapp_from ?? cfg.default_whatsapp_from ?? null,
    configured_phone_numbers: updatedNumbers.map((n) => n.phone_number),
  };
  await supabase
    .from('connectors')
    .update({ auth_config: merged, updated_at: new Date().toISOString() })
    .eq('id', resolved.connector.id);

  invalidateTwilioForTenant(req.tenantId, req.workspaceId ?? null);

  return res.json({ ok: true, results, updated_numbers: updatedNumbers });
});

// ── POST /send-test ──────────────────────────────────────────────────────────
// body: { to: string, channel?: 'sms' | 'whatsapp', body?: string }

twilioIntegrationRouter.post('/send-test', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await twilioForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Twilio not connected' });

  const channel = req.body?.channel === 'whatsapp' ? 'whatsapp' : 'sms';
  const to = String(req.body?.to || '').trim();
  if (!to) return res.status(400).json({ error: 'to required' });

  const from = channel === 'whatsapp'
    ? resolved.connector.defaultWhatsappFrom
    : resolved.connector.defaultSmsFrom;
  if (!from) {
    return res.status(400).json({ error: `No default ${channel} sender configured. Pick one in the modal first.` });
  }

  const formattedTo = channel === 'whatsapp' && !to.startsWith('whatsapp:') ? `whatsapp:${to}` : to;
  const formattedFrom = channel === 'whatsapp' && !from.startsWith('whatsapp:') ? `whatsapp:${from}` : from;

  try {
    const message = await resolved.adapter.sendMessage({
      to: formattedTo,
      from: formattedFrom,
      body: String(req.body?.body || `Hola desde Clain — test ${channel.toUpperCase()}`),
      idempotencyKey: `test::${req.userId}::${Date.now()}`,
    });
    return res.json({ ok: true, sid: message.sid, status: message.status });
  } catch (err: any) {
    return res.status(502).json({
      error: 'Twilio rejected the test message',
      details: String(err?.message ?? err),
    });
  }
});
