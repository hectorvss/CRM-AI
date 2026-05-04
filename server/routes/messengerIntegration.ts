/**
 * server/routes/messengerIntegration.ts — Facebook Messenger connect.
 *   POST /api/integrations/messenger/connect    — paste page creds, validate, subscribe
 *   POST /api/integrations/messenger/disconnect — unsubscribe + flag
 *   GET  /api/integrations/messenger/status     — full status
 *   POST /api/integrations/messenger/send-test  — send test text to a PSID
 */

import { Router, Response } from 'express';
import { randomBytes, randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { MessengerAdapter } from '../integrations/messenger.js';
import {
  invalidateMessengerForTenant,
  loadMessengerConnector,
  messengerForTenant,
} from '../integrations/messenger-tenant.js';

export const messengerIntegrationRouter = Router();

function publicBase(): string {
  return (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
}
function webhookCallbackUrl(): string {
  const base = publicBase();
  return base ? `https://${base}/webhooks/messenger` : '';
}

messengerIntegrationRouter.post('/connect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });

  const pageId = String(req.body?.page_id || '').trim();
  const pageAccessToken = String(req.body?.page_access_token || '').trim();
  const appSecret = String(req.body?.app_secret || '').trim();
  const verifyToken = String(req.body?.verify_token || '').trim() || randomBytes(20).toString('base64url');

  if (!pageId) return res.status(400).json({ error: 'page_id required' });
  if (!pageAccessToken) return res.status(400).json({ error: 'page_access_token required' });
  if (!appSecret) return res.status(400).json({ error: 'app_secret required' });

  let pageInfo;
  try {
    const adapter = new MessengerAdapter({ pageId, pageAccessToken, appSecret, verifyToken });
    pageInfo = await adapter.getPage();
  } catch (err: any) {
    return res.status(400).json({
      error: 'Meta rejected the credentials. Verify the Page ID and Page Access Token.',
      metaMessage: String(err?.message ?? err).split(': ').slice(-1)[0],
    });
  }

  // Auto-subscribe app to page so events flow.
  let subscribed = false;
  let subscribeError: string | null = null;
  try {
    const adapter = new MessengerAdapter({ pageId, pageAccessToken, appSecret, verifyToken });
    await adapter.subscribeAppToPage();
    subscribed = true;
  } catch (err: any) {
    subscribeError = String(err?.message ?? err);
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `messenger::${req.tenantId}::${pageId}`;

  const authConfig = {
    page_id: pageId,
    page_name: pageInfo.name,
    page_category: pageInfo.category,
    page_access_token: pageAccessToken,
    app_secret: appSecret,
    verify_token: verifyToken,
    webhook_callback_url: webhookCallbackUrl(),
    webhook_subscribed: subscribed,
    webhook_subscribe_error: subscribeError,
    granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: req.tenantId,
    system: 'messenger',
    name: pageInfo.name,
    status: 'connected',
    auth_type: 'api_key',
    auth_config: authConfig,
    capabilities: {
      sends: ['text', 'quick_replies', 'button_template', 'media', 'sender_actions'],
      reads: ['page_info', 'user_profile'],
      realtime: subscribed ? 'webhook' : 'unsubscribed',
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });
  if (error) return res.status(500).json({ error: error.message });

  invalidateMessengerForTenant(req.tenantId, req.workspaceId ?? null);

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: req.tenantId,
    workspace_id: req.workspaceId ?? req.tenantId,
    actor_id: req.userId,
    actor_type: 'user',
    action: 'INTEGRATION_CONNECTED',
    entity_type: 'connector',
    entity_id: connectorId,
    metadata: { system: 'messenger', page_id: pageId, page_name: pageInfo.name, subscribed },
    occurred_at: now,
  }).then(() => {}, () => {});

  return res.json({
    ok: true,
    page: pageInfo,
    verify_token: verifyToken,
    webhook_callback_url: webhookCallbackUrl(),
    subscribed,
    subscribe_error: subscribeError,
  });
});

messengerIntegrationRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await messengerForTenant(req.tenantId, req.workspaceId ?? null);
  if (resolved) {
    try { await resolved.adapter.unsubscribeAppFromPage(); } catch (err) { logger.warn('messenger unsubscribe failed', { error: String(err) }); }
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('connectors').update({ status: 'disconnected', updated_at: new Date().toISOString() }).eq('tenant_id', req.tenantId).eq('system', 'messenger');
  if (error) return res.status(500).json({ error: error.message });
  invalidateMessengerForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

messengerIntegrationRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'messenger')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    page_id: cfg.page_id ?? null,
    page_name: cfg.page_name ?? data.name,
    page_category: cfg.page_category ?? null,
    verify_token: cfg.verify_token ?? null,
    webhook_callback_url: cfg.webhook_callback_url ?? webhookCallbackUrl(),
    webhook_subscribed: cfg.webhook_subscribed === true,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});

messengerIntegrationRouter.post('/send-test', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await messengerForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Messenger not connected' });
  const recipientId = String(req.body?.recipient_id || '').trim();
  if (!recipientId) return res.status(400).json({ error: 'recipient_id (PSID) required' });
  try {
    const result = await resolved.adapter.sendText({
      recipientId,
      text: String(req.body?.text || 'Test desde Clain ✅'),
      messagingType: 'RESPONSE',
    });
    return res.json({ ok: true, message_id: result.messageId });
  } catch (err: any) {
    return res.status(502).json({ error: 'Meta rejected the test message', details: String(err?.message ?? err) });
  }
});
