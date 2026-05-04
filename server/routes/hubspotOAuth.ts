/**
 * server/routes/hubspotOAuth.ts
 *
 *   GET  /api/integrations/hubspot/install   — redirect to HubSpot consent
 *   GET  /api/integrations/hubspot/callback  — exchange code, persist
 *   POST /api/integrations/hubspot/disconnect
 *   GET  /api/integrations/hubspot/status
 *   POST /api/integrations/hubspot/sync       — list latest tickets
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
  introspectToken,
  HUBSPOT_SCOPES,
  type HubspotOAuthEnv,
} from '../integrations/hubspot-oauth.js';
import {
  hubspotForTenant,
  invalidateHubspotForTenant,
} from '../integrations/hubspot-tenant.js';

export const hubspotOAuthRouter = Router();

function readEnv(): HubspotOAuthEnv | { error: string } {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
  const stateSecret = process.env.HUBSPOT_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret) return { error: 'HubSpot OAuth not configured: set HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET' };
  if (!publicBase) return { error: 'PUBLIC_BASE_URL must be set' };
  if (!stateSecret) return { error: 'HUBSPOT_STATE_SECRET must be set' };
  return {
    clientId,
    clientSecret,
    stateSecret,
    redirectUri: `https://${publicBase}/api/integrations/hubspot/callback`,
    appId: process.env.HUBSPOT_APP_ID,
  };
}

hubspotOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).json({ error: env.error });
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });

  const state = signState({ t: req.tenantId, w: req.workspaceId ?? '', u: req.userId }, env);
  const url = buildInstallUrl({ state, env, scopes: HUBSPOT_SCOPES });

  if (req.headers.accept?.includes('application/json')) {
    return res.json({ url, state });
  }
  return res.redirect(url);
});

hubspotOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).send(env.error);

  const oauthError = typeof req.query.error === 'string' ? req.query.error : null;
  if (oauthError) {
    return res.redirect(`/app/integrations?error=hubspot&reason=${encodeURIComponent(oauthError)}`);
  }

  const stateRaw = String(req.query.state || '');
  let state;
  try {
    state = verifyState(stateRaw, env);
  } catch (err) {
    logger.warn('HubSpot callback: state invalid', { error: String(err) });
    return res.status(401).send('Invalid state');
  }

  const code = String(req.query.code || '');
  if (!code) return res.status(400).send('Missing code');

  let grant;
  try {
    grant = await exchangeCodeForToken({ code, env });
  } catch (err) {
    logger.warn('HubSpot token exchange failed', { error: String(err) });
    return res.redirect(`/app/integrations?error=hubspot&reason=token_exchange`);
  }

  let info;
  try {
    info = await introspectToken(grant.accessToken);
  } catch (err) {
    logger.warn('HubSpot introspect failed (continuing)', { error: String(err) });
    info = { hub_id: 0, user: '', user_id: 0, hub_domain: '', scopes: [], token_type: 'access', app_id: 0, expires_in: 0 };
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `hubspot::${state.t}::${info.hub_id || 'unknown'}`;

  const authConfig = {
    access_token: grant.accessToken,
    refresh_token: grant.refreshToken,
    expires_at: grant.expiresAt,
    hub_id: info.hub_id,
    app_id: info.app_id,
    hub_domain: info.hub_domain,
    user_email: info.user,
    user_id: info.user_id,
    scopes: info.scopes,
    granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: state.t,
    system: 'hubspot',
    name: info.hub_domain || `Hub ${info.hub_id}` || 'HubSpot',
    status: 'connected',
    auth_type: 'oauth_authorization_code',
    auth_config: authConfig,
    capabilities: {
      reads: ['contacts', 'companies', 'deals', 'tickets', 'line_items', 'products', 'owners', 'pipelines', 'conversations'],
      writes: ['create_contact', 'update_contact', 'upsert_contact', 'create_ticket', 'update_ticket', 'create_deal', 'send_inbox_reply', 'associate'],
      streaming: ['webhook_subscriptions'],
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });

  if (error) {
    logger.error('HubSpot upsert failed', { error: error.message });
    return res.redirect(`/app/integrations?error=hubspot&reason=persist`);
  }

  invalidateHubspotForTenant(state.t, state.w || null);

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: state.t,
    workspace_id: state.w || state.t,
    actor_id: state.u,
    actor_type: 'user',
    action: 'INTEGRATION_CONNECTED',
    entity_type: 'connector',
    entity_id: connectorId,
    metadata: { system: 'hubspot', hub_id: info.hub_id, hub_domain: info.hub_domain, scopes: info.scopes },
    occurred_at: now,
  }).then(() => {}, () => {});

  return res.redirect('/app/integrations?connected=hubspot');
});

hubspotOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('connectors')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('tenant_id', req.tenantId)
    .eq('system', 'hubspot');
  if (error) return res.status(500).json({ error: error.message });
  invalidateHubspotForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

hubspotOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'hubspot')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    hub_id: cfg.hub_id ?? null,
    hub_domain: cfg.hub_domain ?? null,
    user_email: cfg.user_email ?? null,
    user_id: cfg.user_id ?? null,
    scopes: Array.isArray(cfg.scopes) ? cfg.scopes : [],
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});

hubspotOAuthRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await hubspotForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'HubSpot not connected' });
  try {
    const tickets = await resolved.adapter.listOpenTickets({ limit: 5 });
    return res.json({
      ok: true,
      open_tickets_visible: tickets.total,
      sample: tickets.results.slice(0, 3),
    });
  } catch (err: any) {
    return res.status(502).json({
      error: 'HubSpot API call failed',
      details: String(err?.message ?? err),
    });
  }
});
