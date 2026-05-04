/**
 * server/routes/confluenceOAuth.ts
 *
 *   GET  /api/integrations/confluence/install
 *   GET  /api/integrations/confluence/callback
 *   POST /api/integrations/confluence/disconnect
 *   GET  /api/integrations/confluence/status
 *   POST /api/integrations/confluence/sync          — list 5 most recent pages
 *   GET  /api/integrations/confluence/spaces        — space picker
 *   GET  /api/integrations/confluence/pages         — page list (for ingest)
 *   POST /api/integrations/confluence/search        — CQL search (used by AI)
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
  listAccessibleResources,
  CONFLUENCE_SCOPES,
  type ConfluenceOAuthEnv,
} from '../integrations/confluence-oauth.js';
import {
  confluenceForTenant,
  invalidateConfluenceForTenant,
} from '../integrations/confluence-tenant.js';
import { ConfluenceAdapter } from '../integrations/confluence.js';

export const confluenceOAuthRouter = Router();

function readEnv(): ConfluenceOAuthEnv | { error: string } {
  const clientId = process.env.CONFLUENCE_CLIENT_ID;
  const clientSecret = process.env.CONFLUENCE_CLIENT_SECRET;
  const stateSecret = process.env.CONFLUENCE_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret) return { error: 'Confluence OAuth not configured: set CONFLUENCE_CLIENT_ID and CONFLUENCE_CLIENT_SECRET' };
  if (!publicBase) return { error: 'PUBLIC_BASE_URL must be set' };
  if (!stateSecret) return { error: 'CONFLUENCE_STATE_SECRET must be set' };
  return {
    clientId, clientSecret, stateSecret,
    redirectUri: `https://${publicBase}/api/integrations/confluence/callback`,
  };
}

confluenceOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).json({ error: env.error });
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });
  const state = signState({ t: req.tenantId, w: req.workspaceId ?? '', u: req.userId }, env);
  const url = buildInstallUrl({ state, env, scopes: CONFLUENCE_SCOPES });
  if (req.headers.accept?.includes('application/json')) return res.json({ url, state });
  return res.redirect(url);
});

confluenceOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).send(env.error);
  const oauthError = typeof req.query.error === 'string' ? req.query.error : null;
  if (oauthError) return res.redirect(`/app/integrations?error=confluence&reason=${encodeURIComponent(oauthError)}`);
  const stateRaw = String(req.query.state || '');
  let state;
  try { state = verifyState(stateRaw, env); }
  catch (err) {
    logger.warn('Confluence callback: state invalid', { error: String(err) });
    return res.status(401).send('Invalid state');
  }
  const code = String(req.query.code || '');
  if (!code) return res.status(400).send('Missing code');

  let grant;
  try { grant = await exchangeCodeForToken({ code, env }); }
  catch (err) {
    logger.warn('Confluence token exchange failed', { error: String(err) });
    return res.redirect(`/app/integrations?error=confluence&reason=token_exchange`);
  }

  let resources;
  try { resources = await listAccessibleResources(grant.accessToken); }
  catch (err) {
    logger.warn('Confluence accessible-resources failed', { error: String(err) });
    return res.redirect(`/app/integrations?error=confluence&reason=accessible_resources`);
  }
  const site = resources?.[0];
  if (!site) return res.redirect(`/app/integrations?error=confluence&reason=no_site`);

  const adapter = new ConfluenceAdapter(grant.accessToken, site.id);
  let me: any = null;
  try { me = await adapter.myself(); }
  catch (err) { logger.warn('Confluence myself fetch failed', { error: String(err) }); }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `confluence::${state.t}::${site.id}`;

  const authConfig: Record<string, unknown> = {
    access_token: grant.accessToken,
    refresh_token: grant.refreshToken,
    token_type: grant.tokenType,
    scope: grant.scope,
    access_token_expires_at: new Date(Date.now() + grant.expiresIn * 1000).toISOString(),
    cloud_id: site.id,
    site_name: site.name,
    site_url: site.url,
    site_avatar_url: site.avatarUrl,
    site_scopes: site.scopes,
    account_id: me?.accountId ?? null,
    account_email: me?.email ?? null,
    account_name: me?.displayName ?? null,
    granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: state.t,
    system: 'confluence',
    name: site.name || site.id,
    status: 'connected',
    auth_type: 'oauth_authorization_code',
    auth_config: authConfig,
    capabilities: {
      reads: ['myself', 'spaces', 'pages', 'page_body', 'search'],
      writes: [],
      events: [],
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });

  if (error) {
    logger.error('Confluence upsert failed', { error: error.message });
    return res.redirect(`/app/integrations?error=confluence&reason=persist`);
  }

  invalidateConfluenceForTenant(state.t, state.w || null);

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: state.t,
    workspace_id: state.w || state.t,
    actor_id: state.u,
    actor_type: 'user',
    action: 'INTEGRATION_CONNECTED',
    entity_type: 'connector',
    entity_id: connectorId,
    metadata: { system: 'confluence', cloud_id: site.id, site_name: site.name },
    occurred_at: now,
  }).then(() => {}, () => {});

  return res.redirect('/app/integrations?connected=confluence');
});

confluenceOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('connectors')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('tenant_id', req.tenantId)
    .eq('system', 'confluence');
  if (error) return res.status(500).json({ error: error.message });
  invalidateConfluenceForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

confluenceOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'confluence')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    cloud_id: cfg.cloud_id ?? null,
    site_name: cfg.site_name ?? null,
    site_url: cfg.site_url ?? null,
    account_email: cfg.account_email ?? null,
    account_name: cfg.account_name ?? null,
    scope: cfg.scope ?? null,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});

confluenceOAuthRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await confluenceForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Confluence not connected' });
  try {
    const r = await resolved.adapter.listPages({ limit: 5, bodyFormat: 'none' });
    return res.json({
      ok: true,
      pages_visible: r.pages.length,
      sample: r.pages.slice(0, 5).map(p => ({
        id: p.id, title: p.title, status: p.status, space_id: p.spaceId,
      })),
    });
  } catch (err: any) {
    return res.status(502).json({ error: 'Confluence API call failed', details: String(err?.message ?? err) });
  }
});

confluenceOAuthRouter.get('/spaces', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await confluenceForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Confluence not connected' });
  try {
    const r = await resolved.adapter.listSpaces({ limit: 100 });
    return res.json({ ok: true, spaces: r.spaces, next_cursor: r.nextCursor });
  } catch (err: any) {
    return res.status(502).json({ error: 'Confluence spaces failed', details: String(err?.message ?? err) });
  }
});

confluenceOAuthRouter.get('/pages', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await confluenceForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Confluence not connected' });
  const spaceId = typeof req.query.space_id === 'string' ? req.query.space_id : undefined;
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 250);
  const bodyFormat = (req.query.body_format === 'storage' || req.query.body_format === 'view') ? req.query.body_format : 'none';
  try {
    const r = await resolved.adapter.listPages({ spaceId, limit, cursor, bodyFormat });
    return res.json({ ok: true, pages: r.pages, next_cursor: r.nextCursor });
  } catch (err: any) {
    return res.status(502).json({ error: 'Confluence pages failed', details: String(err?.message ?? err) });
  }
});

confluenceOAuthRouter.post('/search', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await confluenceForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Confluence not connected' });
  const cql = String(req.body?.cql || '').trim();
  const limit = Math.min(Number(req.body?.limit) || 25, 100);
  if (!cql) return res.status(400).json({ error: 'cql is required' });
  try {
    const r = await resolved.adapter.search(cql, limit);
    return res.json({ ok: true, results: r });
  } catch (err: any) {
    return res.status(502).json({ error: 'Confluence search failed', details: String(err?.message ?? err) });
  }
});
