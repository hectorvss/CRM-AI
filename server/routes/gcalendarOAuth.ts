/**
 * server/routes/gcalendarOAuth.ts
 *
 *   GET  /api/integrations/gcalendar/install
 *   GET  /api/integrations/gcalendar/callback
 *   POST /api/integrations/gcalendar/disconnect
 *   GET  /api/integrations/gcalendar/status
 *   POST /api/integrations/gcalendar/sync
 *   GET  /api/integrations/gcalendar/calendars
 *   POST /api/integrations/gcalendar/event           — create event (used by AI)
 *   POST /api/integrations/gcalendar/freebusy        — availability lookup
 *   POST /api/integrations/gcalendar/watch           — register push channel for a calendar
 *   POST /api/integrations/gcalendar/unwatch
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
  fetchUserInfo,
  generateChannelToken,
  GOOGLE_CALENDAR_SCOPES,
  type GoogleOAuthEnv,
} from '../integrations/google-oauth.js';
import {
  gcalendarForTenant,
  invalidateGCalendarForTenant,
  type GCalChannelEntry,
} from '../integrations/gcalendar-tenant.js';
import { GCalendarAdapter } from '../integrations/gcalendar.js';

export const gcalendarOAuthRouter = Router();

function readEnv(): GoogleOAuthEnv | { error: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const stateSecret = process.env.GOOGLE_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret) return { error: 'Google OAuth not configured: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET' };
  if (!publicBase) return { error: 'PUBLIC_BASE_URL must be set' };
  if (!stateSecret) return { error: 'GOOGLE_STATE_SECRET must be set' };
  return { clientId, clientSecret, stateSecret, redirectUri: `https://${publicBase}/api/integrations/gcalendar/callback` };
}

function publicBaseUrl(): string {
  const base = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  return base ? `https://${base}` : '';
}

gcalendarOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).json({ error: env.error });
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });
  const state = signState({ t: req.tenantId, w: req.workspaceId ?? '', u: req.userId }, env);
  const url = buildInstallUrl({ state, env, scopes: GOOGLE_CALENDAR_SCOPES });
  if (req.headers.accept?.includes('application/json')) return res.json({ url, state });
  return res.redirect(url);
});

gcalendarOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).send(env.error);
  const oauthError = typeof req.query.error === 'string' ? req.query.error : null;
  if (oauthError) return res.redirect(`/app/integrations?error=gcalendar&reason=${encodeURIComponent(oauthError)}`);
  const stateRaw = String(req.query.state || '');
  let state;
  try { state = verifyState(stateRaw, env); }
  catch (err) { logger.warn('GCalendar callback: state invalid', { error: String(err) }); return res.status(401).send('Invalid state'); }
  const code = String(req.query.code || '');
  if (!code) return res.status(400).send('Missing code');

  let grant;
  try { grant = await exchangeCodeForToken({ code, env }); }
  catch (err) {
    logger.warn('GCalendar token exchange failed', { error: String(err) });
    return res.redirect(`/app/integrations?error=gcalendar&reason=token_exchange`);
  }

  const me = await fetchUserInfo(grant.accessToken);

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const sub = me?.sub ?? 'unknown';
  const connectorId = `gcalendar::${state.t}::${sub}`;

  const authConfig: Record<string, unknown> = {
    access_token: grant.accessToken,
    refresh_token: grant.refreshToken,
    token_type: grant.tokenType,
    scope: grant.scope,
    access_token_expires_at: new Date(Date.now() + grant.expiresIn * 1000).toISOString(),
    google_sub: sub,
    email: me?.email ?? null,
    name: me?.name ?? null,
    picture: me?.picture ?? null,
    channels: [],
    granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: state.t,
    system: 'gcalendar',
    name: me?.email || sub,
    status: 'connected',
    auth_type: 'oauth_authorization_code',
    auth_config: authConfig,
    capabilities: {
      reads: ['calendars', 'events', 'freebusy'],
      writes: ['create_event', 'update_event', 'delete_event'],
      events: ['event.created', 'event.updated', 'event.deleted'],
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });

  if (error) { logger.error('GCalendar upsert failed', { error: error.message }); return res.redirect(`/app/integrations?error=gcalendar&reason=persist`); }

  invalidateGCalendarForTenant(state.t, state.w || null);

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: state.t, workspace_id: state.w || state.t,
    actor_id: state.u, actor_type: 'user',
    action: 'INTEGRATION_CONNECTED',
    entity_type: 'connector', entity_id: connectorId,
    metadata: { system: 'gcalendar', google_sub: sub, email: me?.email ?? null },
    occurred_at: now,
  }).then(() => {}, () => {});

  return res.redirect('/app/integrations?connected=gcalendar');
});

gcalendarOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await gcalendarForTenant(req.tenantId, req.workspaceId ?? null);
  if (resolved) {
    for (const ch of resolved.connector.channels) {
      try { await resolved.adapter.stopChannel(ch.channel_id, ch.resource_id); }
      catch (err) { logger.warn('GCal stopChannel failed', { error: String(err) }); }
    }
    if (resolved.connector.accessToken) await revokeToken(resolved.connector.accessToken);
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('connectors').update({ status: 'disconnected', updated_at: new Date().toISOString() }).eq('tenant_id', req.tenantId).eq('system', 'gcalendar');
  if (error) return res.status(500).json({ error: error.message });
  invalidateGCalendarForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

gcalendarOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('connectors').select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at').eq('tenant_id', req.tenantId).eq('system', 'gcalendar').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    google_sub: cfg.google_sub ?? null,
    email: cfg.email ?? null,
    name: cfg.name ?? null,
    picture: cfg.picture ?? null,
    scope: cfg.scope ?? null,
    channels: cfg.channels ?? [],
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});

gcalendarOAuthRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await gcalendarForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Google Calendar not connected' });
  try {
    const cals = await resolved.adapter.listCalendars(50);
    const primary = cals.find(c => c.primary) ?? cals[0];
    if (!primary) return res.json({ ok: true, calendars: 0, sample: [] });
    const events = await resolved.adapter.listEvents(primary.id, { maxResults: 5, timeMin: new Date().toISOString() });
    return res.json({
      ok: true,
      calendars: cals.length,
      primary: primary.id,
      sample: events.map(e => ({ id: e.id, summary: e.summary, start: e.start?.dateTime ?? e.start?.date, status: e.status })),
    });
  } catch (err: any) {
    return res.status(502).json({ error: 'Google Calendar API call failed', details: String(err?.message ?? err) });
  }
});

gcalendarOAuthRouter.get('/calendars', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await gcalendarForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Google Calendar not connected' });
  try {
    const calendars = await resolved.adapter.listCalendars(100);
    return res.json({ ok: true, calendars });
  } catch (err: any) {
    return res.status(502).json({ error: 'Google Calendar list failed', details: String(err?.message ?? err) });
  }
});

gcalendarOAuthRouter.post('/event', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await gcalendarForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Google Calendar not connected' });
  const calendarId = String(req.body?.calendar_id || 'primary');
  const summary = String(req.body?.summary || '').trim();
  const start = req.body?.start, end = req.body?.end;
  if (!summary || !start?.dateTime || !end?.dateTime) return res.status(400).json({ error: 'summary, start.dateTime and end.dateTime are required' });
  try {
    const event = await resolved.adapter.createEvent(calendarId, {
      summary, description: req.body?.description,
      start, end,
      attendees: req.body?.attendees,
      conferenceData: req.body?.create_meet ? { createRequest: { requestId: randomUUID() } } : undefined,
    });
    return res.json({ ok: true, event: { id: event.id, htmlLink: event.htmlLink, hangoutLink: event.hangoutLink } });
  } catch (err: any) {
    return res.status(502).json({ error: 'Google Calendar createEvent failed', details: String(err?.message ?? err) });
  }
});

gcalendarOAuthRouter.post('/freebusy', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await gcalendarForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Google Calendar not connected' });
  const timeMin = String(req.body?.time_min || '');
  const timeMax = String(req.body?.time_max || '');
  const calendarIds: string[] = Array.isArray(req.body?.calendar_ids) ? req.body.calendar_ids : ['primary'];
  if (!timeMin || !timeMax) return res.status(400).json({ error: 'time_min and time_max are required (ISO8601)' });
  try {
    const r = await resolved.adapter.freeBusy({ timeMin, timeMax, calendarIds, timeZone: req.body?.time_zone });
    return res.json({ ok: true, calendars: r });
  } catch (err: any) {
    return res.status(502).json({ error: 'Google Calendar freeBusy failed', details: String(err?.message ?? err) });
  }
});

gcalendarOAuthRouter.post('/watch', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await gcalendarForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Google Calendar not connected' });
  const base = publicBaseUrl();
  if (!base) return res.status(503).json({ error: 'PUBLIC_BASE_URL not configured' });
  const calendarId = String(req.body?.calendar_id || 'primary');
  const channelId = randomUUID();
  const token = generateChannelToken();
  try {
    const channel = await resolved.adapter.watchEvents(calendarId, {
      id: channelId,
      address: `${base}/webhooks/gcalendar`,
      token,
      ttlSeconds: 24 * 60 * 60, // 24h, max 1 week
    });
    const supabase = getSupabaseAdmin();
    const newEntry: GCalChannelEntry = {
      channel_id: channel.id,
      resource_id: channel.resourceId,
      calendar_id: calendarId,
      token,
      expiration: channel.expiration,
    };
    const merged = {
      ...resolved.connector.rawAuthConfig,
      channels: [...resolved.connector.channels, newEntry],
    };
    await supabase.from('connectors').update({ auth_config: merged, updated_at: new Date().toISOString() }).eq('id', resolved.connector.id);
    invalidateGCalendarForTenant(req.tenantId, req.workspaceId ?? null);
    return res.json({ ok: true, channel: newEntry });
  } catch (err: any) {
    return res.status(502).json({ error: 'Google Calendar watch failed', details: String(err?.message ?? err) });
  }
});

gcalendarOAuthRouter.post('/unwatch', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await gcalendarForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Google Calendar not connected' });
  const channelId = String(req.body?.channel_id || '');
  if (!channelId) return res.status(400).json({ error: 'channel_id is required' });
  const target = resolved.connector.channels.find(c => c.channel_id === channelId);
  if (!target) return res.status(404).json({ error: 'channel not found' });
  try {
    await resolved.adapter.stopChannel(target.channel_id, target.resource_id);
    const supabase = getSupabaseAdmin();
    const merged = { ...resolved.connector.rawAuthConfig, channels: resolved.connector.channels.filter(c => c.channel_id !== channelId) };
    await supabase.from('connectors').update({ auth_config: merged, updated_at: new Date().toISOString() }).eq('id', resolved.connector.id);
    invalidateGCalendarForTenant(req.tenantId, req.workspaceId ?? null);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(502).json({ error: String(err?.message ?? err) });
  }
});
