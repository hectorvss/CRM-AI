/**
 * server/routes/linearOAuth.ts
 *
 *   GET  /api/integrations/linear/install   — redirect to Linear consent
 *   GET  /api/integrations/linear/callback  — exchange code, register webhook, persist
 *   POST /api/integrations/linear/disconnect
 *   GET  /api/integrations/linear/status
 *   POST /api/integrations/linear/sync       — list 5 most recent open issues
 *   GET  /api/integrations/linear/teams      — list teams (for picker UI)
 *   POST /api/integrations/linear/issue       — create an issue (used by AI agent)
 *   POST /api/integrations/linear/register-webhook
 */

import { Router, Request, Response } from 'express';
import { randomBytes, randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import {
  buildInstallUrl,
  signState,
  verifyState,
  exchangeCodeForToken,
  revokeToken,
  LINEAR_SCOPES,
  type LinearOAuthEnv,
} from '../integrations/linear-oauth.js';
import {
  linearForTenant,
  invalidateLinearForTenant,
} from '../integrations/linear-tenant.js';
import { LinearAdapter } from '../integrations/linear.js';

export const linearOAuthRouter = Router();

function readEnv(): LinearOAuthEnv | { error: string } {
  const clientId = process.env.LINEAR_CLIENT_ID;
  const clientSecret = process.env.LINEAR_CLIENT_SECRET;
  const stateSecret = process.env.LINEAR_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret) return { error: 'Linear OAuth not configured: set LINEAR_CLIENT_ID and LINEAR_CLIENT_SECRET' };
  if (!publicBase) return { error: 'PUBLIC_BASE_URL must be set' };
  if (!stateSecret) return { error: 'LINEAR_STATE_SECRET must be set' };
  return {
    clientId,
    clientSecret,
    stateSecret,
    redirectUri: `https://${publicBase}/api/integrations/linear/callback`,
    signingSecret: process.env.LINEAR_SIGNING_SECRET,
  };
}

function publicBaseUrl(): string {
  const base = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  return base ? `https://${base}` : '';
}

linearOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).json({ error: env.error });
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });

  const state = signState({ t: req.tenantId, w: req.workspaceId ?? '', u: req.userId }, env);
  const url = buildInstallUrl({ state, env, scopes: LINEAR_SCOPES });

  if (req.headers.accept?.includes('application/json')) return res.json({ url, state });
  return res.redirect(url);
});

linearOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).send(env.error);

  const oauthError = typeof req.query.error === 'string' ? req.query.error : null;
  if (oauthError) {
    return res.redirect(`/app/integrations?error=linear&reason=${encodeURIComponent(oauthError)}`);
  }
  const stateRaw = String(req.query.state || '');
  let state;
  try { state = verifyState(stateRaw, env); }
  catch (err) {
    logger.warn('Linear callback: state invalid', { error: String(err) });
    return res.status(401).send('Invalid state');
  }
  const code = String(req.query.code || '');
  if (!code) return res.status(400).send('Missing code');

  let grant;
  try { grant = await exchangeCodeForToken({ code, env }); }
  catch (err) {
    logger.warn('Linear token exchange failed', { error: String(err) });
    return res.redirect(`/app/integrations?error=linear&reason=token_exchange`);
  }

  // Identify viewer + auto-register webhook on the org level.
  const adapter = new LinearAdapter(grant.accessToken);
  let viewer: any = null;
  let webhookId: string | null = null;
  let webhookSigningSecret: string | null = null;
  let webhookError: string | null = null;
  try {
    const r = await adapter.viewer();
    viewer = r.viewer;
  } catch (err) {
    logger.warn('Linear viewer fetch failed', { error: String(err) });
  }

  const callback = `${publicBaseUrl()}/webhooks/linear`;
  if (callback) {
    try {
      const secret = randomBytes(32).toString('hex');
      const wh = await adapter.createWebhook({
        url: callback,
        label: 'Clain — Issues, comments, projects',
        resourceTypes: ['Issue', 'Comment', 'IssueLabel', 'Reaction', 'IssueAttachment'],
        enabled: true,
        secret,
      });
      if (wh.webhookCreate.success) {
        webhookId = wh.webhookCreate.webhook.id;
        webhookSigningSecret = wh.webhookCreate.webhook.secret ?? secret;
      }
    } catch (err: any) {
      webhookError = String(err?.message ?? err);
      logger.warn('Linear webhook auto-register failed', { error: webhookError });
    }
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const orgId = viewer?.organization?.id ?? 'unknown';
  const connectorId = `linear::${state.t}::${orgId}`;

  const authConfig: Record<string, unknown> = {
    access_token: grant.accessToken,
    token_type: grant.tokenType,
    scope: grant.scope,
    expires_at: new Date(Date.now() + grant.expiresIn * 1000).toISOString(),
    organization_id: viewer?.organization?.id ?? null,
    organization_name: viewer?.organization?.name ?? null,
    organization_url_key: viewer?.organization?.urlKey ?? null,
    viewer_id: viewer?.id ?? null,
    viewer_email: viewer?.email ?? null,
    viewer_name: viewer?.name ?? null,
    webhook_id: webhookId,
    webhook_url: webhookId ? `${publicBaseUrl()}/webhooks/linear` : null,
    webhook_signing_secret: webhookSigningSecret,
    webhook_error: webhookError,
    granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: state.t,
    system: 'linear',
    name: viewer?.organization?.name || orgId,
    status: 'connected',
    auth_type: 'oauth_authorization_code',
    auth_config: authConfig,
    capabilities: {
      reads: ['viewer', 'teams', 'team_states', 'team_labels', 'issues', 'comments', 'users', 'projects', 'webhooks'],
      writes: ['create_issue', 'update_issue', 'create_comment', 'create_label'],
      events: ['issue.created', 'issue.updated', 'comment.created', 'reaction.added', 'issueLabel.created', 'issueAttachment.created'],
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });

  if (error) {
    logger.error('Linear upsert failed', { error: error.message });
    return res.redirect(`/app/integrations?error=linear&reason=persist`);
  }

  invalidateLinearForTenant(state.t, state.w || null);

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: state.t,
    workspace_id: state.w || state.t,
    actor_id: state.u,
    actor_type: 'user',
    action: 'INTEGRATION_CONNECTED',
    entity_type: 'connector',
    entity_id: connectorId,
    metadata: { system: 'linear', organization_id: orgId, viewer_email: viewer?.email ?? null, webhook_id: webhookId },
    occurred_at: now,
  }).then(() => {}, () => {});

  return res.redirect('/app/integrations?connected=linear');
});

linearOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });

  const resolved = await linearForTenant(req.tenantId, req.workspaceId ?? null);
  if (resolved) {
    if (resolved.connector.webhookId) {
      try { await resolved.adapter.deleteWebhook(resolved.connector.webhookId); }
      catch (err) { logger.warn('Linear deleteWebhook failed', { error: String(err) }); }
    }
    if (resolved.connector.accessToken) {
      await revokeToken(resolved.connector.accessToken);
    }
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('connectors')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('tenant_id', req.tenantId)
    .eq('system', 'linear');
  if (error) return res.status(500).json({ error: error.message });
  invalidateLinearForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

linearOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'linear')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    organization_id: cfg.organization_id ?? null,
    organization_name: cfg.organization_name ?? null,
    organization_url_key: cfg.organization_url_key ?? null,
    viewer_email: cfg.viewer_email ?? null,
    viewer_name: cfg.viewer_name ?? null,
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

linearOAuthRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await linearForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Linear not connected' });
  try {
    const r = await resolved.adapter.searchIssues({ stateType: 'started', first: 5 });
    return res.json({
      ok: true,
      open_issues_visible: r.issues.nodes.length,
      sample: r.issues.nodes.slice(0, 5).map(iss => ({
        identifier: iss.identifier,
        title: iss.title,
        state: iss.state.name,
        priority: iss.priority,
        url: iss.url,
      })),
    });
  } catch (err: any) {
    return res.status(502).json({
      error: 'Linear API call failed',
      details: err?.linearErrors ?? String(err?.message ?? err),
    });
  }
});

linearOAuthRouter.get('/teams', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await linearForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Linear not connected' });
  try {
    const r = await resolved.adapter.listTeams();
    return res.json({ ok: true, teams: r.teams.nodes });
  } catch (err: any) {
    return res.status(502).json({ error: 'Linear teams failed', details: err?.linearErrors ?? String(err?.message ?? err) });
  }
});

linearOAuthRouter.post('/issue', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await linearForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Linear not connected' });
  const teamId = String(req.body?.team_id || '').trim();
  const title = String(req.body?.title || '').trim();
  if (!teamId || !title) return res.status(400).json({ error: 'team_id and title are required' });
  try {
    const r = await resolved.adapter.createIssue({
      teamId, title,
      description: req.body?.description,
      priority: req.body?.priority,
      labelIds: req.body?.label_ids,
      assigneeId: req.body?.assignee_id,
    });
    if (!r.issueCreate.success) throw new Error('issueCreate returned success=false');
    return res.json({ ok: true, issue: r.issueCreate.issue });
  } catch (err: any) {
    return res.status(502).json({ error: 'Linear createIssue failed', details: err?.linearErrors ?? String(err?.message ?? err) });
  }
});

linearOAuthRouter.post('/register-webhook', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await linearForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Linear not connected' });
  const callback = `${publicBaseUrl()}/webhooks/linear`;
  if (!callback) return res.status(503).json({ error: 'PUBLIC_BASE_URL not configured' });

  try {
    if (resolved.connector.webhookId) {
      try { await resolved.adapter.deleteWebhook(resolved.connector.webhookId); } catch { /* ignore */ }
    }
    const secret = randomBytes(32).toString('hex');
    const wh = await resolved.adapter.createWebhook({
      url: callback,
      label: 'Clain — Issues, comments, projects',
      resourceTypes: ['Issue', 'Comment', 'IssueLabel', 'Reaction', 'IssueAttachment'],
      enabled: true,
      secret,
    });

    const supabase = getSupabaseAdmin();
    const merged = {
      ...resolved.connector.rawAuthConfig,
      webhook_id: wh.webhookCreate.webhook.id,
      webhook_url: callback,
      webhook_signing_secret: wh.webhookCreate.webhook.secret ?? secret,
      webhook_error: null,
    };
    await supabase
      .from('connectors')
      .update({ auth_config: merged, last_health_check_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', resolved.connector.id);
    invalidateLinearForTenant(req.tenantId, req.workspaceId ?? null);

    return res.json({ ok: true, webhook_id: wh.webhookCreate.webhook.id, webhook_url: callback });
  } catch (err: any) {
    return res.status(502).json({ error: String(err?.message ?? err) });
  }
});
