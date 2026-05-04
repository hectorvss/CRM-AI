/**
 * server/routes/outlookOAuth.ts
 *
 *   GET  /api/integrations/outlook/install        — redirect to Microsoft consent
 *   GET  /api/integrations/outlook/callback       — exchange code, create
 *                                                    subscription, persist
 *   POST /api/integrations/outlook/disconnect     — delete subscription + flag
 *   POST /api/integrations/outlook/subscription/renew — internal cron
 *   POST /api/integrations/outlook/sync           — manual list latest unread
 *   GET  /api/integrations/outlook/status         — full status
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
  refreshAccessToken,
  fetchUserInfo,
  OUTLOOK_SCOPES,
  type OutlookOAuthEnv,
} from '../integrations/outlook-oauth.js';
import { OutlookAdapter } from '../integrations/outlook.js';
import {
  outlookForTenant,
  invalidateOutlookForTenant,
  loadOutlookConnector,
} from '../integrations/outlook-tenant.js';

export const outlookOAuthRouter = Router();

function readEnv(): OutlookOAuthEnv | { error: string } {
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  const tenant = process.env.MS_TENANT_ID || 'common';
  const stateSecret = process.env.OUTLOOK_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret) return { error: 'Outlook OAuth not configured: set MS_CLIENT_ID and MS_CLIENT_SECRET' };
  if (!publicBase) return { error: 'PUBLIC_BASE_URL or VERCEL_URL must be set' };
  if (!stateSecret) return { error: 'OUTLOOK_STATE_SECRET must be set (or SUPABASE_SERVICE_ROLE_KEY as a fallback)' };
  return {
    clientId,
    clientSecret,
    tenant,
    stateSecret,
    redirectUri: `https://${publicBase}/api/integrations/outlook/callback`,
  };
}

function webhookCallbackUrl(): string {
  const base = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  return base ? `https://${base}/webhooks/outlook` : '';
}

// ── GET /install ─────────────────────────────────────────────────────────────

outlookOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).json({ error: env.error });
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });

  const loginHint = typeof req.query.email === 'string' ? req.query.email : undefined;
  const state = signState({ t: req.tenantId, w: req.workspaceId ?? '', u: req.userId }, env);
  const url = buildInstallUrl({ state, env, scopes: OUTLOOK_SCOPES, loginHint });

  if (req.headers.accept?.includes('application/json')) {
    return res.json({ url, state });
  }
  return res.redirect(url);
});

// ── GET /callback ────────────────────────────────────────────────────────────

outlookOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).send(env.error);

  const oauthError = typeof req.query.error === 'string' ? req.query.error : null;
  if (oauthError) {
    logger.info('Outlook OAuth callback: user denied or error', { error: oauthError });
    return res.redirect(`/integrations?error=outlook&reason=${encodeURIComponent(oauthError)}`);
  }

  const stateRaw = String(req.query.state || '');
  let state;
  try {
    state = verifyState(stateRaw, env);
  } catch (err) {
    logger.warn('Outlook OAuth callback: state invalid', { error: String(err) });
    return res.status(401).send('Invalid state');
  }

  const code = String(req.query.code || '');
  if (!code) return res.status(400).send('Missing code');

  let grant;
  try {
    grant = await exchangeCodeForToken({ code, env });
  } catch (err) {
    logger.error('Outlook token exchange failed', { error: String(err) });
    return res.status(502).send('Outlook token exchange failed — try again');
  }

  if (!grant.refreshToken) {
    logger.warn('Outlook callback: no refresh_token returned');
    return res.redirect(buildInstallUrl({ state: stateRaw, env, scopes: OUTLOOK_SCOPES, prompt: 'consent' }));
  }

  // Resolve email + display name.
  let email = '';
  let displayName: string | null = null;
  try {
    const info = await fetchUserInfo(grant.accessToken);
    email = info.mail || info.userPrincipalName;
    displayName = info.displayName;
  } catch (err) {
    logger.warn('Outlook userinfo failed (continuing)', { error: String(err) });
  }

  // Create a Graph subscription so messages push to /webhooks/outlook in
  // real time. Failures are non-fatal — the merchant can still use polling.
  let subscriptionId: string | null = null;
  let subscriptionExpiresAt: string | null = null;
  let subscriptionClientState: string | null = null;
  try {
    const adapter = new OutlookAdapter(grant.accessToken);
    const clientState = randomBytes(20).toString('base64url');
    const sub = await adapter.createSubscription({
      notificationUrl: webhookCallbackUrl(),
      clientState,
      resource: '/me/mailFolders/inbox/messages',
      changeType: 'created',
      expirationMinutes: 4200,
    });
    subscriptionId = sub.id;
    subscriptionExpiresAt = sub.expirationDateTime;
    subscriptionClientState = clientState;
  } catch (err) {
    logger.warn('Outlook subscription create failed (continuing in polling mode)', { error: String(err) });
  }

  // Upsert connector. tenant_id from verified state.
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `outlook::${state.t}::${email || randomUUID()}`;

  const authConfig = {
    email,
    display_name: displayName,
    access_token: grant.accessToken,
    refresh_token: grant.refreshToken,
    expires_at: grant.expiresAt,
    scope: grant.scope,
    subscription_id: subscriptionId,
    subscription_expires_at: subscriptionExpiresAt,
    subscription_client_state: subscriptionClientState,
    realtime_mode: subscriptionId ? 'webhook' : 'polling',
    granted_at: now,
  };

  const { error: upsertError } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: state.t,
    system: 'outlook',
    name: email,
    status: 'connected',
    auth_type: 'oauth',
    auth_config: authConfig,
    capabilities: {
      reads: ['messages', 'folders', 'attachments', 'subscriptions'],
      writes: ['send', 'reply', 'forward', 'move', 'mark_read', 'drafts'],
      realtime: subscriptionId ? 'webhook' : 'polling',
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });

  if (upsertError) {
    logger.error('Outlook callback: connector upsert failed', { error: upsertError.message });
    return res.status(500).send('Could not persist Outlook connector — try again');
  }

  invalidateOutlookForTenant(state.t, state.w || null);

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
      metadata: { system: 'outlook', email, scope: grant.scope, realtime: subscriptionId ? 'webhook' : 'polling' },
      occurred_at: now,
    })
    .then(() => {}, () => {});

  return res.redirect(`/integrations?connected=outlook&email=${encodeURIComponent(email)}`);
});

// ── POST /disconnect ─────────────────────────────────────────────────────────

outlookOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();

  const connector = await loadOutlookConnector(req.tenantId);
  if (connector?.subscriptionId) {
    try {
      const adapter = new OutlookAdapter(connector.accessToken);
      await adapter.deleteSubscription(connector.subscriptionId);
    } catch (err) {
      logger.warn('Outlook deleteSubscription failed', { error: String(err) });
    }
  }

  const { error } = await supabase
    .from('connectors')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('tenant_id', req.tenantId)
    .eq('system', 'outlook');
  if (error) return res.status(500).json({ error: error.message });

  invalidateOutlookForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

// ── POST /subscription/renew (internal cron) ────────────────────────────────

outlookOAuthRouter.post('/subscription/renew', async (req: Request, res: Response) => {
  const secret = req.headers['x-internal-secret'];
  if (!secret || secret !== process.env.INTERNAL_CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const env = readEnv();
  if ('error' in env) return res.status(503).json({ error: env.error });

  const supabase = getSupabaseAdmin();
  // Renew anything expiring in the next 12h.
  const cutoff = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, tenant_id, auth_config')
    .eq('system', 'outlook')
    .eq('status', 'connected');
  if (error) return res.status(500).json({ error: error.message });

  const renewed: string[] = [];
  for (const row of (data ?? []) as Array<{ id: string; tenant_id: string; auth_config: any }>) {
    const cfg = row.auth_config ?? {};
    const subId = cfg.subscription_id as string | undefined;
    const subExp = cfg.subscription_expires_at as string | undefined;
    if (!subId) continue;
    if (subExp && subExp > cutoff) continue;

    let accessToken = cfg.access_token as string;
    if (cfg.expires_at && new Date(cfg.expires_at).getTime() - Date.now() < 60_000 && cfg.refresh_token) {
      try {
        const refreshed = await refreshAccessToken({ refreshToken: cfg.refresh_token, env });
        accessToken = refreshed.accessToken;
        await supabase.from('connectors').update({
          auth_config: { ...cfg, access_token: refreshed.accessToken, expires_at: refreshed.expiresAt },
          updated_at: new Date().toISOString(),
        }).eq('id', row.id);
      } catch (err) {
        logger.warn('Outlook renew: refresh failed', { id: row.id, error: String(err) });
        continue;
      }
    }

    try {
      const adapter = new OutlookAdapter(accessToken);
      const sub = await adapter.renewSubscription(subId, 4200);
      await supabase.from('connectors').update({
        auth_config: { ...cfg, subscription_expires_at: sub.expirationDateTime },
        last_health_check_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', row.id);
      renewed.push(row.id);
    } catch (err: any) {
      logger.warn('Outlook subscription renew failed', { id: row.id, error: String(err) });
      // If subscription is gone (404), we'll create a fresh one next time
      // the merchant interacts with the integration.
    }
  }

  return res.json({ ok: true, renewed: renewed.length, ids: renewed });
});

// ── POST /sync (manual, polling fallback) ───────────────────────────────────

outlookOAuthRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await outlookForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Outlook not connected' });

  try {
    const messages = await resolved.adapter.listMessages({
      folder: 'inbox',
      filter: 'isRead eq false',
      top: 50,
      orderBy: 'receivedDateTime desc',
    });
    return res.json({ ok: true, unread_count: messages.length });
  } catch (err: any) {
    return res.status(502).json({ error: String(err?.message ?? err) });
  }
});

// ── GET /status ──────────────────────────────────────────────────────────────

outlookOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'outlook')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    email: cfg.email ?? null,
    display_name: cfg.display_name ?? null,
    scope: cfg.scope ?? null,
    realtime_mode: cfg.realtime_mode ?? 'polling',
    subscription_id: cfg.subscription_id ?? null,
    subscription_expires_at: cfg.subscription_expires_at ?? null,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});
