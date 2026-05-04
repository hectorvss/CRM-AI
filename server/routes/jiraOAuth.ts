/**
 * server/routes/jiraOAuth.ts
 *
 *   GET  /api/integrations/jira/install
 *   GET  /api/integrations/jira/callback
 *   POST /api/integrations/jira/disconnect
 *   GET  /api/integrations/jira/status
 *   POST /api/integrations/jira/sync          — list 5 most recently updated issues
 *   GET  /api/integrations/jira/projects      — project picker
 *   POST /api/integrations/jira/issue          — create an issue (used by AI)
 *   POST /api/integrations/jira/register-webhook
 *   POST /api/integrations/jira/refresh-webhook  — extend the 30-day expiry
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
  generateWebhookToken,
  JIRA_SCOPES,
  type JiraOAuthEnv,
} from '../integrations/jira-oauth.js';
import {
  jiraForTenant,
  invalidateJiraForTenant,
} from '../integrations/jira-tenant.js';
import { JiraAdapter } from '../integrations/jira.js';

export const jiraOAuthRouter = Router();

function readEnv(): JiraOAuthEnv | { error: string } {
  const clientId = process.env.JIRA_CLIENT_ID;
  const clientSecret = process.env.JIRA_CLIENT_SECRET;
  const stateSecret = process.env.JIRA_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret) return { error: 'Jira OAuth not configured: set JIRA_CLIENT_ID and JIRA_CLIENT_SECRET' };
  if (!publicBase) return { error: 'PUBLIC_BASE_URL must be set' };
  if (!stateSecret) return { error: 'JIRA_STATE_SECRET must be set' };
  return {
    clientId,
    clientSecret,
    stateSecret,
    redirectUri: `https://${publicBase}/api/integrations/jira/callback`,
  };
}

function publicBaseUrl(): string {
  const base = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  return base ? `https://${base}` : '';
}

const DEFAULT_WEBHOOK_EVENTS = [
  'jira:issue_created',
  'jira:issue_updated',
  'jira:issue_deleted',
  'comment_created',
  'comment_updated',
  'comment_deleted',
];

jiraOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).json({ error: env.error });
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });

  const state = signState({ t: req.tenantId, w: req.workspaceId ?? '', u: req.userId }, env);
  const url = buildInstallUrl({ state, env, scopes: JIRA_SCOPES });

  if (req.headers.accept?.includes('application/json')) return res.json({ url, state });
  return res.redirect(url);
});

jiraOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).send(env.error);

  const oauthError = typeof req.query.error === 'string' ? req.query.error : null;
  if (oauthError) {
    return res.redirect(`/app/integrations?error=jira&reason=${encodeURIComponent(oauthError)}`);
  }
  const stateRaw = String(req.query.state || '');
  let state;
  try { state = verifyState(stateRaw, env); }
  catch (err) {
    logger.warn('Jira callback: state invalid', { error: String(err) });
    return res.status(401).send('Invalid state');
  }
  const code = String(req.query.code || '');
  if (!code) return res.status(400).send('Missing code');

  let grant;
  try { grant = await exchangeCodeForToken({ code, env }); }
  catch (err) {
    logger.warn('Jira token exchange failed', { error: String(err) });
    return res.redirect(`/app/integrations?error=jira&reason=token_exchange`);
  }

  // Resolve cloudid (site) — pin the first authorised site.
  let resources;
  try { resources = await listAccessibleResources(grant.accessToken); }
  catch (err) {
    logger.warn('Jira accessible-resources failed', { error: String(err) });
    return res.redirect(`/app/integrations?error=jira&reason=accessible_resources`);
  }
  const site = resources?.[0];
  if (!site) {
    return res.redirect(`/app/integrations?error=jira&reason=no_site`);
  }

  const adapter = new JiraAdapter(grant.accessToken, site.id);
  let me: any = null;
  try { me = await adapter.myself(); }
  catch (err) { logger.warn('Jira myself fetch failed', { error: String(err) }); }

  // Auto-register webhook
  const webhookToken = generateWebhookToken();
  const webhookCallback = `${publicBaseUrl()}/webhooks/jira/${webhookToken}`;
  let webhookIds: number[] = [];
  let webhookError: string | null = null;
  if (publicBaseUrl()) {
    try {
      const created = await adapter.createWebhook({
        url: webhookCallback,
        events: DEFAULT_WEBHOOK_EVENTS,
        jql: 'project is not empty',
      });
      webhookIds = created.map(c => Number(c.id)).filter(Number.isFinite);
    } catch (err: any) {
      webhookError = String(err?.message ?? err);
      logger.warn('Jira webhook auto-register failed', { error: webhookError });
    }
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `jira::${state.t}::${site.id}`;

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
    account_email: me?.emailAddress ?? null,
    account_name: me?.displayName ?? null,
    webhook_ids: webhookIds,
    webhook_token: webhookToken,
    webhook_url: webhookIds.length ? webhookCallback : null,
    webhook_events: DEFAULT_WEBHOOK_EVENTS,
    webhook_error: webhookError,
    granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: state.t,
    system: 'jira',
    name: site.name || site.id,
    status: 'connected',
    auth_type: 'oauth_authorization_code',
    auth_config: authConfig,
    capabilities: {
      reads: ['myself', 'projects', 'issuetypes', 'issues', 'users', 'search', 'webhooks'],
      writes: ['create_issue', 'update_issue', 'add_comment'],
      events: DEFAULT_WEBHOOK_EVENTS,
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });

  if (error) {
    logger.error('Jira upsert failed', { error: error.message });
    return res.redirect(`/app/integrations?error=jira&reason=persist`);
  }

  invalidateJiraForTenant(state.t, state.w || null);

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: state.t,
    workspace_id: state.w || state.t,
    actor_id: state.u,
    actor_type: 'user',
    action: 'INTEGRATION_CONNECTED',
    entity_type: 'connector',
    entity_id: connectorId,
    metadata: { system: 'jira', cloud_id: site.id, site_name: site.name, webhook_ids: webhookIds },
    occurred_at: now,
  }).then(() => {}, () => {});

  return res.redirect('/app/integrations?connected=jira');
});

jiraOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });

  const resolved = await jiraForTenant(req.tenantId, req.workspaceId ?? null);
  if (resolved && resolved.connector.webhookIds.length) {
    try { await resolved.adapter.deleteWebhooks(resolved.connector.webhookIds); }
    catch (err) { logger.warn('Jira deleteWebhooks failed', { error: String(err) }); }
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('connectors')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('tenant_id', req.tenantId)
    .eq('system', 'jira');
  if (error) return res.status(500).json({ error: error.message });
  invalidateJiraForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

jiraOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'jira')
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
    webhook_ids: cfg.webhook_ids ?? [],
    webhook_url: cfg.webhook_url ?? null,
    webhook_registered: Array.isArray(cfg.webhook_ids) && (cfg.webhook_ids as unknown[]).length > 0,
    webhook_error: cfg.webhook_error ?? null,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});

jiraOAuthRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await jiraForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Jira not connected' });
  try {
    const r = await resolved.adapter.searchIssues({ jql: 'order by updated DESC', maxResults: 5 });
    return res.json({
      ok: true,
      issues_visible: r.total,
      sample: r.issues.slice(0, 5).map((iss: any) => ({
        key: iss.key,
        summary: iss.fields?.summary ?? null,
        status: iss.fields?.status?.name ?? null,
        priority: iss.fields?.priority?.name ?? null,
        project: iss.fields?.project?.key ?? null,
        updated: iss.fields?.updated ?? null,
      })),
    });
  } catch (err: any) {
    return res.status(502).json({ error: 'Jira API call failed', details: String(err?.message ?? err) });
  }
});

jiraOAuthRouter.get('/projects', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await jiraForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Jira not connected' });
  try {
    const projects = await resolved.adapter.listProjects();
    return res.json({ ok: true, projects });
  } catch (err: any) {
    return res.status(502).json({ error: 'Jira projects failed', details: String(err?.message ?? err) });
  }
});

jiraOAuthRouter.post('/issue', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await jiraForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Jira not connected' });
  const projectKey = String(req.body?.project_key || '').trim();
  const summary = String(req.body?.summary || '').trim();
  if (!projectKey || !summary) return res.status(400).json({ error: 'project_key and summary are required' });
  try {
    const r = await resolved.adapter.createIssue({
      projectKey,
      summary,
      description: req.body?.description,
      issueTypeName: req.body?.issue_type ?? 'Task',
      priorityName: req.body?.priority,
      labels: req.body?.labels,
      assigneeAccountId: req.body?.assignee_account_id,
    });
    return res.json({
      ok: true,
      issue: {
        ...r,
        url: resolved.connector.siteUrl ? `${resolved.connector.siteUrl}/browse/${r.key}` : null,
      },
    });
  } catch (err: any) {
    return res.status(502).json({ error: 'Jira createIssue failed', details: String(err?.message ?? err) });
  }
});

jiraOAuthRouter.post('/register-webhook', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await jiraForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Jira not connected' });
  const base = publicBaseUrl();
  if (!base) return res.status(503).json({ error: 'PUBLIC_BASE_URL not configured' });

  try {
    if (resolved.connector.webhookIds.length) {
      try { await resolved.adapter.deleteWebhooks(resolved.connector.webhookIds); } catch { /* ignore */ }
    }
    const token = generateWebhookToken();
    const callback = `${base}/webhooks/jira/${token}`;
    const created = await resolved.adapter.createWebhook({
      url: callback,
      events: DEFAULT_WEBHOOK_EVENTS,
      jql: 'project is not empty',
    });
    const ids = created.map(c => Number(c.id)).filter(Number.isFinite);

    const supabase = getSupabaseAdmin();
    const merged = {
      ...resolved.connector.rawAuthConfig,
      webhook_ids: ids,
      webhook_token: token,
      webhook_url: callback,
      webhook_events: DEFAULT_WEBHOOK_EVENTS,
      webhook_error: null,
    };
    await supabase
      .from('connectors')
      .update({ auth_config: merged, last_health_check_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', resolved.connector.id);
    invalidateJiraForTenant(req.tenantId, req.workspaceId ?? null);

    return res.json({ ok: true, webhook_ids: ids, webhook_url: callback });
  } catch (err: any) {
    return res.status(502).json({ error: String(err?.message ?? err) });
  }
});

jiraOAuthRouter.post('/refresh-webhook', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await jiraForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Jira not connected' });
  if (!resolved.connector.webhookIds.length) return res.status(400).json({ error: 'No webhooks registered' });
  try {
    const r = await resolved.adapter.refreshWebhooks(resolved.connector.webhookIds);
    return res.json({ ok: true, expiration_date: r?.expirationDate ?? null });
  } catch (err: any) {
    return res.status(502).json({ error: String(err?.message ?? err) });
  }
});
