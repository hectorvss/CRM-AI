/**
 * server/routes/salesforceOAuth.ts
 *
 *   GET  /api/integrations/salesforce/install   — redirect to Salesforce login
 *   GET  /api/integrations/salesforce/callback  — exchange code, persist
 *   POST /api/integrations/salesforce/disconnect
 *   GET  /api/integrations/salesforce/status
 *   POST /api/integrations/salesforce/sync       — list open cases as smoke test
 *   POST /api/integrations/salesforce/push-topic — create/update a streaming topic
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
  fetchIdentity,
  revokeToken,
  type SalesforceMode,
  type SalesforceOAuthEnv,
} from '../integrations/salesforce-oauth.js';
import { SalesforceAdapter } from '../integrations/salesforce.js';
import {
  salesforceForTenant,
  invalidateSalesforceForTenant,
} from '../integrations/salesforce-tenant.js';

export const salesforceOAuthRouter = Router();

function readEnv(): SalesforceOAuthEnv | { error: string } {
  const clientId = process.env.SALESFORCE_CLIENT_ID;
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
  const stateSecret = process.env.SALESFORCE_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret) return { error: 'Salesforce OAuth not configured: set SALESFORCE_CLIENT_ID and SALESFORCE_CLIENT_SECRET' };
  if (!publicBase) return { error: 'PUBLIC_BASE_URL must be set' };
  if (!stateSecret) return { error: 'SALESFORCE_STATE_SECRET must be set' };
  return {
    clientId,
    clientSecret,
    stateSecret,
    redirectUri: `https://${publicBase}/api/integrations/salesforce/callback`,
  };
}

salesforceOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).json({ error: env.error });
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });

  const mode: SalesforceMode = req.query.mode === 'sandbox' ? 'sandbox' : 'production';
  const state = signState({ t: req.tenantId, w: req.workspaceId ?? '', u: req.userId, m: mode }, env);
  const url = buildInstallUrl({ state, env, mode });

  if (req.headers.accept?.includes('application/json')) {
    return res.json({ url, state });
  }
  return res.redirect(url);
});

salesforceOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).send(env.error);

  const oauthError = typeof req.query.error === 'string' ? req.query.error : null;
  if (oauthError) {
    return res.redirect(`/app/integrations?error=salesforce&reason=${encodeURIComponent(oauthError)}`);
  }

  const stateRaw = String(req.query.state || '');
  let state;
  try {
    state = verifyState(stateRaw, env);
  } catch (err) {
    logger.warn('Salesforce callback: state invalid', { error: String(err) });
    return res.status(401).send('Invalid state');
  }

  const code = String(req.query.code || '');
  if (!code) return res.status(400).send('Missing code');

  let grant;
  try {
    grant = await exchangeCodeForToken({ code, mode: state.m, env });
  } catch (err: any) {
    logger.warn('Salesforce token exchange failed', { error: String(err) });
    return res.redirect(`/app/integrations?error=salesforce&reason=token_exchange`);
  }

  let identity;
  try {
    identity = await fetchIdentity(grant.identityUrl, grant.accessToken);
  } catch (err) {
    logger.warn('Salesforce identity fetch failed (continuing)', { error: String(err) });
    identity = { user_id: '', organization_id: '', email: null, display_name: null, username: null };
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `salesforce::${state.t}::${identity.organization_id || identity.user_id || 'unknown'}`;

  const authConfig = {
    mode: state.m,
    instance_url: grant.instanceUrl,
    identity_url: grant.identityUrl,
    access_token: grant.accessToken,
    refresh_token: grant.refreshToken,
    expires_at: grant.expiresAt,
    scope: grant.scope,
    organization_id: identity.organization_id,
    user_id: identity.user_id,
    email: identity.email,
    username: identity.username,
    display_name: identity.display_name,
    api_version: 'v59.0',
    push_topics: [] as string[],
    granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: state.t,
    system: 'salesforce',
    name: identity.display_name || identity.username || identity.email || identity.organization_id || 'Salesforce',
    status: 'connected',
    auth_type: 'oauth_authorization_code',
    auth_config: authConfig,
    capabilities: {
      reads: ['cases', 'contacts', 'accounts', 'leads', 'opportunities', 'tasks', 'notes', 'soql', 'sosl'],
      writes: ['create_case', 'comment_case', 'update_case', 'create_task', 'create_contact', 'upsert_external_id', 'composite'],
      streaming: ['push_topics', 'platform_events', 'change_data_capture'],
      mode: state.m,
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });

  if (error) {
    logger.error('Salesforce upsert failed', { error: error.message });
    return res.redirect(`/app/integrations?error=salesforce&reason=persist`);
  }

  invalidateSalesforceForTenant(state.t, state.w || null);

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: state.t,
    workspace_id: state.w || state.t,
    actor_id: state.u,
    actor_type: 'user',
    action: 'INTEGRATION_CONNECTED',
    entity_type: 'connector',
    entity_id: connectorId,
    metadata: { system: 'salesforce', mode: state.m, organization_id: identity.organization_id, instance_url: grant.instanceUrl },
    occurred_at: now,
  }).then(() => {}, () => {});

  return res.redirect('/app/integrations?connected=salesforce');
});

salesforceOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });

  const resolved = await salesforceForTenant(req.tenantId, req.workspaceId ?? null);
  if (resolved?.connector.cachedAccessToken) {
    await revokeToken(resolved.connector.cachedAccessToken, resolved.connector.mode);
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('connectors')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('tenant_id', req.tenantId)
    .eq('system', 'salesforce');
  if (error) return res.status(500).json({ error: error.message });
  invalidateSalesforceForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

salesforceOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'salesforce')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    mode: cfg.mode ?? null,
    instance_url: cfg.instance_url ?? null,
    organization_id: cfg.organization_id ?? null,
    user_id: cfg.user_id ?? null,
    email: cfg.email ?? null,
    username: cfg.username ?? null,
    display_name: cfg.display_name ?? null,
    api_version: cfg.api_version ?? null,
    push_topics: Array.isArray(cfg.push_topics) ? cfg.push_topics : [],
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});

salesforceOAuthRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await salesforceForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Salesforce not connected' });
  try {
    const cases = await resolved.adapter.listOpenCases({ limit: 5 });
    return res.json({
      ok: true,
      open_cases_visible: cases.totalSize,
      sample: cases.records.slice(0, 3),
    });
  } catch (err: any) {
    return res.status(502).json({
      error: 'Salesforce API call failed',
      details: err?.sfdcErrors?.[0]?.message ?? String(err?.message ?? err),
    });
  }
});

salesforceOAuthRouter.post('/push-topic', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await salesforceForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Salesforce not connected' });

  const name = String(req.body?.name || '').trim();
  const query = String(req.body?.query || '').trim();
  if (!name || !query) return res.status(400).json({ error: 'name and query required' });

  try {
    const topic = await resolved.adapter.upsertPushTopic({
      name,
      query,
      description: req.body?.description,
      notifyForOperations: req.body?.notify_for_operations,
      notifyForFields: req.body?.notify_for_fields,
    });

    const supabase = getSupabaseAdmin();
    const merged = {
      ...resolved.connector.rawAuthConfig,
      push_topics: Array.from(new Set([...(resolved.connector.pushTopics ?? []), name])),
    };
    await supabase
      .from('connectors')
      .update({ auth_config: merged, updated_at: new Date().toISOString() })
      .eq('id', resolved.connector.id);
    invalidateSalesforceForTenant(req.tenantId, req.workspaceId ?? null);

    return res.json({ ok: true, topic_id: topic.id, name });
  } catch (err: any) {
    return res.status(502).json({ error: String(err?.message ?? err) });
  }
});
