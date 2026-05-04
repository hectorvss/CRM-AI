/**
 * server/routes/zoomOAuth.ts
 *
 *   GET  /api/integrations/zoom/install
 *   GET  /api/integrations/zoom/callback
 *   POST /api/integrations/zoom/disconnect
 *   GET  /api/integrations/zoom/status
 *   POST /api/integrations/zoom/sync         — list 5 upcoming meetings
 *   POST /api/integrations/zoom/meeting       — create meeting (used by AI)
 *   GET  /api/integrations/zoom/recordings    — list recent cloud recordings
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { buildInstallUrl, signState, verifyState, exchangeCodeForToken, type ZoomOAuthEnv } from '../integrations/zoom-oauth.js';
import { zoomForTenant, invalidateZoomForTenant } from '../integrations/zoom-tenant.js';
import { ZoomAdapter } from '../integrations/zoom.js';

export const zoomOAuthRouter = Router();

function readEnv(): ZoomOAuthEnv | { error: string } {
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  const stateSecret = process.env.ZOOM_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const webhookSecretToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret) return { error: 'Zoom OAuth not configured: set ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET' };
  if (!publicBase) return { error: 'PUBLIC_BASE_URL must be set' };
  if (!stateSecret) return { error: 'ZOOM_STATE_SECRET must be set' };
  return { clientId, clientSecret, stateSecret, webhookSecretToken, redirectUri: `https://${publicBase}/api/integrations/zoom/callback` };
}

zoomOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv(); if ('error' in env) return res.status(503).json({ error: env.error });
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });
  const state = signState({ t: req.tenantId, w: req.workspaceId ?? '', u: req.userId }, env);
  const url = buildInstallUrl({ state, env });
  if (req.headers.accept?.includes('application/json')) return res.json({ url, state });
  return res.redirect(url);
});

zoomOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv(); if ('error' in env) return res.status(503).send(env.error);
  if (typeof req.query.error === 'string') return res.redirect(`/app/integrations?error=zoom&reason=${encodeURIComponent(req.query.error)}`);
  let state; try { state = verifyState(String(req.query.state || ''), env); } catch { return res.status(401).send('Invalid state'); }
  const code = String(req.query.code || ''); if (!code) return res.status(400).send('Missing code');
  let grant; try { grant = await exchangeCodeForToken({ code, env }); }
  catch (err) { logger.warn('Zoom token exchange failed', { error: String(err) }); return res.redirect(`/app/integrations?error=zoom&reason=token_exchange`); }

  const adapter = new ZoomAdapter(grant.accessToken);
  let me: any = null; try { me = await adapter.me(); } catch (err) { logger.warn('Zoom me fetch failed', { error: String(err) }); }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const userId = me?.id ?? 'unknown';
  const accountId = me?.account_id ?? null;
  const connectorId = `zoom::${state.t}::${userId}`;

  const authConfig: Record<string, unknown> = {
    access_token: grant.accessToken, refresh_token: grant.refreshToken,
    token_type: grant.tokenType, scope: grant.scope,
    access_token_expires_at: new Date(Date.now() + grant.expiresIn * 1000).toISOString(),
    zoom_user_id: userId, account_id: accountId,
    email: me?.email ?? null, name: me ? `${me?.first_name ?? ''} ${me?.last_name ?? ''}`.trim() : null,
    timezone: me?.timezone ?? null,
    granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId, tenant_id: state.t, system: 'zoom', name: me?.email || userId,
    status: 'connected', auth_type: 'oauth_authorization_code', auth_config: authConfig,
    capabilities: {
      reads: ['user', 'meetings', 'recordings', 'transcripts'],
      writes: ['create_meeting', 'update_meeting', 'delete_meeting'],
      events: ['meeting.started', 'meeting.ended', 'recording.completed', 'recording.transcript_completed'],
    },
    last_health_check_at: now, created_at: now, updated_at: now,
  }, { onConflict: 'id' });
  if (error) { logger.error('Zoom upsert failed', { error: error.message }); return res.redirect(`/app/integrations?error=zoom&reason=persist`); }

  invalidateZoomForTenant(state.t, state.w || null);
  await supabase.from('audit_events').insert({ id: randomUUID(), tenant_id: state.t, workspace_id: state.w || state.t, actor_id: state.u, actor_type: 'user', action: 'INTEGRATION_CONNECTED', entity_type: 'connector', entity_id: connectorId, metadata: { system: 'zoom', user_id: userId, account_id: accountId }, occurred_at: now }).then(() => {}, () => {});
  return res.redirect('/app/integrations?connected=zoom');
});

zoomOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('connectors').update({ status: 'disconnected', updated_at: new Date().toISOString() }).eq('tenant_id', req.tenantId).eq('system', 'zoom');
  if (error) return res.status(500).json({ error: error.message });
  invalidateZoomForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

zoomOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('connectors').select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at').eq('tenant_id', req.tenantId).eq('system', 'zoom').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    zoom_user_id: cfg.zoom_user_id ?? null, account_id: cfg.account_id ?? null,
    email: cfg.email ?? null, name: cfg.name ?? null, timezone: cfg.timezone ?? null,
    scope: cfg.scope ?? null,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at, updated_at: data.updated_at,
  });
});

zoomOAuthRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await zoomForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Zoom not connected' });
  try {
    const meetings = await resolved.adapter.listMeetings({ type: 'upcoming', pageSize: 5 });
    return res.json({
      ok: true,
      meetings_visible: meetings.length,
      sample: meetings.slice(0, 5).map(m => ({ id: m.id, topic: m.topic, start_time: m.start_time, duration: m.duration, join_url: m.join_url })),
    });
  } catch (err: any) { return res.status(502).json({ error: 'Zoom API call failed', details: String(err?.message ?? err) }); }
});

zoomOAuthRouter.post('/meeting', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await zoomForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Zoom not connected' });
  const topic = String(req.body?.topic || '').trim();
  if (!topic) return res.status(400).json({ error: 'topic is required' });
  try {
    const meeting = await resolved.adapter.createMeeting({
      topic,
      type: 2,
      start_time: req.body?.start_time,
      duration: req.body?.duration ?? 30,
      timezone: req.body?.timezone,
      agenda: req.body?.agenda,
      settings: { auto_recording: req.body?.auto_recording ?? 'cloud' },
    });
    return res.json({ ok: true, meeting: { id: meeting.id, topic: meeting.topic, join_url: meeting.join_url, start_time: meeting.start_time } });
  } catch (err: any) { return res.status(502).json({ error: 'Zoom createMeeting failed', details: String(err?.message ?? err) }); }
});

zoomOAuthRouter.get('/recordings', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await zoomForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Zoom not connected' });
  const from = typeof req.query.from === 'string' ? req.query.from : new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  try {
    const r = await resolved.adapter.listMyRecordings({ from, pageSize: 30 });
    return res.json({ ok: true, recordings: r.recordings, next_page_token: r.next_page_token ?? null });
  } catch (err: any) { return res.status(502).json({ error: 'Zoom recordings failed', details: String(err?.message ?? err) }); }
});
