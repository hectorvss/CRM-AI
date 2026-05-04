/**
 * server/routes/slackOAuth.ts
 *
 *   GET  /api/integrations/slack/install   — redirect to Slack consent
 *   GET  /api/integrations/slack/callback  — exchange code, persist
 *   POST /api/integrations/slack/disconnect
 *   GET  /api/integrations/slack/status
 *   POST /api/integrations/slack/post-test  — post a test message
 *   GET  /api/integrations/slack/channels   — list channels for picker UI
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
  revokeToken,
  SLACK_BOT_SCOPES,
  type SlackOAuthEnv,
} from '../integrations/slack-oauth.js';
import {
  slackForTenant,
  invalidateSlackForTenant,
} from '../integrations/slack-tenant.js';

export const slackOAuthRouter = Router();

function readEnv(): SlackOAuthEnv | { error: string } {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const signingSecret = process.env.SLACK_SIGNING_SECRET || '';
  const stateSecret = process.env.SLACK_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret) return { error: 'Slack OAuth not configured: set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET' };
  if (!publicBase) return { error: 'PUBLIC_BASE_URL must be set' };
  if (!stateSecret) return { error: 'SLACK_STATE_SECRET must be set' };
  return {
    clientId,
    clientSecret,
    stateSecret,
    signingSecret,
    redirectUri: `https://${publicBase}/api/integrations/slack/callback`,
  };
}

slackOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).json({ error: env.error });
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });

  const team = typeof req.query.team === 'string' ? req.query.team : undefined;
  const state = signState({ t: req.tenantId, w: req.workspaceId ?? '', u: req.userId }, env);
  const url = buildInstallUrl({ state, env, team });

  if (req.headers.accept?.includes('application/json')) {
    return res.json({ url, state });
  }
  return res.redirect(url);
});

slackOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).send(env.error);

  const oauthError = typeof req.query.error === 'string' ? req.query.error : null;
  if (oauthError) {
    return res.redirect(`/app/integrations?error=slack&reason=${encodeURIComponent(oauthError)}`);
  }

  const stateRaw = String(req.query.state || '');
  let state;
  try {
    state = verifyState(stateRaw, env);
  } catch (err) {
    logger.warn('Slack callback: state invalid', { error: String(err) });
    return res.status(401).send('Invalid state');
  }

  const code = String(req.query.code || '');
  if (!code) return res.status(400).send('Missing code');

  let grant;
  try {
    grant = await exchangeCodeForToken({ code, env });
  } catch (err) {
    logger.warn('Slack token exchange failed', { error: String(err) });
    return res.redirect(`/app/integrations?error=slack&reason=token_exchange`);
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `slack::${state.t}::${grant.team.id}`;

  const authConfig: Record<string, unknown> = {
    access_token: grant.accessToken,
    token_type: grant.tokenType,
    bot_user_id: grant.botUserId,
    app_id: grant.appId,
    team_id: grant.team.id,
    team_name: grant.team.name,
    enterprise_id: grant.enterprise?.id ?? null,
    enterprise_name: grant.enterprise?.name ?? null,
    is_enterprise_install: grant.isEnterpriseInstall,
    installer_user_id: grant.authedUser?.id ?? null,
    scope: grant.scope,
    scopes: grant.scope.split(',').filter(Boolean),
    granted_at: now,
  };
  if (grant.refreshToken && grant.expiresAt) {
    authConfig.refresh_token = grant.refreshToken;
    authConfig.expires_at = grant.expiresAt;
  }

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: state.t,
    system: 'slack',
    name: grant.team.name || `Slack ${grant.team.id}`,
    status: 'connected',
    auth_type: 'oauth_authorization_code',
    auth_config: authConfig,
    capabilities: {
      reads: ['channels', 'messages', 'users', 'reactions', 'files', 'team'],
      writes: ['post_message', 'post_ephemeral', 'update_message', 'delete_message', 'add_reaction', 'upload_file', 'open_view', 'publish_home', 'open_im'],
      events: ['message', 'app_mention', 'reaction_added', 'team_join', 'channel_created', 'member_joined_channel', 'app_home_opened'],
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });

  if (error) {
    logger.error('Slack upsert failed', { error: error.message });
    return res.redirect(`/app/integrations?error=slack&reason=persist`);
  }

  invalidateSlackForTenant(state.t, state.w || null);

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: state.t,
    workspace_id: state.w || state.t,
    actor_id: state.u,
    actor_type: 'user',
    action: 'INTEGRATION_CONNECTED',
    entity_type: 'connector',
    entity_id: connectorId,
    metadata: { system: 'slack', team_id: grant.team.id, team_name: grant.team.name, bot_user_id: grant.botUserId },
    occurred_at: now,
  }).then(() => {}, () => {});

  return res.redirect('/app/integrations?connected=slack');
});

slackOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });

  const resolved = await slackForTenant(req.tenantId, req.workspaceId ?? null);
  if (resolved?.connector.cachedAccessToken) {
    await revokeToken(resolved.connector.cachedAccessToken);
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('connectors')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('tenant_id', req.tenantId)
    .eq('system', 'slack');
  if (error) return res.status(500).json({ error: error.message });
  invalidateSlackForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

slackOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'slack')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    team_id: cfg.team_id ?? null,
    team_name: cfg.team_name ?? null,
    bot_user_id: cfg.bot_user_id ?? null,
    app_id: cfg.app_id ?? null,
    is_enterprise_install: Boolean(cfg.is_enterprise_install),
    enterprise_name: cfg.enterprise_name ?? null,
    scopes: Array.isArray(cfg.scopes) ? cfg.scopes : [],
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});

slackOAuthRouter.post('/post-test', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const channel = String(req.body?.channel || '').trim();
  const text = String(req.body?.text || 'Hola desde Clain · prueba de integración Slack ✓').trim();
  if (!channel) return res.status(400).json({ error: 'channel required (id or #name)' });
  const resolved = await slackForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Slack not connected' });
  try {
    const result = await resolved.adapter.postMessage({ channel, text });
    return res.json({ ok: true, ts: result.ts, channel: result.channel });
  } catch (err: any) {
    return res.status(502).json({
      error: 'Slack post failed',
      slack_error: err?.slackError ?? null,
      details: String(err?.message ?? err),
    });
  }
});

slackOAuthRouter.get('/channels', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await slackForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Slack not connected' });
  try {
    const result = await resolved.adapter.listChannels({ limit: 200, types: 'public_channel,private_channel' });
    const channels = (result.channels ?? []).map(c => ({
      id: c.id, name: c.name, is_private: !!c.is_private, is_member: !!c.is_member, num_members: c.num_members,
    }));
    return res.json({ ok: true, channels });
  } catch (err: any) {
    return res.status(502).json({
      error: 'Slack channels list failed',
      slack_error: err?.slackError ?? null,
      details: String(err?.message ?? err),
    });
  }
});
