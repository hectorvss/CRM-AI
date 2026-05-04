/**
 * server/routes/instagramIntegration.ts — Instagram messaging connect.
 * Same shape as Messenger but on `system='instagram'` with the IG account
 * id as the primary identifier.
 */

import { Router, Response } from 'express';
import { randomBytes, randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { InstagramAdapter } from '../integrations/instagram.js';
import {
  invalidateInstagramForTenant,
  instagramForTenant,
} from '../integrations/instagram-tenant.js';

export const instagramIntegrationRouter = Router();

function publicBase(): string {
  return (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
}
function webhookCallbackUrl(): string {
  const base = publicBase();
  return base ? `https://${base}/webhooks/instagram` : '';
}

instagramIntegrationRouter.post('/connect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });

  const igUserId = String(req.body?.ig_user_id || '').trim();
  const pageId = String(req.body?.page_id || '').trim();
  const pageAccessToken = String(req.body?.page_access_token || '').trim();
  const appSecret = String(req.body?.app_secret || '').trim();
  const verifyToken = String(req.body?.verify_token || '').trim() || randomBytes(20).toString('base64url');

  if (!igUserId) return res.status(400).json({ error: 'ig_user_id (Instagram Business Account ID) required' });
  if (!pageId) return res.status(400).json({ error: 'page_id (the linked Facebook Page) required' });
  if (!pageAccessToken) return res.status(400).json({ error: 'page_access_token required' });
  if (!appSecret) return res.status(400).json({ error: 'app_secret required' });

  let account;
  try {
    const adapter = new InstagramAdapter({ igUserId, pageId, pageAccessToken, appSecret, verifyToken });
    account = await adapter.getAccount();
  } catch (err: any) {
    return res.status(400).json({
      error: 'Meta rejected the credentials. Check the IG User ID, Page ID and Page Access Token.',
      metaMessage: String(err?.message ?? err).split(': ').slice(-1)[0],
    });
  }

  // Subscribe app to the page (IG events flow through the linked Page).
  let subscribed = false;
  let subscribeError: string | null = null;
  try {
    const adapter = new InstagramAdapter({ igUserId, pageId, pageAccessToken, appSecret, verifyToken });
    await adapter.subscribeAppToPage();
    subscribed = true;
  } catch (err: any) {
    subscribeError = String(err?.message ?? err);
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `instagram::${req.tenantId}::${igUserId}`;

  const authConfig = {
    ig_user_id: igUserId,
    page_id: pageId,
    username: account.username,
    name: account.name ?? null,
    profile_picture_url: account.profile_picture_url ?? null,
    followers_count: account.followers_count ?? null,
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
    system: 'instagram',
    name: account.username,
    status: 'connected',
    auth_type: 'api_key',
    auth_config: authConfig,
    capabilities: {
      sends: ['text', 'quick_replies', 'media', 'private_reply_to_comment', 'story_reply', 'sender_actions'],
      reads: ['account_info', 'conversations', 'user_profile'],
      realtime: subscribed ? 'webhook' : 'unsubscribed',
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });
  if (error) return res.status(500).json({ error: error.message });

  invalidateInstagramForTenant(req.tenantId, req.workspaceId ?? null);

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: req.tenantId,
    workspace_id: req.workspaceId ?? req.tenantId,
    actor_id: req.userId,
    actor_type: 'user',
    action: 'INTEGRATION_CONNECTED',
    entity_type: 'connector',
    entity_id: connectorId,
    metadata: { system: 'instagram', ig_user_id: igUserId, page_id: pageId, username: account.username, subscribed },
    occurred_at: now,
  }).then(() => {}, () => {});

  return res.json({
    ok: true,
    account,
    verify_token: verifyToken,
    webhook_callback_url: webhookCallbackUrl(),
    subscribed,
    subscribe_error: subscribeError,
  });
});

instagramIntegrationRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await instagramForTenant(req.tenantId, req.workspaceId ?? null);
  if (resolved) {
    try { await resolved.adapter.unsubscribeAppFromPage(); } catch (err) { logger.warn('instagram unsubscribe failed', { error: String(err) }); }
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('connectors').update({ status: 'disconnected', updated_at: new Date().toISOString() }).eq('tenant_id', req.tenantId).eq('system', 'instagram');
  if (error) return res.status(500).json({ error: error.message });
  invalidateInstagramForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

instagramIntegrationRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'instagram')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    ig_user_id: cfg.ig_user_id ?? null,
    page_id: cfg.page_id ?? null,
    username: cfg.username ?? null,
    name: cfg.name ?? null,
    profile_picture_url: cfg.profile_picture_url ?? null,
    followers_count: cfg.followers_count ?? null,
    verify_token: cfg.verify_token ?? null,
    webhook_callback_url: cfg.webhook_callback_url ?? webhookCallbackUrl(),
    webhook_subscribed: cfg.webhook_subscribed === true,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});

instagramIntegrationRouter.post('/send-test', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await instagramForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Instagram not connected' });
  const recipientId = String(req.body?.recipient_id || '').trim();
  if (!recipientId) return res.status(400).json({ error: 'recipient_id (IG-Scoped User ID) required' });
  try {
    const result = await resolved.adapter.sendText({ recipientId, text: String(req.body?.text || 'Test desde Clain ✅') });
    return res.json({ ok: true, message_id: result.messageId });
  } catch (err: any) {
    return res.status(502).json({ error: 'Meta rejected the test message', details: String(err?.message ?? err) });
  }
});
