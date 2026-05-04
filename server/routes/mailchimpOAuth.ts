/**
 * server/routes/mailchimpOAuth.ts
 *
 *   GET  /api/integrations/mailchimp/install
 *   GET  /api/integrations/mailchimp/callback
 *   POST /api/integrations/mailchimp/disconnect
 *   GET  /api/integrations/mailchimp/status
 *   POST /api/integrations/mailchimp/sync          — list 5 most recent campaigns
 *   GET  /api/integrations/mailchimp/lists         — audience picker
 *   POST /api/integrations/mailchimp/subscribe     — upsert member (used by AI)
 *   POST /api/integrations/mailchimp/tag           — add tag to member
 *   POST /api/integrations/mailchimp/register-webhook — register webhook on a list
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { buildInstallUrl, signState, verifyState, exchangeCodeForToken, fetchMetadata, generateWebhookToken, type MailchimpOAuthEnv } from '../integrations/mailchimp-oauth.js';
import { mailchimpForTenant, invalidateMailchimpForTenant, type MailchimpWebhookEntry } from '../integrations/mailchimp-tenant.js';
import { MailchimpAdapter } from '../integrations/mailchimp.js';

export const mailchimpOAuthRouter = Router();

function readEnv(): MailchimpOAuthEnv | { error: string } {
  const clientId = process.env.MAILCHIMP_CLIENT_ID;
  const clientSecret = process.env.MAILCHIMP_CLIENT_SECRET;
  const stateSecret = process.env.MAILCHIMP_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret) return { error: 'Mailchimp OAuth not configured: set MAILCHIMP_CLIENT_ID and MAILCHIMP_CLIENT_SECRET' };
  if (!publicBase) return { error: 'PUBLIC_BASE_URL must be set' };
  if (!stateSecret) return { error: 'MAILCHIMP_STATE_SECRET must be set' };
  return { clientId, clientSecret, stateSecret, redirectUri: `https://${publicBase}/api/integrations/mailchimp/callback` };
}
function publicBaseUrl(): string { const b = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, ''); return b ? `https://${b}` : ''; }

mailchimpOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv(); if ('error' in env) return res.status(503).json({ error: env.error });
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });
  const state = signState({ t: req.tenantId, w: req.workspaceId ?? '', u: req.userId }, env);
  const url = buildInstallUrl({ state, env });
  if (req.headers.accept?.includes('application/json')) return res.json({ url, state });
  return res.redirect(url);
});

mailchimpOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv(); if ('error' in env) return res.status(503).send(env.error);
  if (typeof req.query.error === 'string') return res.redirect(`/app/integrations?error=mailchimp&reason=${encodeURIComponent(req.query.error)}`);
  let state; try { state = verifyState(String(req.query.state || ''), env); } catch { return res.status(401).send('Invalid state'); }
  const code = String(req.query.code || ''); if (!code) return res.status(400).send('Missing code');
  let grant; try { grant = await exchangeCodeForToken({ code, env }); }
  catch (err) { logger.warn('Mailchimp token exchange failed', { error: String(err) }); return res.redirect(`/app/integrations?error=mailchimp&reason=token_exchange`); }

  let metadata;
  try { metadata = await fetchMetadata(grant.accessToken); }
  catch (err) { logger.warn('Mailchimp metadata fetch failed', { error: String(err) }); return res.redirect(`/app/integrations?error=mailchimp&reason=metadata`); }

  const adapter = new MailchimpAdapter(grant.accessToken, metadata.api_endpoint);
  let account: any = null; try { account = await adapter.account(); } catch (err) { logger.warn('Mailchimp account fetch failed', { error: String(err) }); }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const userId = metadata.user_id;
  const connectorId = `mailchimp::${state.t}::${userId}`;
  const webhookToken = generateWebhookToken();

  const authConfig: Record<string, unknown> = {
    access_token: grant.accessToken,
    token_type: grant.tokenType, scope: grant.scope ?? null,
    user_id: userId,
    account_id: account?.account_id ?? null,
    account_name: account?.account_name ?? metadata.accountname ?? null,
    email: metadata.login?.email ?? account?.email ?? null,
    dc: metadata.dc, api_endpoint: metadata.api_endpoint,
    role: metadata.role,
    webhook_token: webhookToken, webhooks: [],
    granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId, tenant_id: state.t, system: 'mailchimp', name: account?.account_name || metadata.accountname || `mailchimp-${userId}`,
    status: 'connected', auth_type: 'oauth_authorization_code', auth_config: authConfig,
    capabilities: {
      reads: ['account', 'lists', 'members', 'campaigns'],
      writes: ['upsert_member', 'add_tag', 'unsubscribe'],
      events: ['subscribe', 'unsubscribe', 'profile', 'cleaned', 'upemail', 'campaign'],
    },
    last_health_check_at: now, created_at: now, updated_at: now,
  }, { onConflict: 'id' });
  if (error) { logger.error('Mailchimp upsert failed', { error: error.message }); return res.redirect(`/app/integrations?error=mailchimp&reason=persist`); }

  invalidateMailchimpForTenant(state.t, state.w || null);
  await supabase.from('audit_events').insert({ id: randomUUID(), tenant_id: state.t, workspace_id: state.w || state.t, actor_id: state.u, actor_type: 'user', action: 'INTEGRATION_CONNECTED', entity_type: 'connector', entity_id: connectorId, metadata: { system: 'mailchimp', user_id: userId, dc: metadata.dc, account_id: account?.account_id ?? null }, occurred_at: now }).then(() => {}, () => {});
  return res.redirect('/app/integrations?connected=mailchimp');
});

mailchimpOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await mailchimpForTenant(req.tenantId, req.workspaceId ?? null);
  if (resolved) {
    for (const wh of resolved.connector.webhooks) {
      try { await resolved.adapter.deleteWebhook(wh.list_id, wh.webhook_id); } catch (err) { logger.warn('Mailchimp webhook delete failed', { error: String(err) }); }
    }
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('connectors').update({ status: 'disconnected', updated_at: new Date().toISOString() }).eq('tenant_id', req.tenantId).eq('system', 'mailchimp');
  if (error) return res.status(500).json({ error: error.message });
  invalidateMailchimpForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

mailchimpOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('connectors').select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at').eq('tenant_id', req.tenantId).eq('system', 'mailchimp').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    user_id: cfg.user_id ?? null,
    account_id: cfg.account_id ?? null, account_name: cfg.account_name ?? null,
    email: cfg.email ?? null, dc: cfg.dc ?? null, api_endpoint: cfg.api_endpoint ?? null,
    webhooks: cfg.webhooks ?? [],
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at, updated_at: data.updated_at,
  });
});

mailchimpOAuthRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await mailchimpForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Mailchimp not connected' });
  try {
    const lists = await resolved.adapter.listLists({ count: 5 });
    const campaigns = await resolved.adapter.listCampaigns({ count: 5 }).catch(() => []);
    return res.json({
      ok: true,
      lists_visible: lists.length,
      campaigns_visible: campaigns.length,
      sample_lists: lists.map(l => ({ id: l.id, name: l.name, members: l.stats.member_count })),
      sample_campaigns: campaigns.map(c => ({ id: c.id, type: c.type, status: c.status, subject: c.settings.subject_line, sent: c.emails_sent ?? 0 })),
    });
  } catch (err: any) { return res.status(502).json({ error: 'Mailchimp API call failed', details: String(err?.message ?? err) }); }
});

mailchimpOAuthRouter.get('/lists', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await mailchimpForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Mailchimp not connected' });
  try { const lists = await resolved.adapter.listLists({ count: 100 }); return res.json({ ok: true, lists }); }
  catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});

mailchimpOAuthRouter.post('/subscribe', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await mailchimpForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Mailchimp not connected' });
  const listId = String(req.body?.list_id || '').trim();
  const email = String(req.body?.email || '').trim();
  if (!listId || !email) return res.status(400).json({ error: 'list_id and email are required' });
  try {
    const member = await resolved.adapter.upsertMember(listId, {
      email,
      status: req.body?.status,
      merge_fields: req.body?.merge_fields,
      tags: req.body?.tags,
    });
    return res.json({ ok: true, member: { id: member.id, email: member.email_address, status: member.status } });
  } catch (err: any) { return res.status(502).json({ error: 'Mailchimp upsertMember failed', details: String(err?.message ?? err) }); }
});

mailchimpOAuthRouter.post('/tag', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await mailchimpForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Mailchimp not connected' });
  const listId = String(req.body?.list_id || '').trim();
  const email  = String(req.body?.email || '').trim();
  const tag    = String(req.body?.tag || '').trim();
  if (!listId || !email || !tag) return res.status(400).json({ error: 'list_id, email and tag are required' });
  try { await resolved.adapter.addTagToMember(listId, email, tag); return res.json({ ok: true }); }
  catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});

mailchimpOAuthRouter.post('/register-webhook', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await mailchimpForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Mailchimp not connected' });
  const base = publicBaseUrl(); if (!base) return res.status(503).json({ error: 'PUBLIC_BASE_URL not configured' });
  const listId = String(req.body?.list_id || '').trim();
  if (!listId) return res.status(400).json({ error: 'list_id is required' });

  const token = resolved.connector.webhookToken;
  if (!token) return res.status(503).json({ error: 'webhook_token missing — re-connect Mailchimp' });

  const url = `${base}/webhooks/mailchimp/${token}`;
  try {
    const wh = await resolved.adapter.createWebhook(listId, { url });
    const supabase = getSupabaseAdmin();
    const newEntry: MailchimpWebhookEntry = { webhook_id: wh.id, list_id: listId, url };
    const merged = { ...resolved.connector.rawAuthConfig, webhooks: [...resolved.connector.webhooks, newEntry] };
    await supabase.from('connectors').update({ auth_config: merged, updated_at: new Date().toISOString() }).eq('id', resolved.connector.id);
    invalidateMailchimpForTenant(req.tenantId, req.workspaceId ?? null);
    return res.json({ ok: true, webhook: newEntry });
  } catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});
