/**
 * server/routes/calendlyOAuth.ts
 *
 *   GET  /api/integrations/calendly/install   — redirect to Calendly consent
 *   GET  /api/integrations/calendly/callback  — exchange code, register webhook, persist
 *   POST /api/integrations/calendly/disconnect
 *   GET  /api/integrations/calendly/status
 *   POST /api/integrations/calendly/sync       — list upcoming events
 *   GET  /api/integrations/calendly/event-types — list event types for picker
 *   POST /api/integrations/calendly/scheduling-link — create one-shot link
 *   POST /api/integrations/calendly/register-webhook — re-register
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
  revokeToken,
  type CalendlyOAuthEnv,
} from '../integrations/calendly-oauth.js';
import {
  calendlyForTenant,
  invalidateCalendlyForTenant,
} from '../integrations/calendly-tenant.js';

export const calendlyOAuthRouter = Router();

function readEnv(): CalendlyOAuthEnv | { error: string } {
  const clientId = process.env.CALENDLY_CLIENT_ID;
  const clientSecret = process.env.CALENDLY_CLIENT_SECRET;
  const stateSecret = process.env.CALENDLY_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret) return { error: 'Calendly OAuth not configured: set CALENDLY_CLIENT_ID and CALENDLY_CLIENT_SECRET' };
  if (!publicBase) return { error: 'PUBLIC_BASE_URL must be set' };
  if (!stateSecret) return { error: 'CALENDLY_STATE_SECRET must be set' };
  return {
    clientId,
    clientSecret,
    stateSecret,
    redirectUri: `https://${publicBase}/api/integrations/calendly/callback`,
  };
}

function publicBaseUrl(): string {
  const base = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  return base ? `https://${base}` : '';
}

calendlyOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).json({ error: env.error });
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });

  const state = signState({ t: req.tenantId, w: req.workspaceId ?? '', u: req.userId }, env);
  const url = buildInstallUrl({ state, env });

  if (req.headers.accept?.includes('application/json')) return res.json({ url, state });
  return res.redirect(url);
});

calendlyOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).send(env.error);

  const oauthError = typeof req.query.error === 'string' ? req.query.error : null;
  if (oauthError) {
    return res.redirect(`/app/integrations?error=calendly&reason=${encodeURIComponent(oauthError)}`);
  }
  const stateRaw = String(req.query.state || '');
  let state;
  try { state = verifyState(stateRaw, env); }
  catch (err) {
    logger.warn('Calendly callback: state invalid', { error: String(err) });
    return res.status(401).send('Invalid state');
  }
  const code = String(req.query.code || '');
  if (!code) return res.status(400).send('Missing code');

  let grant;
  try { grant = await exchangeCodeForToken({ code, env }); }
  catch (err) {
    logger.warn('Calendly token exchange failed', { error: String(err) });
    return res.redirect(`/app/integrations?error=calendly&reason=token_exchange`);
  }

  // Identify the user + auto-register webhook (org-scoped).
  let me: any = null;
  let webhookUuid: string | null = null;
  let webhookSigningKey: string | null = null;
  let webhookError: string | null = null;
  try {
    const { CalendlyAdapter } = await import('../integrations/calendly.js');
    const adapter = new CalendlyAdapter(grant.accessToken);
    try {
      const r = await adapter.currentUser();
      me = r.resource;
    } catch (err) {
      logger.warn('Calendly currentUser fetch failed', { error: String(err) });
    }

    const callback = `${publicBaseUrl()}/webhooks/calendly`;
    if (callback && grant.organizationUri) {
      try {
        const signingKey = randomBytes(32).toString('hex');
        const wh = await adapter.createWebhook({
          url: callback,
          events: ['invitee.created', 'invitee.canceled', 'invitee_no_show.created', 'invitee_no_show.deleted', 'routing_form_submission.created'],
          organization: grant.organizationUri,
          scope: 'organization',
          signing_key: signingKey,
        });
        webhookUuid = wh.resource.uri.split('/').pop() ?? null;
        webhookSigningKey = signingKey;
      } catch (err: any) {
        webhookError = String(err?.message ?? err);
        logger.warn('Calendly webhook auto-register failed', { error: webhookError });
      }
    }
  } catch (err) {
    logger.warn('Calendly post-exchange setup failed (continuing)', { error: String(err) });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const ownerUuid = grant.ownerUri?.split('/').pop() ?? 'unknown';
  const connectorId = `calendly::${state.t}::${ownerUuid}`;

  const authConfig: Record<string, unknown> = {
    access_token: grant.accessToken,
    refresh_token: grant.refreshToken,
    expires_at: grant.expiresAt,
    token_type: grant.tokenType,
    owner_uri: grant.ownerUri,
    organization_uri: grant.organizationUri,
    owner_email: me?.email ?? null,
    owner_name: me?.name ?? null,
    scheduling_url: me?.scheduling_url ?? null,
    timezone: me?.timezone ?? null,
    webhook_uuid: webhookUuid,
    webhook_url: webhookUuid ? `${publicBaseUrl()}/webhooks/calendly` : null,
    webhook_signing_key: webhookSigningKey,
    webhook_error: webhookError,
    granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: state.t,
    system: 'calendly',
    name: me?.name || me?.email || ownerUuid,
    status: 'connected',
    auth_type: 'oauth_authorization_code',
    auth_config: authConfig,
    capabilities: {
      reads: ['users', 'event_types', 'scheduled_events', 'invitees', 'routing_forms'],
      writes: ['create_scheduling_link', 'cancel_scheduled_event'],
      events: ['invitee.created', 'invitee.canceled', 'invitee_no_show.created', 'invitee_no_show.deleted', 'routing_form_submission.created'],
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });

  if (error) {
    logger.error('Calendly upsert failed', { error: error.message });
    return res.redirect(`/app/integrations?error=calendly&reason=persist`);
  }

  invalidateCalendlyForTenant(state.t, state.w || null);

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: state.t,
    workspace_id: state.w || state.t,
    actor_id: state.u,
    actor_type: 'user',
    action: 'INTEGRATION_CONNECTED',
    entity_type: 'connector',
    entity_id: connectorId,
    metadata: { system: 'calendly', owner_email: me?.email ?? null, webhook_uuid: webhookUuid },
    occurred_at: now,
  }).then(() => {}, () => {});

  return res.redirect('/app/integrations?connected=calendly');
});

calendlyOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });

  const env = readEnv();
  const resolved = await calendlyForTenant(req.tenantId, req.workspaceId ?? null);
  if (resolved) {
    if (resolved.connector.webhookUuid) {
      try { await resolved.adapter.deleteWebhook(resolved.connector.webhookUuid); }
      catch (err) { logger.warn('Calendly deleteWebhook failed', { error: String(err) }); }
    }
    if (!('error' in env) && resolved.connector.cachedAccessToken) {
      await revokeToken(resolved.connector.cachedAccessToken, env);
    }
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('connectors')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('tenant_id', req.tenantId)
    .eq('system', 'calendly');
  if (error) return res.status(500).json({ error: error.message });
  invalidateCalendlyForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

calendlyOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'calendly')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    owner_email: cfg.owner_email ?? null,
    owner_name: cfg.owner_name ?? null,
    scheduling_url: cfg.scheduling_url ?? null,
    timezone: cfg.timezone ?? null,
    webhook_uuid: cfg.webhook_uuid ?? null,
    webhook_url: cfg.webhook_url ?? null,
    webhook_registered: Boolean(cfg.webhook_uuid),
    webhook_error: cfg.webhook_error ?? null,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});

calendlyOAuthRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await calendlyForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Calendly not connected' });
  try {
    const r = await resolved.adapter.listScheduledEvents({
      user: resolved.connector.ownerUri,
      status: 'active',
      minStartTime: new Date().toISOString(),
      sort: 'start_time:asc',
      count: 5,
    });
    return res.json({
      ok: true,
      upcoming_visible: r.collection.length,
      sample: r.collection.slice(0, 5).map(ev => ({
        name: ev.name, start_time: ev.start_time, end_time: ev.end_time, status: ev.status,
      })),
    });
  } catch (err: any) {
    return res.status(502).json({
      error: 'Calendly API call failed',
      details: err?.calendlyError ?? String(err?.message ?? err),
    });
  }
});

calendlyOAuthRouter.get('/event-types', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await calendlyForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Calendly not connected' });
  try {
    const r = await resolved.adapter.listEventTypes({
      user: resolved.connector.ownerUri,
      active: true,
      count: 100,
    });
    return res.json({
      ok: true,
      event_types: r.collection.map(t => ({
        uri: t.uri, name: t.name, slug: t.slug, duration: t.duration, kind: t.kind,
        scheduling_url: t.scheduling_url, color: t.color,
      })),
    });
  } catch (err: any) {
    return res.status(502).json({ error: 'Calendly event_types failed', details: err?.calendlyError ?? String(err?.message ?? err) });
  }
});

calendlyOAuthRouter.post('/scheduling-link', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await calendlyForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Calendly not connected' });
  const eventTypeUri = String(req.body?.event_type_uri || '').trim();
  if (!eventTypeUri) return res.status(400).json({ error: 'event_type_uri required' });
  try {
    const r = await resolved.adapter.createSchedulingLink({
      max_event_count: 1, owner: eventTypeUri, owner_type: 'EventType',
    });
    return res.json({ ok: true, booking_url: r.resource.booking_url });
  } catch (err: any) {
    return res.status(502).json({ error: 'Calendly scheduling-link failed', details: err?.calendlyError ?? String(err?.message ?? err) });
  }
});
