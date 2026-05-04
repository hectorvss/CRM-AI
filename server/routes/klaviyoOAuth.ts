/**
 * server/routes/klaviyoOAuth.ts
 */

import { Router, Request, Response } from 'express';
import { randomBytes, randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { buildInstallUrl, signState, verifyState, exchangeCodeForToken, generatePkcePair, type KlaviyoOAuthEnv } from '../integrations/klaviyo-oauth.js';
import { klaviyoForTenant, invalidateKlaviyoForTenant, type KlaviyoWebhookEntry } from '../integrations/klaviyo-tenant.js';
import { KlaviyoAdapter } from '../integrations/klaviyo.js';

export const klaviyoOAuthRouter = Router();

// PKCE verifier store keyed by state — lives in memory for the duration of the OAuth dance.
const pkceStore = new Map<string, { verifier: string; expiresAt: number }>();
function purgePkce() { const now = Date.now(); for (const [k, v] of pkceStore) if (v.expiresAt < now) pkceStore.delete(k); }

function readEnv(): KlaviyoOAuthEnv | { error: string } {
  const clientId = process.env.KLAVIYO_CLIENT_ID;
  const clientSecret = process.env.KLAVIYO_CLIENT_SECRET;
  const stateSecret = process.env.KLAVIYO_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret) return { error: 'Klaviyo OAuth not configured' };
  if (!publicBase) return { error: 'PUBLIC_BASE_URL must be set' };
  if (!stateSecret) return { error: 'KLAVIYO_STATE_SECRET must be set' };
  return { clientId, clientSecret, stateSecret, redirectUri: `https://${publicBase}/api/integrations/klaviyo/callback` };
}
function publicBaseUrl(): string { const b = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, ''); return b ? `https://${b}` : ''; }

const DEFAULT_TOPICS = [
  'profile.created', 'profile.updated', 'profile.subscribed_to_email', 'profile.unsubscribed_from_email',
  'profile.subscribed_to_sms', 'profile.unsubscribed_from_sms',
];

klaviyoOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv(); if ('error' in env) return res.status(503).json({ error: env.error });
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });
  purgePkce();
  const state = signState({ t: req.tenantId, w: req.workspaceId ?? '', u: req.userId }, env);
  const { codeVerifier, codeChallenge } = generatePkcePair();
  pkceStore.set(state, { verifier: codeVerifier, expiresAt: Date.now() + 10 * 60_000 });
  const url = buildInstallUrl({ state, env, codeChallenge });
  if (req.headers.accept?.includes('application/json')) return res.json({ url, state });
  return res.redirect(url);
});

klaviyoOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv(); if ('error' in env) return res.status(503).send(env.error);
  if (typeof req.query.error === 'string') return res.redirect(`/app/integrations?error=klaviyo&reason=${encodeURIComponent(req.query.error)}`);
  const stateRaw = String(req.query.state || '');
  let state; try { state = verifyState(stateRaw, env); } catch { return res.status(401).send('Invalid state'); }
  const code = String(req.query.code || ''); if (!code) return res.status(400).send('Missing code');

  const pkce = pkceStore.get(stateRaw);
  pkceStore.delete(stateRaw);
  if (!pkce || pkce.expiresAt < Date.now()) return res.status(400).send('PKCE verifier expired');

  let grant; try { grant = await exchangeCodeForToken({ code, codeVerifier: pkce.verifier, env }); }
  catch (err) { logger.warn('Klaviyo token exchange failed', { error: String(err) }); return res.redirect(`/app/integrations?error=klaviyo&reason=token_exchange`); }

  const adapter = new KlaviyoAdapter(grant.accessToken);
  // No /me — derive a stable id from token signature
  const accountId = randomBytes(8).toString('hex');

  // Auto-register webhooks for default topics
  const callback = `${publicBaseUrl()}/webhooks/klaviyo`;
  const webhooks: KlaviyoWebhookEntry[] = [];
  let webhookError: string | null = null;
  if (callback) {
    try {
      const secret = randomBytes(32).toString('hex');
      const wh = await adapter.createWebhook({ url: callback, name: 'Clain default', topics: DEFAULT_TOPICS, secret });
      webhooks.push({ webhook_id: wh.id, url: callback, topics: DEFAULT_TOPICS, secret });
    } catch (err: any) { webhookError = String(err?.message ?? err); logger.warn('Klaviyo webhook auto-register failed', { error: webhookError }); }
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `klaviyo::${state.t}::${accountId}`;

  const authConfig: Record<string, unknown> = {
    access_token: grant.accessToken, refresh_token: grant.refreshToken,
    token_type: grant.tokenType, scope: grant.scope,
    access_token_expires_at: new Date(Date.now() + grant.expiresIn * 1000).toISOString(),
    account_id: accountId,
    webhooks, webhook_error: webhookError, granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId, tenant_id: state.t, system: 'klaviyo', name: `klaviyo-${accountId}`,
    status: 'connected', auth_type: 'oauth_authorization_code', auth_config: authConfig,
    capabilities: { reads: ['profiles', 'lists', 'segments', 'campaigns', 'flows', 'metrics'], writes: ['upsert_profile', 'subscribe', 'track_event', 'add_to_list', 'remove_from_list'], events: DEFAULT_TOPICS },
    last_health_check_at: now, created_at: now, updated_at: now,
  }, { onConflict: 'id' });
  if (error) { logger.error('Klaviyo upsert failed', { error: error.message }); return res.redirect(`/app/integrations?error=klaviyo&reason=persist`); }

  invalidateKlaviyoForTenant(state.t, state.w || null);
  await supabase.from('audit_events').insert({ id: randomUUID(), tenant_id: state.t, workspace_id: state.w || state.t, actor_id: state.u, actor_type: 'user', action: 'INTEGRATION_CONNECTED', entity_type: 'connector', entity_id: connectorId, metadata: { system: 'klaviyo', webhooks: webhooks.length }, occurred_at: now }).then(() => {}, () => {});
  return res.redirect('/app/integrations?connected=klaviyo');
});

klaviyoOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await klaviyoForTenant(req.tenantId, req.workspaceId ?? null);
  if (resolved) {
    for (const wh of resolved.connector.webhooks) {
      try { await resolved.adapter.deleteWebhook(wh.webhook_id); } catch (err) { logger.warn('Klaviyo deleteWebhook failed', { error: String(err) }); }
    }
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('connectors').update({ status: 'disconnected', updated_at: new Date().toISOString() }).eq('tenant_id', req.tenantId).eq('system', 'klaviyo');
  if (error) return res.status(500).json({ error: error.message });
  invalidateKlaviyoForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

klaviyoOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('connectors').select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at').eq('tenant_id', req.tenantId).eq('system', 'klaviyo').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    account_id: cfg.account_id ?? null, scope: cfg.scope ?? null,
    webhooks: cfg.webhooks ?? [], webhook_error: cfg.webhook_error ?? null,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at, updated_at: data.updated_at,
  });
});

klaviyoOAuthRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await klaviyoForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Klaviyo not connected' });
  try {
    const lists = await resolved.adapter.listLists(5);
    return res.json({ ok: true, lists_visible: lists.length, sample: lists.map(l => ({ id: l.id, name: l.attributes.name })) });
  } catch (err: any) { return res.status(502).json({ error: 'Klaviyo API call failed', details: String(err?.message ?? err) }); }
});

klaviyoOAuthRouter.get('/lists', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await klaviyoForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Klaviyo not connected' });
  try { return res.json({ ok: true, lists: await resolved.adapter.listLists(100) }); }
  catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});

klaviyoOAuthRouter.post('/profile', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await klaviyoForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Klaviyo not connected' });
  const email = String(req.body?.email || '').trim();
  if (!email) return res.status(400).json({ error: 'email is required' });
  try {
    const profile = await resolved.adapter.upsertProfile(email, { phone: req.body?.phone, firstName: req.body?.first_name, lastName: req.body?.last_name, properties: req.body?.properties });
    return res.json({ ok: true, profile: { id: profile.id, email: profile.attributes.email } });
  } catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});

klaviyoOAuthRouter.post('/event', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await klaviyoForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Klaviyo not connected' });
  const metric = String(req.body?.metric || '').trim();
  const profileEmail = String(req.body?.email || '').trim();
  if (!metric || !profileEmail) return res.status(400).json({ error: 'metric and email are required' });
  try {
    await resolved.adapter.trackEvent({ metric, profileEmail, properties: req.body?.properties, time: req.body?.time, uniqueId: req.body?.unique_id, value: req.body?.value });
    return res.json({ ok: true });
  } catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});
