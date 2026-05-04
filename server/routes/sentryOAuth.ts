/**
 * server/routes/sentryOAuth.ts
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { buildInstallUrl, signState, verifyState, exchangeCodeForToken, type SentryOAuthEnv } from '../integrations/sentry-oauth.js';
import { sentryForTenant, invalidateSentryForTenant } from '../integrations/sentry-tenant.js';

export const sentryOAuthRouter = Router();

function readEnv(): SentryOAuthEnv | { error: string } {
  const clientId = process.env.SENTRY_CLIENT_ID;
  const clientSecret = process.env.SENTRY_CLIENT_SECRET;
  const stateSecret = process.env.SENTRY_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret) return { error: 'Sentry OAuth not configured' };
  if (!publicBase) return { error: 'PUBLIC_BASE_URL must be set' };
  if (!stateSecret) return { error: 'SENTRY_STATE_SECRET must be set' };
  return { clientId, clientSecret, stateSecret, redirectUri: `https://${publicBase}/api/integrations/sentry/callback` };
}

sentryOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv(); if ('error' in env) return res.status(503).json({ error: env.error });
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });
  const sentryAppSlug = process.env.SENTRY_APP_SLUG || '';
  if (!sentryAppSlug) return res.status(503).json({ error: 'SENTRY_APP_SLUG not set' });
  const state = signState({ t: req.tenantId, w: req.workspaceId ?? '', u: req.userId }, env);
  const url = buildInstallUrl({ state, sentryAppSlug });
  if (req.headers.accept?.includes('application/json')) return res.json({ url, state });
  return res.redirect(url);
});

sentryOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv(); if ('error' in env) return res.status(503).send(env.error);
  if (typeof req.query.error === 'string') return res.redirect(`/app/integrations?error=sentry&reason=${encodeURIComponent(req.query.error)}`);
  let state; try { state = verifyState(String(req.query.state || ''), env); } catch { return res.status(401).send('Invalid state'); }
  const code = String(req.query.code || '');
  const installationId = String(req.query.installationId || '');
  if (!code || !installationId) return res.status(400).send('Missing code or installationId');

  let grant; try { grant = await exchangeCodeForToken({ code, installationId, env }); }
  catch (err) { logger.warn('Sentry token exchange failed', { error: String(err) }); return res.redirect(`/app/integrations?error=sentry&reason=token_exchange`); }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `sentry::${state.t}::${installationId}`;

  const authConfig: Record<string, unknown> = {
    access_token: grant.accessToken, refresh_token: grant.refreshToken,
    scope: grant.scope, access_token_expires_at: grant.expiresAt,
    installation_id: installationId, granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId, tenant_id: state.t, system: 'sentry', name: `sentry-${installationId.slice(0, 8)}`,
    status: 'connected', auth_type: 'oauth_authorization_code', auth_config: authConfig,
    capabilities: { reads: ['organizations', 'projects', 'issues', 'events'], writes: ['resolve_issue', 'comment_on_issue', 'assign_issue'], events: ['issue.created', 'issue.resolved', 'event.alert', 'comment.created', 'installation.created', 'installation.deleted'] },
    last_health_check_at: now, created_at: now, updated_at: now,
  }, { onConflict: 'id' });
  if (error) { logger.error('Sentry upsert failed', { error: error.message }); return res.redirect(`/app/integrations?error=sentry&reason=persist`); }

  invalidateSentryForTenant(state.t, state.w || null);
  await supabase.from('audit_events').insert({ id: randomUUID(), tenant_id: state.t, workspace_id: state.w || state.t, actor_id: state.u, actor_type: 'user', action: 'INTEGRATION_CONNECTED', entity_type: 'connector', entity_id: connectorId, metadata: { system: 'sentry', installation_id: installationId }, occurred_at: now }).then(() => {}, () => {});
  return res.redirect('/app/integrations?connected=sentry');
});

sentryOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('connectors').update({ status: 'disconnected', updated_at: new Date().toISOString() }).eq('tenant_id', req.tenantId).eq('system', 'sentry');
  if (error) return res.status(500).json({ error: error.message });
  invalidateSentryForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

sentryOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('connectors').select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at').eq('tenant_id', req.tenantId).eq('system', 'sentry').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    installation_id: cfg.installation_id ?? null,
    organization_slug: cfg.organization_slug ?? null, organization_name: cfg.organization_name ?? null,
    scope: cfg.scope ?? null,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at, updated_at: data.updated_at,
  });
});

sentryOAuthRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await sentryForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Sentry not connected' });
  try {
    const orgs = await resolved.adapter.listOrganizations();
    const orgSlug = orgs[0]?.slug;
    if (!orgSlug) return res.json({ ok: true, orgs: 0, sample: [] });
    const issues = await resolved.adapter.listIssues(orgSlug, { query: 'is:unresolved', limit: 5 });
    return res.json({ ok: true, organization: orgSlug, issues_visible: issues.length, sample: issues.map(i => ({ id: i.id, short_id: i.shortId, title: i.title, level: i.level, count: i.count })) });
  } catch (err: any) { return res.status(502).json({ error: 'Sentry API call failed', details: String(err?.message ?? err) }); }
});

sentryOAuthRouter.post('/issue/resolve', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await sentryForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Sentry not connected' });
  const issueId = String(req.body?.issue_id || '');
  if (!issueId) return res.status(400).json({ error: 'issue_id required' });
  try { return res.json({ ok: true, issue: await resolved.adapter.resolveIssue(issueId) }); }
  catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});

sentryOAuthRouter.post('/issue/comment', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await sentryForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Sentry not connected' });
  const issueId = String(req.body?.issue_id || '');
  const text = String(req.body?.text || '');
  if (!issueId || !text) return res.status(400).json({ error: 'issue_id and text required' });
  try { return res.json({ ok: true, comment: await resolved.adapter.addIssueComment(issueId, text) }); }
  catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});
