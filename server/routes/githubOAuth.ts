/**
 * server/routes/githubOAuth.ts
 *
 *   GET  /api/integrations/github/install
 *   GET  /api/integrations/github/callback
 *   POST /api/integrations/github/disconnect
 *   GET  /api/integrations/github/status
 *   POST /api/integrations/github/sync           — list 5 most recent issues across user repos
 *   GET  /api/integrations/github/repos          — repo picker
 *   POST /api/integrations/github/issue          — create an issue (used by AI)
 *   POST /api/integrations/github/register-webhook  — install webhook on a repo
 *   POST /api/integrations/github/unregister-webhook
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
  revokeToken,
  generateWebhookSecret,
  GITHUB_SCOPES,
  type GitHubOAuthEnv,
} from '../integrations/github-oauth.js';
import {
  githubForTenant,
  invalidateGitHubForTenant,
  type GitHubWebhookEntry,
} from '../integrations/github-tenant.js';
import { GitHubAdapter } from '../integrations/github.js';

export const githubOAuthRouter = Router();

function readEnv(): GitHubOAuthEnv | { error: string } {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const stateSecret = process.env.GITHUB_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret) return { error: 'GitHub OAuth not configured: set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET' };
  if (!publicBase) return { error: 'PUBLIC_BASE_URL must be set' };
  if (!stateSecret) return { error: 'GITHUB_STATE_SECRET must be set' };
  return {
    clientId, clientSecret, stateSecret,
    redirectUri: `https://${publicBase}/api/integrations/github/callback`,
  };
}

function publicBaseUrl(): string {
  const base = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  return base ? `https://${base}` : '';
}

const DEFAULT_WEBHOOK_EVENTS = ['issues', 'issue_comment', 'pull_request', 'pull_request_review', 'pull_request_review_comment', 'push', 'release'];

githubOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).json({ error: env.error });
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });
  const state = signState({ t: req.tenantId, w: req.workspaceId ?? '', u: req.userId }, env);
  const url = buildInstallUrl({ state, env, scopes: GITHUB_SCOPES });
  if (req.headers.accept?.includes('application/json')) return res.json({ url, state });
  return res.redirect(url);
});

githubOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).send(env.error);
  const oauthError = typeof req.query.error === 'string' ? req.query.error : null;
  if (oauthError) return res.redirect(`/app/integrations?error=github&reason=${encodeURIComponent(oauthError)}`);
  const stateRaw = String(req.query.state || '');
  let state;
  try { state = verifyState(stateRaw, env); }
  catch (err) {
    logger.warn('GitHub callback: state invalid', { error: String(err) });
    return res.status(401).send('Invalid state');
  }
  const code = String(req.query.code || '');
  if (!code) return res.status(400).send('Missing code');

  let grant;
  try { grant = await exchangeCodeForToken({ code, env }); }
  catch (err) {
    logger.warn('GitHub token exchange failed', { error: String(err) });
    return res.redirect(`/app/integrations?error=github&reason=token_exchange`);
  }

  const adapter = new GitHubAdapter(grant.accessToken);
  let me: any = null;
  let primaryEmail: string | null = null;
  try {
    me = await adapter.me();
    if (!me.email) {
      try {
        const emails = await adapter.myEmails();
        primaryEmail = emails.find(e => e.primary && e.verified)?.email ?? null;
      } catch { /* user:email scope might be missing */ }
    } else {
      primaryEmail = me.email;
    }
  } catch (err) {
    logger.warn('GitHub me fetch failed', { error: String(err) });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const userId = me?.id ?? 0;
  const connectorId = `github::${state.t}::${userId}`;

  const webhookSecret = generateWebhookSecret();

  const authConfig: Record<string, unknown> = {
    access_token: grant.accessToken,
    token_type: grant.tokenType,
    scope: grant.scope,
    user_id: userId,
    login: me?.login ?? null,
    name: me?.name ?? null,
    email: primaryEmail,
    avatar_url: me?.avatar_url ?? null,
    webhook_secret: webhookSecret,
    webhook_url: `${publicBaseUrl()}/webhooks/github`,
    webhooks: [],
    granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: state.t,
    system: 'github',
    name: me?.login || `user-${userId}`,
    status: 'connected',
    auth_type: 'oauth_authorization_code',
    auth_config: authConfig,
    capabilities: {
      reads: ['user', 'repos', 'issues', 'pulls', 'search', 'orgs'],
      writes: ['create_issue', 'update_issue', 'add_comment'],
      events: DEFAULT_WEBHOOK_EVENTS,
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });

  if (error) {
    logger.error('GitHub upsert failed', { error: error.message });
    return res.redirect(`/app/integrations?error=github&reason=persist`);
  }

  invalidateGitHubForTenant(state.t, state.w || null);

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: state.t,
    workspace_id: state.w || state.t,
    actor_id: state.u,
    actor_type: 'user',
    action: 'INTEGRATION_CONNECTED',
    entity_type: 'connector',
    entity_id: connectorId,
    metadata: { system: 'github', login: me?.login, user_id: userId },
    occurred_at: now,
  }).then(() => {}, () => {});

  return res.redirect('/app/integrations?connected=github');
});

githubOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const env = readEnv();
  const resolved = await githubForTenant(req.tenantId, req.workspaceId ?? null);
  if (resolved) {
    // best-effort: delete any registered webhooks
    for (const wh of resolved.connector.webhooks) {
      try {
        if (wh.scope === 'repo' && wh.repo) await resolved.adapter.deleteRepoWebhook(wh.owner, wh.repo, wh.hook_id);
        else if (wh.scope === 'org') await resolved.adapter.deleteOrgWebhook(wh.owner, wh.hook_id);
      } catch (err) { logger.warn('GitHub webhook delete failed', { hook_id: wh.hook_id, error: String(err) }); }
    }
    if (!('error' in env) && resolved.connector.accessToken) {
      try { await revokeToken({ accessToken: resolved.connector.accessToken, env }); } catch { /* ignore */ }
    }
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('connectors')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('tenant_id', req.tenantId)
    .eq('system', 'github');
  if (error) return res.status(500).json({ error: error.message });
  invalidateGitHubForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

githubOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'github')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    user_id: cfg.user_id ?? null,
    login: cfg.login ?? null,
    name: cfg.name ?? null,
    email: cfg.email ?? null,
    avatar_url: cfg.avatar_url ?? null,
    scope: cfg.scope ?? null,
    webhooks: cfg.webhooks ?? [],
    webhook_url: cfg.webhook_url ?? null,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});

githubOAuthRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await githubForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'GitHub not connected' });
  try {
    const r = await resolved.adapter.searchIssues(`is:issue is:open author:${resolved.connector.login}`, 5);
    return res.json({
      ok: true,
      total: r.total_count,
      sample: r.items.slice(0, 5).map(i => ({
        number: i.number, title: i.title, state: i.state, url: i.html_url,
      })),
    });
  } catch (err: any) {
    return res.status(502).json({ error: 'GitHub API call failed', details: String(err?.message ?? err) });
  }
});

githubOAuthRouter.get('/repos', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await githubForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'GitHub not connected' });
  try {
    const repos = await resolved.adapter.listMyRepos({ perPage: 100, sort: 'updated' });
    return res.json({
      ok: true,
      repos: repos.map(r => ({
        id: r.id, full_name: r.full_name, private: r.private, description: r.description, html_url: r.html_url, default_branch: r.default_branch,
      })),
    });
  } catch (err: any) {
    return res.status(502).json({ error: 'GitHub repos failed', details: String(err?.message ?? err) });
  }
});

githubOAuthRouter.post('/issue', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await githubForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'GitHub not connected' });
  const owner = String(req.body?.owner || '').trim();
  const repo  = String(req.body?.repo  || '').trim();
  const title = String(req.body?.title || '').trim();
  if (!owner || !repo || !title) return res.status(400).json({ error: 'owner, repo and title are required' });
  try {
    const issue = await resolved.adapter.createIssue(owner, repo, {
      title,
      body: req.body?.body,
      assignees: req.body?.assignees,
      labels: req.body?.labels,
    });
    return res.json({ ok: true, issue: { number: issue.number, title: issue.title, html_url: issue.html_url } });
  } catch (err: any) {
    return res.status(502).json({ error: 'GitHub createIssue failed', details: String(err?.message ?? err) });
  }
});

githubOAuthRouter.post('/register-webhook', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await githubForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'GitHub not connected' });
  const base = publicBaseUrl();
  if (!base) return res.status(503).json({ error: 'PUBLIC_BASE_URL not configured' });

  const owner = String(req.body?.owner || '').trim();
  const repo  = String(req.body?.repo  || '').trim();
  const orgScope = req.body?.scope === 'org';
  const events = Array.isArray(req.body?.events) && req.body.events.length ? req.body.events : DEFAULT_WEBHOOK_EVENTS;
  if (!owner) return res.status(400).json({ error: 'owner is required' });
  if (!orgScope && !repo) return res.status(400).json({ error: 'repo is required for repo scope' });

  const callback = `${base}/webhooks/github`;
  const secret = resolved.connector.webhookSecret || generateWebhookSecret();

  try {
    const wh = orgScope
      ? await resolved.adapter.createOrgWebhook(owner, { callbackUrl: callback, secret, events })
      : await resolved.adapter.createRepoWebhook(owner, repo, { callbackUrl: callback, secret, events });

    const supabase = getSupabaseAdmin();
    const newEntry: GitHubWebhookEntry = {
      hook_id: wh.id,
      scope: orgScope ? 'org' : 'repo',
      owner,
      repo: orgScope ? undefined : repo,
      events,
      url: callback,
    };
    const merged = {
      ...resolved.connector.rawAuthConfig,
      webhook_secret: secret,
      webhook_url: callback,
      webhooks: [...resolved.connector.webhooks, newEntry],
    };
    await supabase
      .from('connectors')
      .update({ auth_config: merged, last_health_check_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', resolved.connector.id);
    invalidateGitHubForTenant(req.tenantId, req.workspaceId ?? null);

    return res.json({ ok: true, hook: newEntry });
  } catch (err: any) {
    return res.status(502).json({ error: String(err?.message ?? err) });
  }
});

githubOAuthRouter.post('/unregister-webhook', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await githubForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'GitHub not connected' });
  const hookId = Number(req.body?.hook_id);
  if (!Number.isFinite(hookId)) return res.status(400).json({ error: 'hook_id is required' });

  const target = resolved.connector.webhooks.find(w => w.hook_id === hookId);
  if (!target) return res.status(404).json({ error: 'webhook not found' });

  try {
    if (target.scope === 'repo' && target.repo) await resolved.adapter.deleteRepoWebhook(target.owner, target.repo, hookId);
    else if (target.scope === 'org') await resolved.adapter.deleteOrgWebhook(target.owner, hookId);

    const supabase = getSupabaseAdmin();
    const merged = {
      ...resolved.connector.rawAuthConfig,
      webhooks: resolved.connector.webhooks.filter(w => w.hook_id !== hookId),
    };
    await supabase
      .from('connectors')
      .update({ auth_config: merged, updated_at: new Date().toISOString() })
      .eq('id', resolved.connector.id);
    invalidateGitHubForTenant(req.tenantId, req.workspaceId ?? null);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(502).json({ error: String(err?.message ?? err) });
  }
});
