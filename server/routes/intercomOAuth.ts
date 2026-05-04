/**
 * server/routes/intercomOAuth.ts
 *
 *   GET  /api/integrations/intercom/install   — redirect to Intercom consent
 *   GET  /api/integrations/intercom/callback  — exchange code, probe region, persist
 *   POST /api/integrations/intercom/disconnect
 *   GET  /api/integrations/intercom/status
 *   POST /api/integrations/intercom/sync       — list latest open conversations
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
  probeRegion,
  type IntercomOAuthEnv,
} from '../integrations/intercom-oauth.js';
import {
  intercomForTenant,
  invalidateIntercomForTenant,
} from '../integrations/intercom-tenant.js';

export const intercomOAuthRouter = Router();

function readEnv(): IntercomOAuthEnv | { error: string } {
  const clientId = process.env.INTERCOM_CLIENT_ID;
  const clientSecret = process.env.INTERCOM_CLIENT_SECRET;
  const stateSecret = process.env.INTERCOM_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret) return { error: 'Intercom OAuth not configured: set INTERCOM_CLIENT_ID and INTERCOM_CLIENT_SECRET' };
  if (!publicBase) return { error: 'PUBLIC_BASE_URL must be set' };
  if (!stateSecret) return { error: 'INTERCOM_STATE_SECRET must be set' };
  return {
    clientId,
    clientSecret,
    stateSecret,
    redirectUri: `https://${publicBase}/api/integrations/intercom/callback`,
  };
}

intercomOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).json({ error: env.error });
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });

  const state = signState({ t: req.tenantId, w: req.workspaceId ?? '', u: req.userId }, env);
  const url = buildInstallUrl({ state, env });

  if (req.headers.accept?.includes('application/json')) {
    return res.json({ url, state });
  }
  return res.redirect(url);
});

intercomOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).send(env.error);

  const oauthError = typeof req.query.error === 'string' ? req.query.error : null;
  if (oauthError) {
    return res.redirect(`/app/integrations?error=intercom&reason=${encodeURIComponent(oauthError)}`);
  }

  const stateRaw = String(req.query.state || '');
  let state;
  try {
    state = verifyState(stateRaw, env);
  } catch (err) {
    logger.warn('Intercom callback: state invalid', { error: String(err) });
    return res.status(401).send('Invalid state');
  }

  const code = String(req.query.code || '');
  if (!code) return res.status(400).send('Missing code');

  let grant;
  try {
    grant = await exchangeCodeForToken({ code, env });
  } catch (err) {
    logger.warn('Intercom token exchange failed', { error: String(err) });
    return res.redirect(`/app/integrations?error=intercom&reason=token_exchange`);
  }

  // Probe regions to find the workspace's home + identity.
  let region: 'us' | 'eu' | 'au' = 'us';
  let appId: string | null = null;
  let admin: any = null;
  let app: any = null;
  try {
    const probed = await probeRegion(grant.accessToken);
    region = probed.region;
    appId = probed.appId;
    admin = probed.me;
    app = probed.me?.app ?? null;
  } catch (err) {
    logger.warn('Intercom region probe failed', { error: String(err) });
    return res.redirect(`/app/integrations?error=intercom&reason=region_probe`);
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `intercom::${state.t}::${appId ?? 'unknown'}`;

  const authConfig: Record<string, unknown> = {
    access_token: grant.accessToken,
    token_type: grant.tokenType,
    region,
    app_id: appId,
    app_name: app?.name ?? null,
    admin_id: admin?.id ?? null,
    admin_email: admin?.email ?? null,
    admin_name: admin?.name ?? null,
    granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: state.t,
    system: 'intercom',
    name: app?.name || appId || 'Intercom',
    status: 'connected',
    auth_type: 'oauth_authorization_code',
    auth_config: authConfig,
    capabilities: {
      reads: ['contacts', 'companies', 'conversations', 'tickets', 'articles', 'tags', 'admins', 'data_attributes', 'subscription_types'],
      writes: ['create_contact', 'update_contact', 'reply_conversation', 'assign_conversation', 'close_conversation', 'snooze_conversation', 'create_ticket', 'update_ticket', 'tag_contact', 'add_note', 'submit_event'],
      events: ['conversation.user.created', 'conversation.user.replied', 'conversation.admin.replied', 'conversation.admin.assigned', 'conversation.admin.closed', 'contact.created', 'contact.email.updated', 'ticket.state.updated'],
      region,
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });

  if (error) {
    logger.error('Intercom upsert failed', { error: error.message });
    return res.redirect(`/app/integrations?error=intercom&reason=persist`);
  }

  invalidateIntercomForTenant(state.t, state.w || null);

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: state.t,
    workspace_id: state.w || state.t,
    actor_id: state.u,
    actor_type: 'user',
    action: 'INTEGRATION_CONNECTED',
    entity_type: 'connector',
    entity_id: connectorId,
    metadata: { system: 'intercom', region, app_id: appId, admin_email: admin?.email ?? null },
    occurred_at: now,
  }).then(() => {}, () => {});

  return res.redirect('/app/integrations?connected=intercom');
});

intercomOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  // Intercom doesn't expose a token-revoke endpoint for OAuth apps; the
  // workspace admin must remove the app from Settings → Apps. We just
  // flip the connector to disconnected here.
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('connectors')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('tenant_id', req.tenantId)
    .eq('system', 'intercom');
  if (error) return res.status(500).json({ error: error.message });
  invalidateIntercomForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

intercomOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'intercom')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    app_id: cfg.app_id ?? null,
    app_name: cfg.app_name ?? null,
    region: cfg.region ?? null,
    admin_email: cfg.admin_email ?? null,
    admin_name: cfg.admin_name ?? null,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});

intercomOAuthRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await intercomForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Intercom not connected' });
  try {
    const r = await resolved.adapter.searchConversations(
      { field: 'state', operator: '=', value: 'open' },
      { perPage: 5 },
    );
    return res.json({
      ok: true,
      open_conversations_visible: r.total_count,
      sample: (r.conversations ?? []).slice(0, 3).map(c => ({
        id: c.id, state: c.state, priority: c.priority, updated_at: c.updated_at,
      })),
    });
  } catch (err: any) {
    return res.status(502).json({
      error: 'Intercom API call failed',
      details: err?.icErrors ?? String(err?.message ?? err),
    });
  }
});
