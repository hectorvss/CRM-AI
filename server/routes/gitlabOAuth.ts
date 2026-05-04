/**
 * server/routes/gitlabOAuth.ts
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { buildInstallUrl, signState, verifyState, exchangeCodeForToken, generatePkcePair, generateWebhookToken, type GitLabOAuthEnv } from '../integrations/gitlab-oauth.js';
import { gitlabForTenant, invalidateGitLabForTenant, type GitLabHookEntry } from '../integrations/gitlab-tenant.js';
import { GitLabAdapter } from '../integrations/gitlab.js';

export const gitlabOAuthRouter = Router();

const pkceStore = new Map<string, { verifier: string; expiresAt: number }>();
function purgePkce() { const now = Date.now(); for (const [k, v] of pkceStore) if (v.expiresAt < now) pkceStore.delete(k); }

function readEnv(): GitLabOAuthEnv | { error: string } {
  const clientId = process.env.GITLAB_CLIENT_ID;
  const clientSecret = process.env.GITLAB_CLIENT_SECRET;
  const stateSecret = process.env.GITLAB_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const baseUrl = process.env.GITLAB_BASE_URL || undefined;
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret) return { error: 'GitLab OAuth not configured' };
  if (!publicBase) return { error: 'PUBLIC_BASE_URL must be set' };
  if (!stateSecret) return { error: 'GITLAB_STATE_SECRET must be set' };
  return { clientId, clientSecret, stateSecret, baseUrl, redirectUri: `https://${publicBase}/api/integrations/gitlab/callback` };
}
function publicBaseUrl(): string { const b = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, ''); return b ? `https://${b}` : ''; }

gitlabOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
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

gitlabOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv(); if ('error' in env) return res.status(503).send(env.error);
  if (typeof req.query.error === 'string') return res.redirect(`/app/integrations?error=gitlab&reason=${encodeURIComponent(req.query.error)}`);
  const stateRaw = String(req.query.state || '');
  let state; try { state = verifyState(stateRaw, env); } catch { return res.status(401).send('Invalid state'); }
  const code = String(req.query.code || ''); if (!code) return res.status(400).send('Missing code');
  const pkce = pkceStore.get(stateRaw); pkceStore.delete(stateRaw);
  if (!pkce || pkce.expiresAt < Date.now()) return res.status(400).send('PKCE verifier expired');

  let grant; try { grant = await exchangeCodeForToken({ code, codeVerifier: pkce.verifier, env }); }
  catch (err) { logger.warn('GitLab token exchange failed', { error: String(err) }); return res.redirect(`/app/integrations?error=gitlab&reason=token_exchange`); }

  const adapter = new GitLabAdapter(grant.accessToken, env.baseUrl);
  let me: any = null; try { me = await adapter.me(); }
  catch (err) { logger.warn('GitLab me failed', { error: String(err) }); }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const userId = me?.id ?? 0;
  const connectorId = `gitlab::${state.t}::${userId}`;

  const authConfig: Record<string, unknown> = {
    access_token: grant.accessToken, refresh_token: grant.refreshToken,
    token_type: grant.tokenType, scope: grant.scope,
    access_token_expires_at: new Date((grant.createdAt + grant.expiresIn) * 1000).toISOString(),
    user_id: userId, username: me?.username ?? null, name: me?.name ?? null, email: me?.email ?? null,
    base_url: env.baseUrl ?? 'https://gitlab.com',
    hooks: [], granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId, tenant_id: state.t, system: 'gitlab', name: me?.username || `gitlab-${userId}`,
    status: 'connected', auth_type: 'oauth_authorization_code', auth_config: authConfig,
    capabilities: { reads: ['user', 'projects', 'issues', 'merge_requests', 'search'], writes: ['create_issue', 'update_issue', 'add_note'], events: ['Issue Hook', 'Note Hook', 'Merge Request Hook', 'Pipeline Hook', 'Push Hook'] },
    last_health_check_at: now, created_at: now, updated_at: now,
  }, { onConflict: 'id' });
  if (error) { logger.error('GitLab upsert failed', { error: error.message }); return res.redirect(`/app/integrations?error=gitlab&reason=persist`); }

  invalidateGitLabForTenant(state.t, state.w || null);
  await supabase.from('audit_events').insert({ id: randomUUID(), tenant_id: state.t, workspace_id: state.w || state.t, actor_id: state.u, actor_type: 'user', action: 'INTEGRATION_CONNECTED', entity_type: 'connector', entity_id: connectorId, metadata: { system: 'gitlab', user_id: userId, username: me?.username }, occurred_at: now }).then(() => {}, () => {});
  return res.redirect('/app/integrations?connected=gitlab');
});

gitlabOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await gitlabForTenant(req.tenantId, req.workspaceId ?? null);
  if (resolved) {
    for (const h of resolved.connector.hooks) {
      try { await resolved.adapter.deleteProjectHook(h.project_id, h.hook_id); } catch (err) { logger.warn('GitLab deleteHook failed', { error: String(err) }); }
    }
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('connectors').update({ status: 'disconnected', updated_at: new Date().toISOString() }).eq('tenant_id', req.tenantId).eq('system', 'gitlab');
  if (error) return res.status(500).json({ error: error.message });
  invalidateGitLabForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

gitlabOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('connectors').select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at').eq('tenant_id', req.tenantId).eq('system', 'gitlab').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    user_id: cfg.user_id ?? null, username: cfg.username ?? null, name: cfg.name ?? null, email: cfg.email ?? null,
    base_url: cfg.base_url ?? null, scope: cfg.scope ?? null,
    hooks: cfg.hooks ?? [],
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at, updated_at: data.updated_at,
  });
});

gitlabOAuthRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await gitlabForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'GitLab not connected' });
  try {
    const issues = await resolved.adapter.searchIssues('assigned_to_me', { state: 'opened', perPage: 5 });
    return res.json({ ok: true, issues_visible: issues.length, sample: issues.map(i => ({ iid: i.iid, project_id: i.project_id, title: i.title, state: i.state, url: i.web_url })) });
  } catch (err: any) { return res.status(502).json({ error: 'GitLab API call failed', details: String(err?.message ?? err) }); }
});

gitlabOAuthRouter.get('/projects', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await gitlabForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'GitLab not connected' });
  try { return res.json({ ok: true, projects: await resolved.adapter.listMyProjects({ perPage: 100, orderBy: 'last_activity_at', sort: 'desc', archived: false }) }); }
  catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});

gitlabOAuthRouter.post('/issue', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await gitlabForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'GitLab not connected' });
  const projectId = req.body?.project_id;
  const title = String(req.body?.title || '').trim();
  if (!projectId || !title) return res.status(400).json({ error: 'project_id and title required' });
  try {
    const issue = await resolved.adapter.createIssue(projectId, { title, description: req.body?.description, labels: req.body?.labels, assigneeIds: req.body?.assignee_ids });
    return res.json({ ok: true, issue: { iid: issue.iid, title: issue.title, url: issue.web_url } });
  } catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});

gitlabOAuthRouter.post('/register-webhook', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await gitlabForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'GitLab not connected' });
  const base = publicBaseUrl(); if (!base) return res.status(503).json({ error: 'PUBLIC_BASE_URL not configured' });
  const projectId = Number(req.body?.project_id);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'project_id required' });
  const callback = `${base}/webhooks/gitlab`;
  const token = generateWebhookToken();
  try {
    const hook = await resolved.adapter.createProjectHook(projectId, { url: callback, token, events: { issues: true, merge_requests: true, notes: true, pipelines: true } });
    const supabase = getSupabaseAdmin();
    const newEntry: GitLabHookEntry = { hook_id: hook.id, project_id: projectId, url: callback, token, events: ['issues', 'merge_requests', 'notes', 'pipelines'] };
    const merged = { ...resolved.connector.rawAuthConfig, hooks: [...resolved.connector.hooks, newEntry] };
    await supabase.from('connectors').update({ auth_config: merged, updated_at: new Date().toISOString() }).eq('id', resolved.connector.id);
    invalidateGitLabForTenant(req.tenantId, req.workspaceId ?? null);
    return res.json({ ok: true, hook: newEntry });
  } catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});
