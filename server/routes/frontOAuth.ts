/**
 * server/routes/frontOAuth.ts
 *
 *   GET  /api/integrations/front/install
 *   GET  /api/integrations/front/callback
 *   POST /api/integrations/front/disconnect
 *   GET  /api/integrations/front/status
 *   POST /api/integrations/front/sync          — list 5 most recent open conversations
 *   GET  /api/integrations/front/inboxes
 *   POST /api/integrations/front/reply         — send reply on a conversation (used by AI)
 *   POST /api/integrations/front/comment       — internal note
 *   POST /api/integrations/front/register-webhook
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
  type FrontOAuthEnv,
} from '../integrations/front-oauth.js';
import {
  frontForTenant,
  invalidateFrontForTenant,
} from '../integrations/front-tenant.js';
import { FrontAdapter } from '../integrations/front.js';

export const frontOAuthRouter = Router();

function readEnv(): FrontOAuthEnv | { error: string } {
  const clientId = process.env.FRONT_CLIENT_ID;
  const clientSecret = process.env.FRONT_CLIENT_SECRET;
  const stateSecret = process.env.FRONT_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret) return { error: 'Front OAuth not configured: set FRONT_CLIENT_ID and FRONT_CLIENT_SECRET' };
  if (!publicBase) return { error: 'PUBLIC_BASE_URL must be set' };
  if (!stateSecret) return { error: 'FRONT_STATE_SECRET must be set' };
  return { clientId, clientSecret, stateSecret, redirectUri: `https://${publicBase}/api/integrations/front/callback` };
}

function publicBaseUrl(): string {
  const base = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  return base ? `https://${base}` : '';
}

frontOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).json({ error: env.error });
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });
  const state = signState({ t: req.tenantId, w: req.workspaceId ?? '', u: req.userId }, env);
  const url = buildInstallUrl({ state, env });
  if (req.headers.accept?.includes('application/json')) return res.json({ url, state });
  return res.redirect(url);
});

frontOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).send(env.error);
  const oauthError = typeof req.query.error === 'string' ? req.query.error : null;
  if (oauthError) return res.redirect(`/app/integrations?error=front&reason=${encodeURIComponent(oauthError)}`);
  const stateRaw = String(req.query.state || '');
  let state;
  try { state = verifyState(stateRaw, env); }
  catch (err) {
    logger.warn('Front callback: state invalid', { error: String(err) });
    return res.status(401).send('Invalid state');
  }
  const code = String(req.query.code || '');
  if (!code) return res.status(400).send('Missing code');

  let grant;
  try { grant = await exchangeCodeForToken({ code, env }); }
  catch (err) {
    logger.warn('Front token exchange failed', { error: String(err) });
    return res.redirect(`/app/integrations?error=front&reason=token_exchange`);
  }

  const adapter = new FrontAdapter(grant.accessToken);
  let me: any = null;
  try { me = await adapter.me(); }
  catch (err) { logger.warn('Front me fetch failed', { error: String(err) }); }

  // Auto-register webhook
  const callback = `${publicBaseUrl()}/webhooks/front`;
  let webhookId: string | null = null;
  let webhookError: string | null = null;
  if (publicBaseUrl()) {
    try {
      const wh = await adapter.createWebhook({ url: callback });
      webhookId = wh.id;
    } catch (err: any) {
      webhookError = String(err?.message ?? err);
      logger.warn('Front webhook auto-register failed', { error: webhookError });
    }
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const identityId = me?.id ?? 'unknown';
  const connectorId = `front::${state.t}::${identityId}`;

  const authConfig: Record<string, unknown> = {
    access_token: grant.accessToken,
    refresh_token: grant.refreshToken,
    token_type: grant.tokenType,
    scope: grant.scope,
    access_token_expires_at: new Date(Date.now() + grant.expiresIn * 1000).toISOString(),
    identity_id: identityId,
    email: me?.email ?? null,
    username: me?.username ?? null,
    first_name: me?.first_name ?? null,
    last_name: me?.last_name ?? null,
    webhook_id: webhookId,
    webhook_url: webhookId ? callback : null,
    webhook_error: webhookError,
    granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: state.t,
    system: 'front',
    name: me?.email || identityId,
    status: 'connected',
    auth_type: 'oauth_authorization_code',
    auth_config: authConfig,
    capabilities: {
      reads: ['me', 'inboxes', 'channels', 'conversations', 'messages'],
      writes: ['send_reply', 'send_message', 'add_comment', 'update_status', 'assign', 'tag'],
      events: ['conversation.created', 'message.received', 'message.outbound', 'conversation.assigned', 'conversation.tagged', 'conversation.archived', 'conversation.untagged'],
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });

  if (error) {
    logger.error('Front upsert failed', { error: error.message });
    return res.redirect(`/app/integrations?error=front&reason=persist`);
  }

  invalidateFrontForTenant(state.t, state.w || null);

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: state.t,
    workspace_id: state.w || state.t,
    actor_id: state.u,
    actor_type: 'user',
    action: 'INTEGRATION_CONNECTED',
    entity_type: 'connector',
    entity_id: connectorId,
    metadata: { system: 'front', identity_id: identityId, email: me?.email ?? null, webhook_id: webhookId },
    occurred_at: now,
  }).then(() => {}, () => {});

  return res.redirect('/app/integrations?connected=front');
});

frontOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await frontForTenant(req.tenantId, req.workspaceId ?? null);
  if (resolved?.connector.webhookId) {
    try { await resolved.adapter.deleteWebhook(resolved.connector.webhookId); }
    catch (err) { logger.warn('Front webhook delete failed', { error: String(err) }); }
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('connectors')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('tenant_id', req.tenantId)
    .eq('system', 'front');
  if (error) return res.status(500).json({ error: error.message });
  invalidateFrontForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

frontOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'front')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    identity_id: cfg.identity_id ?? null,
    email: cfg.email ?? null,
    username: cfg.username ?? null,
    scope: cfg.scope ?? null,
    webhook_id: cfg.webhook_id ?? null,
    webhook_url: cfg.webhook_url ?? null,
    webhook_registered: Boolean(cfg.webhook_id),
    webhook_error: cfg.webhook_error ?? null,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});

frontOAuthRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await frontForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Front not connected' });
  try {
    const conversations = await resolved.adapter.listConversations({ limit: 5, q: 'is:open' });
    return res.json({
      ok: true,
      conversations_visible: conversations.length,
      sample: conversations.slice(0, 5).map(c => ({
        id: c.id, subject: c.subject, status: c.status,
        recipient: c.recipient?.handle ?? null, assignee: c.assignee?.email ?? null,
      })),
    });
  } catch (err: any) {
    return res.status(502).json({ error: 'Front API call failed', details: String(err?.message ?? err) });
  }
});

frontOAuthRouter.get('/inboxes', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await frontForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Front not connected' });
  try {
    const inboxes = await resolved.adapter.listInboxes(100);
    return res.json({ ok: true, inboxes });
  } catch (err: any) {
    return res.status(502).json({ error: 'Front inboxes failed', details: String(err?.message ?? err) });
  }
});

frontOAuthRouter.post('/reply', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await frontForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Front not connected' });
  const conversationId = String(req.body?.conversation_id || '').trim();
  const body = String(req.body?.body || '').trim();
  if (!conversationId || !body) return res.status(400).json({ error: 'conversation_id and body are required' });
  try {
    const r = await resolved.adapter.sendReply(conversationId, {
      body,
      type: req.body?.type ?? 'reply',
      channelId: req.body?.channel_id,
      sender_name: req.body?.sender_name,
    });
    return res.json({ ok: true, message_uid: r.message_uid });
  } catch (err: any) {
    return res.status(502).json({ error: 'Front sendReply failed', details: String(err?.message ?? err) });
  }
});

frontOAuthRouter.post('/comment', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await frontForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Front not connected' });
  const conversationId = String(req.body?.conversation_id || '').trim();
  const body = String(req.body?.body || '').trim();
  if (!conversationId || !body) return res.status(400).json({ error: 'conversation_id and body are required' });
  try {
    const r = await resolved.adapter.addComment(conversationId, body);
    return res.json({ ok: true, comment_id: r.id });
  } catch (err: any) {
    return res.status(502).json({ error: 'Front addComment failed', details: String(err?.message ?? err) });
  }
});

frontOAuthRouter.post('/register-webhook', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await frontForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Front not connected' });
  const base = publicBaseUrl();
  if (!base) return res.status(503).json({ error: 'PUBLIC_BASE_URL not configured' });

  try {
    if (resolved.connector.webhookId) {
      try { await resolved.adapter.deleteWebhook(resolved.connector.webhookId); } catch { /* ignore */ }
    }
    const callback = `${base}/webhooks/front`;
    const wh = await resolved.adapter.createWebhook({ url: callback });

    const supabase = getSupabaseAdmin();
    const merged = {
      ...resolved.connector.rawAuthConfig,
      webhook_id: wh.id,
      webhook_url: callback,
      webhook_error: null,
    };
    await supabase
      .from('connectors')
      .update({ auth_config: merged, last_health_check_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', resolved.connector.id);
    invalidateFrontForTenant(req.tenantId, req.workspaceId ?? null);

    return res.json({ ok: true, webhook_id: wh.id, webhook_url: callback });
  } catch (err: any) {
    return res.status(502).json({ error: String(err?.message ?? err) });
  }
});
