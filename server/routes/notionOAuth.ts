/**
 * server/routes/notionOAuth.ts
 *
 *   GET  /api/integrations/notion/install   — redirect to Notion consent
 *   GET  /api/integrations/notion/callback  — exchange code, persist
 *   POST /api/integrations/notion/disconnect
 *   GET  /api/integrations/notion/status
 *   POST /api/integrations/notion/sync       — search latest pages
 *   POST /api/integrations/notion/index      — kick off knowledge index job
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
  type NotionOAuthEnv,
} from '../integrations/notion-oauth.js';
import {
  notionForTenant,
  invalidateNotionForTenant,
} from '../integrations/notion-tenant.js';

export const notionOAuthRouter = Router();

function readEnv(): NotionOAuthEnv | { error: string } {
  const clientId = process.env.NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;
  const stateSecret = process.env.NOTION_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret) return { error: 'Notion OAuth not configured: set NOTION_CLIENT_ID and NOTION_CLIENT_SECRET' };
  if (!publicBase) return { error: 'PUBLIC_BASE_URL must be set' };
  if (!stateSecret) return { error: 'NOTION_STATE_SECRET must be set' };
  return {
    clientId,
    clientSecret,
    stateSecret,
    redirectUri: `https://${publicBase}/api/integrations/notion/callback`,
  };
}

notionOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).json({ error: env.error });
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });

  const state = signState({ t: req.tenantId, w: req.workspaceId ?? '', u: req.userId }, env);
  const url = buildInstallUrl({ state, env, ownerType: 'user' });

  if (req.headers.accept?.includes('application/json')) {
    return res.json({ url, state });
  }
  return res.redirect(url);
});

notionOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv();
  if ('error' in env) return res.status(503).send(env.error);

  const oauthError = typeof req.query.error === 'string' ? req.query.error : null;
  if (oauthError) {
    return res.redirect(`/app/integrations?error=notion&reason=${encodeURIComponent(oauthError)}`);
  }

  const stateRaw = String(req.query.state || '');
  let state;
  try {
    state = verifyState(stateRaw, env);
  } catch (err) {
    logger.warn('Notion callback: state invalid', { error: String(err) });
    return res.status(401).send('Invalid state');
  }

  const code = String(req.query.code || '');
  if (!code) return res.status(400).send('Missing code');

  let grant;
  try {
    grant = await exchangeCodeForToken({ code, env });
  } catch (err) {
    logger.warn('Notion token exchange failed', { error: String(err) });
    return res.redirect(`/app/integrations?error=notion&reason=token_exchange`);
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `notion::${state.t}::${grant.workspaceId}`;

  const ownerUser = grant.owner?.user;
  const authConfig: Record<string, unknown> = {
    access_token: grant.accessToken,
    token_type: grant.tokenType,
    bot_id: grant.botId,
    workspace_id: grant.workspaceId,
    workspace_name: grant.workspaceName,
    workspace_icon: grant.workspaceIcon,
    owner_type: grant.owner?.type ?? 'user',
    owner_user_id: ownerUser?.id ?? null,
    owner_name: ownerUser?.name ?? null,
    owner_email: ownerUser?.person?.email ?? null,
    duplicated_template_id: grant.duplicatedTemplateId,
    granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: state.t,
    system: 'notion',
    name: grant.workspaceName || grant.workspaceId,
    status: 'connected',
    auth_type: 'oauth_authorization_code',
    auth_config: authConfig,
    capabilities: {
      reads: ['search', 'pages', 'databases', 'blocks', 'users', 'comments'],
      writes: ['create_page', 'update_page', 'append_blocks', 'update_block', 'delete_block', 'create_comment'],
      knowledge: ['index_pages', 'index_databases', 'plain_text_export'],
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });

  if (error) {
    logger.error('Notion upsert failed', { error: error.message });
    return res.redirect(`/app/integrations?error=notion&reason=persist`);
  }

  invalidateNotionForTenant(state.t, state.w || null);

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: state.t,
    workspace_id: state.w || state.t,
    actor_id: state.u,
    actor_type: 'user',
    action: 'INTEGRATION_CONNECTED',
    entity_type: 'connector',
    entity_id: connectorId,
    metadata: { system: 'notion', workspace_id: grant.workspaceId, workspace_name: grant.workspaceName, owner_email: ownerUser?.person?.email ?? null },
    occurred_at: now,
  }).then(() => {}, () => {});

  return res.redirect('/app/integrations?connected=notion');
});

notionOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  // Notion has no token-revoke endpoint for OAuth apps. The user must
  // remove the integration from each shared page in their workspace
  // settings to fully revoke. We just flip the connector here.
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('connectors')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('tenant_id', req.tenantId)
    .eq('system', 'notion');
  if (error) return res.status(500).json({ error: error.message });
  invalidateNotionForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

notionOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'notion')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    workspace_id: cfg.workspace_id ?? null,
    workspace_name: cfg.workspace_name ?? null,
    workspace_icon: cfg.workspace_icon ?? null,
    owner_email: cfg.owner_email ?? null,
    owner_name: cfg.owner_name ?? null,
    owner_type: cfg.owner_type ?? null,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});

notionOAuthRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await notionForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Notion not connected' });
  try {
    const r = await resolved.adapter.search({ pageSize: 5, sort: 'last_edited_time', sortDirection: 'descending' });
    return res.json({
      ok: true,
      results_visible: r.results.length,
      sample: r.results.slice(0, 5).map((p: any) => ({
        id: p.id,
        object: p.object,
        url: p.url,
        last_edited_time: p.last_edited_time,
        title: extractTitle(p),
      })),
    });
  } catch (err: any) {
    return res.status(502).json({
      error: 'Notion API call failed',
      details: err?.notionError ?? String(err?.message ?? err),
    });
  }
});

function extractTitle(item: any): string | null {
  // Pages: title prop. Databases: title array.
  if (item.object === 'page' && item.properties) {
    for (const v of Object.values(item.properties) as any[]) {
      if (v?.type === 'title' && Array.isArray(v.title) && v.title[0]?.plain_text) {
        return v.title.map((t: any) => t.plain_text).join('');
      }
    }
  }
  if (item.object === 'database' && Array.isArray(item.title)) {
    return item.title.map((t: any) => t.plain_text).join('');
  }
  return null;
}
