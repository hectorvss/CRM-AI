/**
 * server/routes/gdriveOAuth.ts
 *
 *   GET  /api/integrations/gdrive/install
 *   GET  /api/integrations/gdrive/callback
 *   POST /api/integrations/gdrive/disconnect
 *   GET  /api/integrations/gdrive/status
 *   POST /api/integrations/gdrive/sync         — list 5 most recent files
 *   GET  /api/integrations/gdrive/files
 *   POST /api/integrations/gdrive/watch        — watch the changes feed
 *   POST /api/integrations/gdrive/unwatch
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import {
  buildInstallUrl, signState, verifyState, exchangeCodeForToken, revokeToken, fetchUserInfo, generateChannelToken,
  GOOGLE_DRIVE_SCOPES, type GoogleOAuthEnv,
} from '../integrations/google-oauth.js';
import { gdriveForTenant, invalidateGDriveForTenant, type GDriveChannelEntry } from '../integrations/gdrive-tenant.js';

export const gdriveOAuthRouter = Router();

function readEnv(): GoogleOAuthEnv | { error: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const stateSecret = process.env.GOOGLE_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret) return { error: 'Google OAuth not configured: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET' };
  if (!publicBase) return { error: 'PUBLIC_BASE_URL must be set' };
  if (!stateSecret) return { error: 'GOOGLE_STATE_SECRET must be set' };
  return { clientId, clientSecret, stateSecret, redirectUri: `https://${publicBase}/api/integrations/gdrive/callback` };
}
function publicBaseUrl(): string { const b = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, ''); return b ? `https://${b}` : ''; }

gdriveOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv(); if ('error' in env) return res.status(503).json({ error: env.error });
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });
  const state = signState({ t: req.tenantId, w: req.workspaceId ?? '', u: req.userId }, env);
  const url = buildInstallUrl({ state, env, scopes: GOOGLE_DRIVE_SCOPES });
  if (req.headers.accept?.includes('application/json')) return res.json({ url, state });
  return res.redirect(url);
});

gdriveOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv(); if ('error' in env) return res.status(503).send(env.error);
  if (typeof req.query.error === 'string') return res.redirect(`/app/integrations?error=gdrive&reason=${encodeURIComponent(req.query.error)}`);
  let state;
  try { state = verifyState(String(req.query.state || ''), env); }
  catch { return res.status(401).send('Invalid state'); }
  const code = String(req.query.code || ''); if (!code) return res.status(400).send('Missing code');
  let grant;
  try { grant = await exchangeCodeForToken({ code, env }); }
  catch (err) { logger.warn('GDrive token exchange failed', { error: String(err) }); return res.redirect(`/app/integrations?error=gdrive&reason=token_exchange`); }

  const me = await fetchUserInfo(grant.accessToken);
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const sub = me?.sub ?? 'unknown';
  const connectorId = `gdrive::${state.t}::${sub}`;

  const authConfig: Record<string, unknown> = {
    access_token: grant.accessToken, refresh_token: grant.refreshToken,
    token_type: grant.tokenType, scope: grant.scope,
    access_token_expires_at: new Date(Date.now() + grant.expiresIn * 1000).toISOString(),
    google_sub: sub, email: me?.email ?? null, name: me?.name ?? null, picture: me?.picture ?? null,
    channels: [], granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId, tenant_id: state.t, system: 'gdrive', name: me?.email || sub,
    status: 'connected', auth_type: 'oauth_authorization_code', auth_config: authConfig,
    capabilities: { reads: ['files', 'about', 'download', 'export', 'changes'], writes: [], events: ['changes'] },
    last_health_check_at: now, created_at: now, updated_at: now,
  }, { onConflict: 'id' });
  if (error) { logger.error('GDrive upsert failed', { error: error.message }); return res.redirect(`/app/integrations?error=gdrive&reason=persist`); }

  invalidateGDriveForTenant(state.t, state.w || null);
  await supabase.from('audit_events').insert({ id: randomUUID(), tenant_id: state.t, workspace_id: state.w || state.t, actor_id: state.u, actor_type: 'user', action: 'INTEGRATION_CONNECTED', entity_type: 'connector', entity_id: connectorId, metadata: { system: 'gdrive', google_sub: sub, email: me?.email ?? null }, occurred_at: now }).then(() => {}, () => {});
  return res.redirect('/app/integrations?connected=gdrive');
});

gdriveOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await gdriveForTenant(req.tenantId, req.workspaceId ?? null);
  if (resolved) {
    for (const ch of resolved.connector.channels) {
      try { await resolved.adapter.stopChannel(ch.channel_id, ch.resource_id); } catch (err) { logger.warn('GDrive stopChannel failed', { error: String(err) }); }
    }
    if (resolved.connector.accessToken) await revokeToken(resolved.connector.accessToken);
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('connectors').update({ status: 'disconnected', updated_at: new Date().toISOString() }).eq('tenant_id', req.tenantId).eq('system', 'gdrive');
  if (error) return res.status(500).json({ error: error.message });
  invalidateGDriveForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

gdriveOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('connectors').select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at').eq('tenant_id', req.tenantId).eq('system', 'gdrive').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    google_sub: cfg.google_sub ?? null, email: cfg.email ?? null, name: cfg.name ?? null,
    scope: cfg.scope ?? null, channels: cfg.channels ?? [],
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at, updated_at: data.updated_at,
  });
});

gdriveOAuthRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await gdriveForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Google Drive not connected' });
  try {
    const r = await resolved.adapter.listFiles({ pageSize: 5, orderBy: 'modifiedTime desc' });
    return res.json({
      ok: true,
      files_visible: r.files.length,
      sample: r.files.map(f => ({ id: f.id, name: f.name, mime: f.mimeType, modified: f.modifiedTime })),
    });
  } catch (err: any) { return res.status(502).json({ error: 'Google Drive API call failed', details: String(err?.message ?? err) }); }
});

gdriveOAuthRouter.get('/files', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await gdriveForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Google Drive not connected' });
  try {
    const r = await resolved.adapter.listFiles({ q: typeof req.query.q === 'string' ? req.query.q : undefined, pageToken: typeof req.query.page_token === 'string' ? req.query.page_token : undefined, pageSize: Math.min(Number(req.query.limit) || 50, 200) });
    return res.json({ ok: true, files: r.files, next_page_token: r.nextPageToken ?? null });
  } catch (err: any) { return res.status(502).json({ error: 'Google Drive list failed', details: String(err?.message ?? err) }); }
});

gdriveOAuthRouter.post('/watch', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await gdriveForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Google Drive not connected' });
  const base = publicBaseUrl(); if (!base) return res.status(503).json({ error: 'PUBLIC_BASE_URL not configured' });
  try {
    const { startPageToken } = await resolved.adapter.getStartPageToken();
    const channelId = randomUUID();
    const token = generateChannelToken();
    const ch = await resolved.adapter.watchChanges({ pageToken: startPageToken, channelId, address: `${base}/webhooks/gdrive`, token, ttlSeconds: 24 * 60 * 60 });
    const supabase = getSupabaseAdmin();
    const newEntry: GDriveChannelEntry = { channel_id: ch.id, resource_id: ch.resourceId, page_token: startPageToken, token, expiration: ch.expiration };
    const merged = { ...resolved.connector.rawAuthConfig, channels: [...resolved.connector.channels, newEntry] };
    await supabase.from('connectors').update({ auth_config: merged, updated_at: new Date().toISOString() }).eq('id', resolved.connector.id);
    invalidateGDriveForTenant(req.tenantId, req.workspaceId ?? null);
    return res.json({ ok: true, channel: newEntry });
  } catch (err: any) { return res.status(502).json({ error: 'Google Drive watch failed', details: String(err?.message ?? err) }); }
});

gdriveOAuthRouter.post('/unwatch', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await gdriveForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Google Drive not connected' });
  const channelId = String(req.body?.channel_id || '');
  const target = resolved.connector.channels.find(c => c.channel_id === channelId);
  if (!target) return res.status(404).json({ error: 'channel not found' });
  try {
    await resolved.adapter.stopChannel(target.channel_id, target.resource_id);
    const supabase = getSupabaseAdmin();
    const merged = { ...resolved.connector.rawAuthConfig, channels: resolved.connector.channels.filter(c => c.channel_id !== channelId) };
    await supabase.from('connectors').update({ auth_config: merged, updated_at: new Date().toISOString() }).eq('id', resolved.connector.id);
    invalidateGDriveForTenant(req.tenantId, req.workspaceId ?? null);
    return res.json({ ok: true });
  } catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});
