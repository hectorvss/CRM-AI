/**
 * server/routes/zendeskOAuth.ts
 *
 *   GET  /api/integrations/zendesk/install   — redirect to Zendesk consent
 *                                              (requires ?subdomain=acme)
 *   GET  /api/integrations/zendesk/callback  — exchange code, register
 *                                              webhook, persist
 *   POST /api/integrations/zendesk/disconnect
 *   GET  /api/integrations/zendesk/status
 *   POST /api/integrations/zendesk/sync       — list latest open tickets
 *   POST /api/integrations/zendesk/register-webhook — manual re-register
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
  isValidSubdomain,
  ZENDESK_SCOPES,
  type ZendeskOAuthEnv,
} from '../integrations/zendesk-oauth.js';
import {
  zendeskForTenant,
  invalidateZendeskForTenant,
} from '../integrations/zendesk-tenant.js';

export const zendeskOAuthRouter = Router();

function readEnv(): ZendeskOAuthEnv | { error: string } {
  const clientId = process.env.ZENDESK_CLIENT_ID;
  const clientSecret = process.env.ZENDESK_CLIENT_SECRET;
  const stateSecret = process.env.ZENDESK_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret) return { error: 'Zendesk OAuth not configured: set ZENDESK_CLIENT_ID and ZENDESK_CLIENT_SECRET' };
  if (!publicBase) return { error: 'PUBLIC_BASE_URL must be set' };
  if (!stateSecret) return { error: 'ZENDESK_STATE_SECRET must be set' };
  return {
    clientId,
    clientSecret,
    stateSecret,
    redirectUri: `https://${publicBase}/api/integrations/zendesk/callback`,
  };
}

function publicBaseUrl(): string {
  const base = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  return base ? `https://${base}` : '';
}

zendeskOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).json({ error: env.error });
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });

  const subdomain = String(req.query.subdomain || '').trim().toLowerCase();
  if (!isValidSubdomain(subdomain)) {
    return res.status(400).json({ error: 'Pass ?subdomain=<your-zendesk-subdomain> (e.g. "acme" for acme.zendesk.com)' });
  }

  const state = signState({ t: req.tenantId, w: req.workspaceId ?? '', u: req.userId, s: subdomain }, env);
  const url = buildInstallUrl({ state, env, subdomain });

  if (req.headers.accept?.includes('application/json')) {
    return res.json({ url, state });
  }
  return res.redirect(url);
});

zendeskOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).send(env.error);

  const oauthError = typeof req.query.error === 'string' ? req.query.error : null;
  if (oauthError) {
    return res.redirect(`/app/integrations?error=zendesk&reason=${encodeURIComponent(oauthError)}`);
  }

  const stateRaw = String(req.query.state || '');
  let state;
  try {
    state = verifyState(stateRaw, env);
  } catch (err) {
    logger.warn('Zendesk callback: state invalid', { error: String(err) });
    return res.status(401).send('Invalid state');
  }

  const code = String(req.query.code || '');
  if (!code) return res.status(400).send('Missing code');

  let grant;
  try {
    grant = await exchangeCodeForToken({ code, subdomain: state.s, env });
  } catch (err) {
    logger.warn('Zendesk token exchange failed', { error: String(err) });
    return res.redirect(`/app/integrations?error=zendesk&reason=token_exchange`);
  }

  // Best-effort: identify the agent + auto-register webhook.
  let identity: any = null;
  let webhookId: string | null = null;
  let webhookSecret: string | null = null;
  let webhookError: string | null = null;
  try {
    const { ZendeskAdapter } = await import('../integrations/zendesk.js');
    const adapter = new ZendeskAdapter(grant.accessToken, state.s);
    try {
      const me = await adapter.currentUser();
      identity = me.user;
    } catch (err) {
      logger.warn('Zendesk currentUser fetch failed', { error: String(err) });
    }

    const callback = `${publicBaseUrl()}/webhooks/zendesk`;
    if (callback) {
      try {
        const wh = await adapter.createWebhook({
          name: 'Clain — Tickets, comments, users',
          endpoint: callback,
          subscriptions: [
            'conditional_ticket_events',
            'zen:event-type:ticket.created',
            'zen:event-type:ticket.status_changed',
            'zen:event-type:ticket.priority_changed',
            'zen:event-type:ticket.assignee_changed',
            'zen:event-type:ticket.tag_added',
            'zen:event-type:ticket.tag_removed',
            'zen:event-type:ticket.comment_added',
            'zen:event-type:user.created',
            'zen:event-type:user.updated',
          ],
        });
        webhookId = wh.webhook.id;
        webhookSecret = wh.webhook.signing_secret?.secret ?? null;
      } catch (err: any) {
        webhookError = String(err?.message ?? err);
        logger.warn('Zendesk webhook auto-register failed', { error: webhookError });
      }
    }
  } catch (err) {
    logger.warn('Zendesk post-exchange setup failed (continuing)', { error: String(err) });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `zendesk::${state.t}::${state.s}`;

  const authConfig: Record<string, unknown> = {
    subdomain: state.s,
    access_token: grant.accessToken,
    token_type: grant.tokenType,
    scope: grant.scope,
    refresh_token: grant.refreshToken,
    expires_at: grant.expiresAt,
    identity_user_id: identity?.id ?? null,
    identity_email: identity?.email ?? null,
    identity_name: identity?.name ?? null,
    webhook_id: webhookId,
    webhook_url: webhookId ? `${publicBaseUrl()}/webhooks/zendesk` : null,
    webhook_secret: webhookSecret,
    webhook_error: webhookError,
    granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: state.t,
    system: 'zendesk',
    name: state.s,
    status: 'connected',
    auth_type: 'oauth_authorization_code',
    auth_config: authConfig,
    capabilities: {
      reads: ['tickets', 'users', 'organizations', 'comments', 'macros', 'triggers', 'help_center', 'search', 'audit_logs'],
      writes: ['create_ticket', 'update_ticket', 'add_comment', 'bulk_update', 'create_or_update_user', 'apply_macro'],
      events: ['ticket.created', 'ticket.status_changed', 'ticket.priority_changed', 'ticket.assignee_changed', 'ticket.comment_added', 'ticket.tag_added', 'ticket.tag_removed', 'user.created', 'user.updated'],
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });

  if (error) {
    logger.error('Zendesk upsert failed', { error: error.message });
    return res.redirect(`/app/integrations?error=zendesk&reason=persist`);
  }

  invalidateZendeskForTenant(state.t, state.w || null);

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: state.t,
    workspace_id: state.w || state.t,
    actor_id: state.u,
    actor_type: 'user',
    action: 'INTEGRATION_CONNECTED',
    entity_type: 'connector',
    entity_id: connectorId,
    metadata: { system: 'zendesk', subdomain: state.s, webhook_id: webhookId, identity_email: identity?.email ?? null },
    occurred_at: now,
  }).then(() => {}, () => {});

  return res.redirect('/app/integrations?connected=zendesk');
});

zendeskOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });

  const resolved = await zendeskForTenant(req.tenantId, req.workspaceId ?? null);
  if (resolved?.connector.cachedAccessToken && resolved?.connector.subdomain) {
    if (resolved.connector.webhookId) {
      try {
        await resolved.adapter.deleteWebhook(resolved.connector.webhookId);
      } catch (err) {
        logger.warn('Zendesk deleteWebhook failed (continuing)', { error: String(err) });
      }
    }
    await revokeToken(resolved.connector.cachedAccessToken, resolved.connector.subdomain);
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('connectors')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('tenant_id', req.tenantId)
    .eq('system', 'zendesk');
  if (error) return res.status(500).json({ error: error.message });
  invalidateZendeskForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

zendeskOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'zendesk')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    subdomain: cfg.subdomain ?? null,
    identity_email: cfg.identity_email ?? null,
    identity_name: cfg.identity_name ?? null,
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

zendeskOAuthRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await zendeskForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Zendesk not connected' });
  try {
    const r = await resolved.adapter.search('type:ticket status<solved', { sortBy: 'updated_at', sortOrder: 'desc', perPage: 5 });
    return res.json({
      ok: true,
      open_tickets_visible: r.count,
      sample: (r.results ?? []).slice(0, 3).map((t: any) => ({
        id: t.id, subject: t.subject, status: t.status, priority: t.priority, updated_at: t.updated_at,
      })),
    });
  } catch (err: any) {
    return res.status(502).json({
      error: 'Zendesk API call failed',
      details: err?.zdErrors ?? String(err?.message ?? err),
    });
  }
});

zendeskOAuthRouter.post('/register-webhook', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await zendeskForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Zendesk not connected' });
  const callback = `${publicBaseUrl()}/webhooks/zendesk`;
  if (!callback) return res.status(503).json({ error: 'PUBLIC_BASE_URL not configured' });

  try {
    if (resolved.connector.webhookId) {
      try { await resolved.adapter.deleteWebhook(resolved.connector.webhookId); } catch { /* ignore */ }
    }
    const wh = await resolved.adapter.createWebhook({
      name: 'Clain — Tickets, comments, users',
      endpoint: callback,
      subscriptions: [
        'zen:event-type:ticket.created',
        'zen:event-type:ticket.status_changed',
        'zen:event-type:ticket.priority_changed',
        'zen:event-type:ticket.assignee_changed',
        'zen:event-type:ticket.tag_added',
        'zen:event-type:ticket.tag_removed',
        'zen:event-type:ticket.comment_added',
        'zen:event-type:user.created',
        'zen:event-type:user.updated',
      ],
    });

    const supabase = getSupabaseAdmin();
    const merged = {
      ...resolved.connector.rawAuthConfig,
      webhook_id: wh.webhook.id,
      webhook_secret: wh.webhook.signing_secret?.secret ?? null,
      webhook_url: callback,
      webhook_error: null,
    };
    await supabase
      .from('connectors')
      .update({ auth_config: merged, last_health_check_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', resolved.connector.id);
    invalidateZendeskForTenant(req.tenantId, req.workspaceId ?? null);

    return res.json({ ok: true, webhook_id: wh.webhook.id, webhook_url: callback });
  } catch (err: any) {
    return res.status(502).json({ error: String(err?.message ?? err) });
  }
});
