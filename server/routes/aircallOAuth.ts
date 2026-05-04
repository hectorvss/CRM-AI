/**
 * server/routes/aircallOAuth.ts
 *
 *   GET  /api/integrations/aircall/install
 *   GET  /api/integrations/aircall/callback
 *   POST /api/integrations/aircall/disconnect
 *   GET  /api/integrations/aircall/status
 *   POST /api/integrations/aircall/sync          — list 5 most recent calls
 *   GET  /api/integrations/aircall/numbers
 *   POST /api/integrations/aircall/comment       — add internal note to a call
 *   POST /api/integrations/aircall/register-webhook
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
  type AircallOAuthEnv,
} from '../integrations/aircall-oauth.js';
import {
  aircallForTenant,
  invalidateAircallForTenant,
} from '../integrations/aircall-tenant.js';
import { AircallAdapter } from '../integrations/aircall.js';

export const aircallOAuthRouter = Router();

function readEnv(): AircallOAuthEnv | { error: string } {
  const clientId = process.env.AIRCALL_CLIENT_ID;
  const clientSecret = process.env.AIRCALL_CLIENT_SECRET;
  const stateSecret = process.env.AIRCALL_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret) return { error: 'Aircall OAuth not configured: set AIRCALL_CLIENT_ID and AIRCALL_CLIENT_SECRET' };
  if (!publicBase) return { error: 'PUBLIC_BASE_URL must be set' };
  if (!stateSecret) return { error: 'AIRCALL_STATE_SECRET must be set' };
  return { clientId, clientSecret, stateSecret, redirectUri: `https://${publicBase}/api/integrations/aircall/callback` };
}

function publicBaseUrl(): string {
  const base = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  return base ? `https://${base}` : '';
}

const DEFAULT_WEBHOOK_EVENTS = [
  'call.created',
  'call.ringing_on_agent',
  'call.answered',
  'call.transferred',
  'call.unanswered',
  'call.hungup',
  'call.commented',
  'call.tagged',
  'call.voicemail_left',
  'call.recording_available',
  'call.transcription_available',
];

aircallOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).json({ error: env.error });
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });
  const state = signState({ t: req.tenantId, w: req.workspaceId ?? '', u: req.userId }, env);
  const url = buildInstallUrl({ state, env });
  if (req.headers.accept?.includes('application/json')) return res.json({ url, state });
  return res.redirect(url);
});

aircallOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).send(env.error);
  const oauthError = typeof req.query.error === 'string' ? req.query.error : null;
  if (oauthError) return res.redirect(`/app/integrations?error=aircall&reason=${encodeURIComponent(oauthError)}`);
  const stateRaw = String(req.query.state || '');
  let state;
  try { state = verifyState(stateRaw, env); }
  catch (err) {
    logger.warn('Aircall callback: state invalid', { error: String(err) });
    return res.status(401).send('Invalid state');
  }
  const code = String(req.query.code || '');
  if (!code) return res.status(400).send('Missing code');

  let grant;
  try { grant = await exchangeCodeForToken({ code, env }); }
  catch (err) {
    logger.warn('Aircall token exchange failed', { error: String(err) });
    return res.redirect(`/app/integrations?error=aircall&reason=token_exchange`);
  }

  const adapter = new AircallAdapter(grant.accessToken);
  let me: any = null;
  try { me = await adapter.me(); }
  catch (err) { logger.warn('Aircall me fetch failed', { error: String(err) }); }

  const callback = `${publicBaseUrl()}/webhooks/aircall`;
  let webhookId: string | null = null;
  let webhookToken: string | null = null;
  let webhookError: string | null = null;
  if (publicBaseUrl()) {
    try {
      const wh = await adapter.createWebhook({ url: callback, events: DEFAULT_WEBHOOK_EVENTS });
      webhookId = wh.webhook_id;
      webhookToken = wh.token;
    } catch (err: any) {
      webhookError = String(err?.message ?? err);
      logger.warn('Aircall webhook auto-register failed', { error: webhookError });
    }
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const integration = me?.integration ?? {};
  const integrationId = integration.id ?? 0;
  const connectorId = `aircall::${state.t}::${integrationId}`;

  const authConfig: Record<string, unknown> = {
    access_token: grant.accessToken,
    token_type: grant.tokenType,
    scope: grant.scope,
    integration_id: integrationId,
    integration_name: integration.name ?? null,
    company_id: integration.company_id ?? null,
    company_name: integration.company_name ?? null,
    webhook_id: webhookId,
    webhook_token: webhookToken,
    webhook_url: webhookId ? callback : null,
    webhook_events: DEFAULT_WEBHOOK_EVENTS,
    webhook_error: webhookError,
    granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: state.t,
    system: 'aircall',
    name: integration.name || `aircall-${integrationId}`,
    status: 'connected',
    auth_type: 'oauth_authorization_code',
    auth_config: authConfig,
    capabilities: {
      reads: ['integrations.me', 'numbers', 'users', 'calls', 'transcription', 'contacts'],
      writes: ['add_call_tag', 'add_call_comment'],
      events: DEFAULT_WEBHOOK_EVENTS,
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });

  if (error) {
    logger.error('Aircall upsert failed', { error: error.message });
    return res.redirect(`/app/integrations?error=aircall&reason=persist`);
  }

  invalidateAircallForTenant(state.t, state.w || null);

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: state.t,
    workspace_id: state.w || state.t,
    actor_id: state.u,
    actor_type: 'user',
    action: 'INTEGRATION_CONNECTED',
    entity_type: 'connector',
    entity_id: connectorId,
    metadata: { system: 'aircall', integration_id: integrationId, company_name: integration.company_name ?? null, webhook_id: webhookId },
    occurred_at: now,
  }).then(() => {}, () => {});

  return res.redirect('/app/integrations?connected=aircall');
});

aircallOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await aircallForTenant(req.tenantId, req.workspaceId ?? null);
  if (resolved?.connector.webhookId) {
    try { await resolved.adapter.deleteWebhook(resolved.connector.webhookId); }
    catch (err) { logger.warn('Aircall webhook delete failed', { error: String(err) }); }
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('connectors')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('tenant_id', req.tenantId)
    .eq('system', 'aircall');
  if (error) return res.status(500).json({ error: error.message });
  invalidateAircallForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

aircallOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'aircall')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    integration_id: cfg.integration_id ?? null,
    integration_name: cfg.integration_name ?? null,
    company_id: cfg.company_id ?? null,
    company_name: cfg.company_name ?? null,
    scope: cfg.scope ?? null,
    webhook_id: cfg.webhook_id ?? null,
    webhook_url: cfg.webhook_url ?? null,
    webhook_registered: Boolean(cfg.webhook_id),
    webhook_error: cfg.webhook_error ?? null,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});

aircallOAuthRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await aircallForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Aircall not connected' });
  try {
    const calls = await resolved.adapter.listCalls({ perPage: 5 });
    return res.json({
      ok: true,
      calls_visible: calls.length,
      sample: calls.slice(0, 5).map(c => ({
        id: c.id, direction: c.direction, status: c.status, duration: c.duration,
        recording: !!c.recording, voicemail: !!c.voicemail,
        number: c.number?.digits ?? null, user: c.user?.email ?? null,
      })),
    });
  } catch (err: any) {
    return res.status(502).json({ error: 'Aircall API call failed', details: String(err?.message ?? err) });
  }
});

aircallOAuthRouter.get('/numbers', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await aircallForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Aircall not connected' });
  try {
    const numbers = await resolved.adapter.listNumbers({ perPage: 100 });
    return res.json({ ok: true, numbers });
  } catch (err: any) {
    return res.status(502).json({ error: 'Aircall numbers failed', details: String(err?.message ?? err) });
  }
});

aircallOAuthRouter.post('/comment', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await aircallForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Aircall not connected' });
  const callId = Number(req.body?.call_id);
  const content = String(req.body?.content || '').trim();
  if (!Number.isFinite(callId) || !content) return res.status(400).json({ error: 'call_id and content are required' });
  try {
    await resolved.adapter.addCallComment(callId, content);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(502).json({ error: 'Aircall addCallComment failed', details: String(err?.message ?? err) });
  }
});

aircallOAuthRouter.post('/register-webhook', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await aircallForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Aircall not connected' });
  const base = publicBaseUrl();
  if (!base) return res.status(503).json({ error: 'PUBLIC_BASE_URL not configured' });

  try {
    if (resolved.connector.webhookId) {
      try { await resolved.adapter.deleteWebhook(resolved.connector.webhookId); } catch { /* ignore */ }
    }
    const callback = `${base}/webhooks/aircall`;
    const wh = await resolved.adapter.createWebhook({ url: callback, events: DEFAULT_WEBHOOK_EVENTS });

    const supabase = getSupabaseAdmin();
    const merged = {
      ...resolved.connector.rawAuthConfig,
      webhook_id: wh.webhook_id,
      webhook_token: wh.token,
      webhook_url: callback,
      webhook_events: DEFAULT_WEBHOOK_EVENTS,
      webhook_error: null,
    };
    await supabase
      .from('connectors')
      .update({ auth_config: merged, last_health_check_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', resolved.connector.id);
    invalidateAircallForTenant(req.tenantId, req.workspaceId ?? null);

    return res.json({ ok: true, webhook_id: wh.webhook_id, webhook_url: callback });
  } catch (err: any) {
    return res.status(502).json({ error: String(err?.message ?? err) });
  }
});
