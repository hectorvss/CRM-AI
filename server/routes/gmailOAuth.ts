/**
 * server/routes/gmailOAuth.ts
 *
 *   GET  /api/integrations/gmail/install     — kick off Google OAuth
 *   GET  /api/integrations/gmail/callback    — exchange code, fetch profile,
 *                                              register Pub/Sub watch, persist.
 *   POST /api/integrations/gmail/disconnect  — revoke + stop watch + flag
 *   POST /api/integrations/gmail/watch/renew — re-arm Pub/Sub (called by cron
 *                                              before 7-day expiration)
 *   POST /api/integrations/gmail/sync        — manual incremental sync
 *   GET  /api/integrations/gmail/status      — { connected, email, watch_expires_at, ... }
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
  refreshAccessToken,
  revokeToken,
  fetchUserInfo,
  GMAIL_SCOPES,
  type GmailOAuthEnv,
} from '../integrations/gmail-oauth.js';
import { GmailAdapter } from '../integrations/gmail.js';
import {
  gmailForTenant,
  invalidateGmailForTenant,
  loadGmailConnector,
} from '../integrations/gmail-tenant.js';

export const gmailOAuthRouter = Router();

function readEnv(): GmailOAuthEnv | { error: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const stateSecret = process.env.GMAIL_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret) {
    return { error: 'Gmail OAuth not configured: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET' };
  }
  if (!publicBase) return { error: 'PUBLIC_BASE_URL or VERCEL_URL must be set' };
  if (!stateSecret) return { error: 'GMAIL_STATE_SECRET must be set (or SUPABASE_SERVICE_ROLE_KEY as a fallback)' };
  return { clientId, clientSecret, stateSecret, redirectUri: `https://${publicBase}/api/integrations/gmail/callback` };
}

/**
 * Project + topic config for Gmail Pub/Sub. Optional — if absent we skip
 * the watch step on install and surface the connector as "polling mode".
 * The push subscription must be configured in Google Cloud separately;
 * this only references the topic name.
 *
 *   GMAIL_PUBSUB_TOPIC = projects/<project>/topics/<topic>
 */
function pubSubTopic(): string | null {
  return process.env.GMAIL_PUBSUB_TOPIC || null;
}

// ── GET /install ─────────────────────────────────────────────────────────────

gmailOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).json({ error: env.error });
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });

  const loginHint = typeof req.query.email === 'string' ? req.query.email : undefined;
  const state = signState({ t: req.tenantId, w: req.workspaceId ?? '', u: req.userId }, env);
  const url = buildInstallUrl({ state, env, scopes: GMAIL_SCOPES, loginHint });

  if (req.headers.accept?.includes('application/json')) {
    return res.json({ url, state });
  }
  return res.redirect(url);
});

// ── GET /callback ────────────────────────────────────────────────────────────

gmailOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).send(env.error);

  // Google surfaces consent denials with ?error=access_denied
  const googleError = typeof req.query.error === 'string' ? req.query.error : null;
  if (googleError) {
    logger.info('Gmail OAuth callback: user denied or error', { error: googleError });
    return res.redirect(`/integrations?error=gmail&reason=${encodeURIComponent(googleError)}`);
  }

  const stateRaw = String(req.query.state || '');
  let state;
  try {
    state = verifyState(stateRaw, env);
  } catch (err) {
    logger.warn('Gmail OAuth callback: state invalid', { error: String(err) });
    return res.status(401).send('Invalid state');
  }

  const code = String(req.query.code || '');
  if (!code) return res.status(400).send('Missing code');

  let grant;
  try {
    grant = await exchangeCodeForToken({ code, env });
  } catch (err) {
    logger.error('Gmail token exchange failed', { error: String(err) });
    return res.status(502).send('Gmail token exchange failed — try again');
  }

  if (!grant.refreshToken) {
    // This happens if the user previously consented and prompt=consent
    // didn't get sent. Force a re-consent.
    logger.warn('Gmail callback: no refresh_token returned — forcing re-consent');
    return res.redirect(buildInstallUrl({
      state: stateRaw,
      env,
      scopes: GMAIL_SCOPES,
    }));
  }

  // Resolve email address (use userinfo for verified email, fall back to id_token).
  let emailAddress = '';
  let displayName: string | null = null;
  try {
    const userInfo = await fetchUserInfo(grant.accessToken);
    emailAddress = userInfo.email;
    displayName = userInfo.name;
  } catch (err) {
    logger.warn('Gmail userinfo failed (continuing with id_token email)', { error: String(err) });
  }

  // Bootstrap historyId from the profile so the first incremental sync works.
  let historyId: string | null = null;
  try {
    const adapter = new GmailAdapter(grant.accessToken);
    const profile = await adapter.getProfile();
    historyId = profile.historyId;
    if (!emailAddress) emailAddress = profile.emailAddress;
  } catch (err) {
    logger.warn('Gmail profile fetch failed (continuing)', { error: String(err) });
  }

  // Optionally register Pub/Sub watch for real-time inbound.
  let watchExpiration: string | null = null;
  const topic = pubSubTopic();
  if (topic) {
    try {
      const adapter = new GmailAdapter(grant.accessToken);
      const watch = await adapter.watch({
        topicName: topic,
        labelIds: ['INBOX'],
        labelFilterAction: 'include',
      });
      watchExpiration = new Date(Number(watch.expiration)).toISOString();
      historyId = watch.historyId;
    } catch (err) {
      logger.warn('Gmail Pub/Sub watch failed (falling back to polling)', { error: String(err) });
    }
  }

  // Upsert connector. tenant_id from verified state.
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `gmail::${state.t}::${emailAddress || randomUUID()}`;

  const authConfig = {
    email_address: emailAddress,
    display_name: displayName,
    access_token: grant.accessToken,
    refresh_token: grant.refreshToken,
    expires_at: grant.expiresAt,
    scope: grant.scope,
    history_id: historyId,
    watch_expiration: watchExpiration,
    realtime_mode: watchExpiration ? 'pubsub' : 'polling',
    granted_at: now,
  };

  const { error: upsertError } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: state.t,
    system: 'gmail',
    name: emailAddress,
    status: 'connected',
    auth_type: 'oauth',
    auth_config: authConfig,
    capabilities: {
      reads: ['threads', 'messages', 'attachments', 'labels', 'history'],
      writes: ['send', 'reply', 'modify_labels', 'trash', 'drafts'],
      realtime: watchExpiration ? 'pubsub' : 'polling',
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });

  if (upsertError) {
    logger.error('Gmail OAuth callback: connector upsert failed', { error: upsertError.message });
    return res.status(500).send('Could not persist Gmail connector — try again');
  }

  invalidateGmailForTenant(state.t, state.w || null);

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
      metadata: {
        system: 'gmail',
        email: emailAddress,
        scope: grant.scope,
        realtime: watchExpiration ? 'pubsub' : 'polling',
      },
      occurred_at: now,
    })
    .then(() => {}, (err) => logger.warn('audit insert failed', { error: String(err) }));

  return res.redirect(`/integrations?connected=gmail&email=${encodeURIComponent(emailAddress)}`);
});

// ── POST /disconnect ─────────────────────────────────────────────────────────

gmailOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();

  const connector = await loadGmailConnector(req.tenantId);
  if (connector) {
    // Best-effort: stop watch + revoke token. Errors are logged not surfaced.
    try {
      const adapter = new GmailAdapter(connector.accessToken);
      await adapter.stopWatch();
    } catch (err) {
      logger.warn('Gmail stopWatch failed', { error: String(err) });
    }
    try {
      await revokeToken(connector.refreshToken);
    } catch (err) {
      logger.warn('Gmail revoke failed', { error: String(err) });
    }
  }

  const { error } = await supabase
    .from('connectors')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('tenant_id', req.tenantId)
    .eq('system', 'gmail');
  if (error) return res.status(500).json({ error: error.message });

  invalidateGmailForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

// ── POST /watch/renew ────────────────────────────────────────────────────────
// Pub/Sub watches expire after 7 days. Internal cron / scheduled task hits
// this endpoint to re-arm them. Authenticated via INTERNAL_CRON_SECRET.

gmailOAuthRouter.post('/watch/renew', async (req: Request, res: Response) => {
  const secret = req.headers['x-internal-secret'];
  if (!secret || secret !== process.env.INTERNAL_CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const env = readEnv();
  const topic = pubSubTopic();
  if ('error' in env) return res.status(503).json({ error: env.error });
  if (!topic) return res.status(503).json({ error: 'GMAIL_PUBSUB_TOPIC not configured' });

  const supabase = getSupabaseAdmin();
  const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, tenant_id, auth_config')
    .eq('system', 'gmail')
    .eq('status', 'connected');
  if (error) return res.status(500).json({ error: error.message });

  const renewed: string[] = [];
  for (const row of (data ?? []) as Array<{ id: string; tenant_id: string; auth_config: any }>) {
    const cfg = row.auth_config ?? {};
    const watchExp = cfg.watch_expiration as string | null;
    if (watchExp && watchExp > cutoff) continue; // not due yet

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
        logger.warn('Gmail watch renew: refresh failed', { id: row.id, error: String(err) });
        continue;
      }
    }

    try {
      const adapter = new GmailAdapter(accessToken);
      const watch = await adapter.watch({ topicName: topic, labelIds: ['INBOX'], labelFilterAction: 'include' });
      const expiration = new Date(Number(watch.expiration)).toISOString();
      await supabase.from('connectors').update({
        auth_config: { ...cfg, watch_expiration: expiration, history_id: watch.historyId },
        last_health_check_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', row.id);
      renewed.push(row.id);
    } catch (err) {
      logger.warn('Gmail watch renew failed', { id: row.id, error: String(err) });
    }
  }
  return res.json({ ok: true, renewed: renewed.length, ids: renewed });
});

// ── POST /sync — manual incremental sync ─────────────────────────────────────

gmailOAuthRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });

  const resolved = await gmailForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Gmail not connected' });

  const startHistoryId = resolved.connector.historyId;
  if (!startHistoryId) {
    // First sync: just persist the latest historyId without fetching old mail.
    const profile = await resolved.adapter.getProfile();
    const supabase = getSupabaseAdmin();
    await supabase.from('connectors').update({
      auth_config: { ...resolved.connector.rawAuthConfig, history_id: profile.historyId },
      updated_at: new Date().toISOString(),
    }).eq('id', resolved.connector.id);
    return res.json({ ok: true, mode: 'baseline', historyId: profile.historyId });
  }

  try {
    const result = await resolved.adapter.listHistory({ startHistoryId, labelId: 'INBOX' });
    const supabase = getSupabaseAdmin();
    await supabase.from('connectors').update({
      auth_config: { ...resolved.connector.rawAuthConfig, history_id: result.historyId },
      last_health_check_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', resolved.connector.id);
    return res.json({
      ok: true,
      changes: result.history?.length ?? 0,
      newHistoryId: result.historyId,
    });
  } catch (err: any) {
    if (err?.statusCode === 404) {
      // historyId too old — caller should run a full re-sync.
      return res.status(410).json({ error: 'history expired', recommend: 'full_resync' });
    }
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// ── GET /status ──────────────────────────────────────────────────────────────

gmailOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'gmail')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    email: cfg.email_address ?? null,
    display_name: cfg.display_name ?? null,
    scope: cfg.scope ?? null,
    realtime_mode: cfg.realtime_mode ?? 'polling',
    watch_expiration: cfg.watch_expiration ?? null,
    history_id: cfg.history_id ?? null,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});
