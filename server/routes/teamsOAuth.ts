/**
 * server/routes/teamsOAuth.ts
 *
 *   GET  /api/integrations/teams/install     — redirect to Microsoft consent
 *   GET  /api/integrations/teams/callback    — exchange code, register subs, persist
 *   POST /api/integrations/teams/disconnect
 *   GET  /api/integrations/teams/status
 *   POST /api/integrations/teams/sync         — list joined teams + first channels
 *   POST /api/integrations/teams/subscription/renew  — internal cron renews subs
 */

import { Router, Request, Response } from 'express';
import { randomBytes, randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import {
  buildInstallUrl,
  signState,
  verifyState,
  exchangeCodeForToken,
  fetchUserInfo,
  TEAMS_SCOPES,
  type TeamsOAuthEnv,
} from '../integrations/teams-oauth.js';
import {
  teamsForTenant,
  invalidateTeamsForTenant,
} from '../integrations/teams-tenant.js';
import { TeamsAdapter } from '../integrations/teams.js';

export const teamsOAuthRouter = Router();

function readEnv(): TeamsOAuthEnv | { error: string } {
  const clientId = process.env.TEAMS_CLIENT_ID ?? process.env.MS_CLIENT_ID;
  const clientSecret = process.env.TEAMS_CLIENT_SECRET ?? process.env.MS_CLIENT_SECRET;
  const tenant = process.env.TEAMS_TENANT_ID ?? process.env.MS_TENANT_ID ?? 'common';
  const stateSecret = process.env.TEAMS_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret) return { error: 'Teams OAuth not configured: set TEAMS_CLIENT_ID and TEAMS_CLIENT_SECRET (or reuse MS_CLIENT_ID / MS_CLIENT_SECRET).' };
  if (!publicBase) return { error: 'PUBLIC_BASE_URL must be set' };
  if (!stateSecret) return { error: 'TEAMS_STATE_SECRET must be set' };
  return {
    clientId,
    clientSecret,
    tenant,
    stateSecret,
    redirectUri: `https://${publicBase}/api/integrations/teams/callback`,
  };
}

function publicBaseUrl(): string {
  const base = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  return base ? `https://${base}` : '';
}

teamsOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).json({ error: env.error });
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });

  const loginHint = typeof req.query.email === 'string' ? req.query.email : undefined;
  const state = signState({ t: req.tenantId, w: req.workspaceId ?? '', u: req.userId }, env);
  const url = buildInstallUrl({ state, env, scopes: TEAMS_SCOPES, loginHint });

  if (req.headers.accept?.includes('application/json')) return res.json({ url, state });
  return res.redirect(url);
});

teamsOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).send(env.error);

  const oauthError = typeof req.query.error === 'string' ? req.query.error : null;
  if (oauthError) {
    return res.redirect(`/app/integrations?error=teams&reason=${encodeURIComponent(oauthError)}`);
  }
  const stateRaw = String(req.query.state || '');
  let state;
  try { state = verifyState(stateRaw, env); }
  catch (err) {
    logger.warn('Teams callback: state invalid', { error: String(err) });
    return res.status(401).send('Invalid state');
  }
  const code = String(req.query.code || '');
  if (!code) return res.status(400).send('Missing code');

  let grant;
  try { grant = await exchangeCodeForToken({ code, env }); }
  catch (err) {
    logger.warn('Teams token exchange failed', { error: String(err) });
    return res.redirect(`/app/integrations?error=teams&reason=token_exchange`);
  }

  // Identity
  let info;
  try { info = await fetchUserInfo(grant.accessToken); }
  catch (err) {
    logger.warn('Teams /me fetch failed (continuing)', { error: String(err) });
    info = { id: '', mail: null, userPrincipalName: '', displayName: null };
  }

  // Auto-create Graph subscription for /chats/getAllMessages (1h max).
  // We DON'T auto-subscribe to channel messages because that requires
  // a teamId+channelId — the user picks one in the UI.
  const adapter = new TeamsAdapter(grant.accessToken);
  const subscriptions: Record<string, { id: string; expires: string; clientState: string }> = {};
  let subError: string | null = null;
  const callback = `${publicBaseUrl()}/webhooks/teams`;
  if (callback) {
    try {
      const clientState = randomBytes(24).toString('hex');
      const expires = new Date(Date.now() + 55 * 60_000).toISOString(); // 55 min (max 60)
      const sub = await adapter.createSubscription({
        changeType: 'created,updated',
        notificationUrl: callback,
        resource: '/me/chats/getAllMessages',
        expirationDateTime: expires,
        clientState,
      });
      subscriptions['/me/chats/getAllMessages'] = { id: sub.id, expires: sub.expirationDateTime, clientState };
    } catch (err: any) {
      subError = String(err?.graphError?.message ?? err?.message ?? err);
      logger.warn('Teams subscription auto-register failed', { error: subError });
    }
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `teams::${state.t}::${info.id || 'unknown'}`;

  const authConfig: Record<string, unknown> = {
    access_token: grant.accessToken,
    refresh_token: grant.refreshToken,
    expires_at: grant.expiresAt,
    token_type: grant.tokenType,
    scope: grant.scope,
    ms_user_id: info.id,
    ms_user_principal_name: info.userPrincipalName,
    ms_user_mail: info.mail,
    ms_user_display_name: info.displayName,
    subscriptions,
    subscription_error: subError,
    granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: state.t,
    system: 'teams',
    name: info.displayName || info.userPrincipalName || info.mail || info.id || 'Microsoft Teams',
    status: 'connected',
    auth_type: 'oauth_authorization_code',
    auth_config: authConfig,
    capabilities: {
      reads: ['joined_teams', 'channels', 'channel_messages', 'chats', 'chat_messages', 'users'],
      writes: ['post_channel_message', 'reply_channel_message', 'send_chat_message', 'open_one_on_one_chat'],
      events: ['chatMessage.created', 'chatMessage.updated'],
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });

  if (error) {
    logger.error('Teams upsert failed', { error: error.message });
    return res.redirect(`/app/integrations?error=teams&reason=persist`);
  }

  invalidateTeamsForTenant(state.t, state.w || null);

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: state.t,
    workspace_id: state.w || state.t,
    actor_id: state.u,
    actor_type: 'user',
    action: 'INTEGRATION_CONNECTED',
    entity_type: 'connector',
    entity_id: connectorId,
    metadata: { system: 'teams', ms_user_principal_name: info.userPrincipalName, sub_count: Object.keys(subscriptions).length },
    occurred_at: now,
  }).then(() => {}, () => {});

  return res.redirect('/app/integrations?connected=teams');
});

teamsOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });

  const resolved = await teamsForTenant(req.tenantId, req.workspaceId ?? null);
  if (resolved) {
    for (const sub of Object.values(resolved.connector.subscriptions)) {
      try { await resolved.adapter.deleteSubscription(sub.id); }
      catch (err) { logger.warn('Teams deleteSubscription failed', { error: String(err) }); }
    }
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('connectors')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('tenant_id', req.tenantId)
    .eq('system', 'teams');
  if (error) return res.status(500).json({ error: error.message });
  invalidateTeamsForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

teamsOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'teams')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  const subs = (cfg.subscriptions ?? {}) as Record<string, { id: string; expires: string }>;
  return res.json({
    connected: data.status === 'connected',
    ms_user_principal_name: cfg.ms_user_principal_name ?? null,
    ms_user_mail: cfg.ms_user_mail ?? null,
    ms_user_display_name: cfg.ms_user_display_name ?? null,
    subscriptions_active: Object.keys(subs).length,
    subscription_error: cfg.subscription_error ?? null,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});

teamsOAuthRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await teamsForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Teams not connected' });
  try {
    const teams = await resolved.adapter.listJoinedTeams();
    return res.json({
      ok: true,
      teams_visible: teams.value.length,
      sample: teams.value.slice(0, 5).map(t => ({ id: t.id, name: t.displayName, visibility: t.visibility })),
    });
  } catch (err: any) {
    return res.status(502).json({
      error: 'Teams API call failed',
      details: err?.graphError ?? String(err?.message ?? err),
    });
  }
});

/**
 * Internal cron-driven endpoint to renew Graph subscriptions before they
 * expire (Graph caps chat/channel-message subs at 60 minutes).
 */
teamsOAuthRouter.post('/subscription/renew', async (req: Request, res: Response) => {
  const cronSecret = process.env.INTERNAL_CRON_SECRET ?? '';
  const provided = req.header('x-cron-secret') ?? '';
  if (!cronSecret || provided !== cronSecret) return res.status(401).end();

  const supabase = getSupabaseAdmin();
  const { data: rows } = await supabase
    .from('connectors')
    .select('id, tenant_id, auth_config')
    .eq('system', 'teams')
    .eq('status', 'connected');

  let renewed = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    const cfg = (row.auth_config ?? {}) as Record<string, unknown>;
    const subs = (cfg.subscriptions ?? {}) as Record<string, { id: string; expires: string; clientState: string }>;
    const accessToken = typeof cfg.access_token === 'string' ? cfg.access_token : '';
    if (!accessToken || Object.keys(subs).length === 0) continue;
    const adapter = new TeamsAdapter(accessToken);
    const newSubs: Record<string, { id: string; expires: string; clientState: string }> = {};
    for (const [resource, sub] of Object.entries(subs)) {
      try {
        const newExpires = new Date(Date.now() + 55 * 60_000).toISOString();
        const r = await adapter.renewSubscription(sub.id, newExpires);
        newSubs[resource] = { id: sub.id, expires: r.expirationDateTime ?? newExpires, clientState: sub.clientState };
        renewed++;
      } catch (err) {
        failed++;
        newSubs[resource] = sub;
        logger.warn('Teams renewSubscription failed', { id: sub.id, error: String(err) });
      }
    }
    await supabase
      .from('connectors')
      .update({
        auth_config: { ...cfg, subscriptions: newSubs },
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
  }
  return res.json({ ok: true, renewed, failed });
});
