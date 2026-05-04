/**
 * server/routes/pipedriveOAuth.ts
 *
 *   GET  /api/integrations/pipedrive/install
 *   GET  /api/integrations/pipedrive/callback
 *   POST /api/integrations/pipedrive/disconnect
 *   GET  /api/integrations/pipedrive/status
 *   POST /api/integrations/pipedrive/sync          — list 5 most recent open deals
 *   GET  /api/integrations/pipedrive/pipelines
 *   POST /api/integrations/pipedrive/deal           — create deal (used by AI)
 *   POST /api/integrations/pipedrive/person         — find-or-create person
 *   POST /api/integrations/pipedrive/register-webhooks
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { buildInstallUrl, signState, verifyState, exchangeCodeForToken, generateBasicCredentials, type PipedriveOAuthEnv } from '../integrations/pipedrive-oauth.js';
import { pipedriveForTenant, invalidatePipedriveForTenant, type PipedriveWebhookEntry } from '../integrations/pipedrive-tenant.js';
import { PipedriveAdapter } from '../integrations/pipedrive.js';

export const pipedriveOAuthRouter = Router();

function readEnv(): PipedriveOAuthEnv | { error: string } {
  const clientId = process.env.PIPEDRIVE_CLIENT_ID;
  const clientSecret = process.env.PIPEDRIVE_CLIENT_SECRET;
  const stateSecret = process.env.PIPEDRIVE_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret) return { error: 'Pipedrive OAuth not configured: set PIPEDRIVE_CLIENT_ID and PIPEDRIVE_CLIENT_SECRET' };
  if (!publicBase) return { error: 'PUBLIC_BASE_URL must be set' };
  if (!stateSecret) return { error: 'PIPEDRIVE_STATE_SECRET must be set' };
  return { clientId, clientSecret, stateSecret, redirectUri: `https://${publicBase}/api/integrations/pipedrive/callback` };
}
function publicBaseUrl(): string { const b = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, ''); return b ? `https://${b}` : ''; }

const DEFAULT_SUBSCRIPTIONS = [
  { event_action: 'added',   event_object: 'deal' },
  { event_action: 'updated', event_object: 'deal' },
  { event_action: 'deleted', event_object: 'deal' },
  { event_action: 'added',   event_object: 'person' },
  { event_action: 'updated', event_object: 'person' },
  { event_action: 'added',   event_object: 'organization' },
];

pipedriveOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv(); if ('error' in env) return res.status(503).json({ error: env.error });
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });
  const state = signState({ t: req.tenantId, w: req.workspaceId ?? '', u: req.userId }, env);
  const url = buildInstallUrl({ state, env });
  if (req.headers.accept?.includes('application/json')) return res.json({ url, state });
  return res.redirect(url);
});

pipedriveOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv(); if ('error' in env) return res.status(503).send(env.error);
  if (typeof req.query.error === 'string') return res.redirect(`/app/integrations?error=pipedrive&reason=${encodeURIComponent(req.query.error)}`);
  let state; try { state = verifyState(String(req.query.state || ''), env); } catch { return res.status(401).send('Invalid state'); }
  const code = String(req.query.code || ''); if (!code) return res.status(400).send('Missing code');
  let grant; try { grant = await exchangeCodeForToken({ code, env }); }
  catch (err) { logger.warn('Pipedrive token exchange failed', { error: String(err) }); return res.redirect(`/app/integrations?error=pipedrive&reason=token_exchange`); }

  if (!grant.apiDomain) {
    logger.warn('Pipedrive callback: api_domain not returned');
    return res.redirect(`/app/integrations?error=pipedrive&reason=no_api_domain`);
  }
  const adapter = new PipedriveAdapter(grant.accessToken, grant.apiDomain);
  let me: any = null; try { me = await adapter.me(); } catch (err) { logger.warn('Pipedrive me fetch failed', { error: String(err) }); }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const userId = me?.id ?? 0;
  const companyId = me?.company_id ?? 0;
  const connectorId = `pipedrive::${state.t}::${companyId}::${userId}`;

  const basic = generateBasicCredentials();

  // Auto-register webhooks
  const callback = `${publicBaseUrl()}/webhooks/pipedrive`;
  const webhooks: PipedriveWebhookEntry[] = [];
  let webhookError: string | null = null;
  if (callback) {
    for (const sub of DEFAULT_SUBSCRIPTIONS) {
      try {
        const wh = await adapter.createWebhook({ url: callback, eventAction: sub.event_action, eventObject: sub.event_object, httpAuthUser: basic.user, httpAuthPass: basic.pass });
        webhooks.push({ hook_id: wh.id, event_action: wh.event_action, event_object: wh.event_object, subscription_url: wh.subscription_url });
      } catch (err: any) {
        webhookError = String(err?.message ?? err);
        logger.warn('Pipedrive webhook auto-register failed', { sub, error: webhookError });
      }
    }
  }

  const authConfig: Record<string, unknown> = {
    access_token: grant.accessToken, refresh_token: grant.refreshToken,
    token_type: grant.tokenType, scope: grant.scope,
    access_token_expires_at: new Date(Date.now() + grant.expiresIn * 1000).toISOString(),
    api_domain: grant.apiDomain,
    user_id: userId, company_id: companyId,
    company_name: me?.company_name ?? null, company_domain: me?.company_domain ?? null,
    email: me?.email ?? null, name: me?.name ?? null,
    webhook_user: basic.user, webhook_pass: basic.pass,
    webhooks, webhook_error: webhookError, granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId, tenant_id: state.t, system: 'pipedrive', name: me?.company_name || `pipedrive-${companyId}`,
    status: 'connected', auth_type: 'oauth_authorization_code', auth_config: authConfig,
    capabilities: {
      reads: ['user', 'persons', 'orgs', 'deals', 'pipelines', 'stages', 'activities'],
      writes: ['create_person', 'update_person', 'create_org', 'create_deal', 'update_deal', 'create_activity', 'add_note'],
      events: DEFAULT_SUBSCRIPTIONS.map(s => `${s.event_object}.${s.event_action}`),
    },
    last_health_check_at: now, created_at: now, updated_at: now,
  }, { onConflict: 'id' });
  if (error) { logger.error('Pipedrive upsert failed', { error: error.message }); return res.redirect(`/app/integrations?error=pipedrive&reason=persist`); }

  invalidatePipedriveForTenant(state.t, state.w || null);
  await supabase.from('audit_events').insert({ id: randomUUID(), tenant_id: state.t, workspace_id: state.w || state.t, actor_id: state.u, actor_type: 'user', action: 'INTEGRATION_CONNECTED', entity_type: 'connector', entity_id: connectorId, metadata: { system: 'pipedrive', user_id: userId, company_id: companyId, webhooks: webhooks.length }, occurred_at: now }).then(() => {}, () => {});
  return res.redirect('/app/integrations?connected=pipedrive');
});

pipedriveOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await pipedriveForTenant(req.tenantId, req.workspaceId ?? null);
  if (resolved) {
    for (const wh of resolved.connector.webhooks) {
      try { await resolved.adapter.deleteWebhook(wh.hook_id); } catch (err) { logger.warn('Pipedrive deleteWebhook failed', { error: String(err) }); }
    }
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('connectors').update({ status: 'disconnected', updated_at: new Date().toISOString() }).eq('tenant_id', req.tenantId).eq('system', 'pipedrive');
  if (error) return res.status(500).json({ error: error.message });
  invalidatePipedriveForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

pipedriveOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('connectors').select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at').eq('tenant_id', req.tenantId).eq('system', 'pipedrive').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    user_id: cfg.user_id ?? null, company_id: cfg.company_id ?? null,
    company_name: cfg.company_name ?? null, company_domain: cfg.company_domain ?? null,
    api_domain: cfg.api_domain ?? null,
    email: cfg.email ?? null, name: cfg.name ?? null,
    scope: cfg.scope ?? null,
    webhooks: cfg.webhooks ?? [], webhook_error: cfg.webhook_error ?? null,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at, updated_at: data.updated_at,
  });
});

pipedriveOAuthRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await pipedriveForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Pipedrive not connected' });
  try {
    const deals = await resolved.adapter.listDeals({ status: 'open', limit: 5 });
    return res.json({
      ok: true,
      deals_visible: deals.length,
      sample: deals.map(d => ({ id: d.id, title: d.title, value: d.value, currency: d.currency, stage_id: d.stage_id, person: d.person_id?.name ?? null })),
    });
  } catch (err: any) { return res.status(502).json({ error: 'Pipedrive API call failed', details: String(err?.message ?? err) }); }
});

pipedriveOAuthRouter.get('/pipelines', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await pipedriveForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Pipedrive not connected' });
  try {
    const pipelines = await resolved.adapter.listPipelines();
    const stages = await resolved.adapter.listStages();
    return res.json({ ok: true, pipelines, stages });
  } catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});

pipedriveOAuthRouter.post('/deal', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await pipedriveForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Pipedrive not connected' });
  const title = String(req.body?.title || '').trim();
  if (!title) return res.status(400).json({ error: 'title is required' });
  try {
    const deal = await resolved.adapter.createDeal({
      title,
      value: req.body?.value, currency: req.body?.currency,
      person_id: req.body?.person_id, org_id: req.body?.org_id,
      stage_id: req.body?.stage_id, owner_id: req.body?.owner_id,
    });
    return res.json({ ok: true, deal: { id: deal.id, title: deal.title, value: deal.value, currency: deal.currency, status: deal.status } });
  } catch (err: any) { return res.status(502).json({ error: 'Pipedrive createDeal failed', details: String(err?.message ?? err) }); }
});

pipedriveOAuthRouter.post('/person', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await pipedriveForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Pipedrive not connected' });
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim();
  if (!name && !email) return res.status(400).json({ error: 'name or email is required' });
  try {
    if (email) {
      const found = await resolved.adapter.findPersonByEmail(email);
      if (found) return res.json({ ok: true, found: true, person: { id: found.id, name: found.name } });
    }
    const person = await resolved.adapter.createPerson({ name: name || email, email: email || undefined, phone: req.body?.phone, org_id: req.body?.org_id, owner_id: req.body?.owner_id });
    return res.json({ ok: true, found: false, person: { id: person.id, name: person.name } });
  } catch (err: any) { return res.status(502).json({ error: 'Pipedrive person failed', details: String(err?.message ?? err) }); }
});

pipedriveOAuthRouter.post('/register-webhooks', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await pipedriveForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Pipedrive not connected' });
  const base = publicBaseUrl(); if (!base) return res.status(503).json({ error: 'PUBLIC_BASE_URL not configured' });
  const callback = `${base}/webhooks/pipedrive`;

  try {
    // Delete existing
    for (const wh of resolved.connector.webhooks) {
      try { await resolved.adapter.deleteWebhook(wh.hook_id); } catch { /* ignore */ }
    }
    const basic = resolved.connector.webhookUser && resolved.connector.webhookPass
      ? { user: resolved.connector.webhookUser, pass: resolved.connector.webhookPass }
      : generateBasicCredentials();

    const fresh: PipedriveWebhookEntry[] = [];
    for (const sub of DEFAULT_SUBSCRIPTIONS) {
      const wh = await resolved.adapter.createWebhook({ url: callback, eventAction: sub.event_action, eventObject: sub.event_object, httpAuthUser: basic.user, httpAuthPass: basic.pass });
      fresh.push({ hook_id: wh.id, event_action: wh.event_action, event_object: wh.event_object, subscription_url: wh.subscription_url });
    }

    const supabase = getSupabaseAdmin();
    const merged = { ...resolved.connector.rawAuthConfig, webhook_user: basic.user, webhook_pass: basic.pass, webhooks: fresh, webhook_error: null };
    await supabase.from('connectors').update({ auth_config: merged, last_health_check_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', resolved.connector.id);
    invalidatePipedriveForTenant(req.tenantId, req.workspaceId ?? null);
    return res.json({ ok: true, webhooks: fresh });
  } catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});
