/**
 * server/routes/asanaOAuth.ts
 *
 *   GET  /api/integrations/asana/install
 *   GET  /api/integrations/asana/callback
 *   POST /api/integrations/asana/disconnect
 *   GET  /api/integrations/asana/status
 *   POST /api/integrations/asana/sync          — list 5 most recent assigned tasks
 *   GET  /api/integrations/asana/workspaces
 *   GET  /api/integrations/asana/projects
 *   POST /api/integrations/asana/task           — create task (used by AI)
 *   POST /api/integrations/asana/register-webhook
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { buildInstallUrl, signState, verifyState, exchangeCodeForToken, type AsanaOAuthEnv } from '../integrations/asana-oauth.js';
import { asanaForTenant, invalidateAsanaForTenant, type AsanaWebhookEntry } from '../integrations/asana-tenant.js';
import { AsanaAdapter } from '../integrations/asana.js';

export const asanaOAuthRouter = Router();

// In-memory pending webhook handshakes: { secretBuffer keyed by resourceGid, awaited by webhook handler }
// (Asana's first POST sends X-Hook-Secret; we must echo it back AND remember it.)
// We keep this simple: when register-webhook is called, we POST and Asana opens the handshake;
// the webhook handler captures the secret via a shared module map.
const pendingHandshakes = new Map<string, { tenantId: string; connectorId: string; resourceGid: string; resourceType: string; resolve: (entry: AsanaWebhookEntry) => void; reject: (err: Error) => void }>();
export function getPendingHandshake(targetUrl: string) { return pendingHandshakes.get(targetUrl); }
export function deletePendingHandshake(targetUrl: string) { pendingHandshakes.delete(targetUrl); }

function readEnv(): AsanaOAuthEnv | { error: string } {
  const clientId = process.env.ASANA_CLIENT_ID;
  const clientSecret = process.env.ASANA_CLIENT_SECRET;
  const stateSecret = process.env.ASANA_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret) return { error: 'Asana OAuth not configured: set ASANA_CLIENT_ID and ASANA_CLIENT_SECRET' };
  if (!publicBase) return { error: 'PUBLIC_BASE_URL must be set' };
  if (!stateSecret) return { error: 'ASANA_STATE_SECRET must be set' };
  return { clientId, clientSecret, stateSecret, redirectUri: `https://${publicBase}/api/integrations/asana/callback` };
}
function publicBaseUrl(): string { const b = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, ''); return b ? `https://${b}` : ''; }

asanaOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv(); if ('error' in env) return res.status(503).json({ error: env.error });
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });
  const state = signState({ t: req.tenantId, w: req.workspaceId ?? '', u: req.userId }, env);
  const url = buildInstallUrl({ state, env });
  if (req.headers.accept?.includes('application/json')) return res.json({ url, state });
  return res.redirect(url);
});

asanaOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv(); if ('error' in env) return res.status(503).send(env.error);
  if (typeof req.query.error === 'string') return res.redirect(`/app/integrations?error=asana&reason=${encodeURIComponent(req.query.error)}`);
  let state; try { state = verifyState(String(req.query.state || ''), env); } catch { return res.status(401).send('Invalid state'); }
  const code = String(req.query.code || ''); if (!code) return res.status(400).send('Missing code');
  let grant; try { grant = await exchangeCodeForToken({ code, env }); }
  catch (err) { logger.warn('Asana token exchange failed', { error: String(err) }); return res.redirect(`/app/integrations?error=asana&reason=token_exchange`); }

  const adapter = new AsanaAdapter(grant.accessToken);
  let me: any = null;
  let workspace: any = null;
  try {
    me = await adapter.me();
    const ws = await adapter.listWorkspaces();
    workspace = ws[0] ?? null;
  } catch (err) { logger.warn('Asana me/workspaces failed', { error: String(err) }); }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const userGid = me?.gid ?? grant.data?.id ?? 'unknown';
  const connectorId = `asana::${state.t}::${userGid}`;

  const authConfig: Record<string, unknown> = {
    access_token: grant.accessToken, refresh_token: grant.refreshToken,
    token_type: grant.tokenType, scope: 'default',
    access_token_expires_at: new Date(Date.now() + grant.expiresIn * 1000).toISOString(),
    asana_user_gid: userGid,
    email: me?.email ?? grant.data?.email ?? null,
    name: me?.name ?? grant.data?.name ?? null,
    workspace_gid: workspace?.gid ?? null,
    workspace_name: workspace?.name ?? null,
    webhooks: [], granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId, tenant_id: state.t, system: 'asana', name: workspace?.name || me?.email || userGid,
    status: 'connected', auth_type: 'oauth_authorization_code', auth_config: authConfig,
    capabilities: {
      reads: ['user', 'workspaces', 'projects', 'tasks', 'search'],
      writes: ['create_task', 'update_task', 'add_comment'],
      events: ['changed', 'added', 'removed', 'deleted'],
    },
    last_health_check_at: now, created_at: now, updated_at: now,
  }, { onConflict: 'id' });
  if (error) { logger.error('Asana upsert failed', { error: error.message }); return res.redirect(`/app/integrations?error=asana&reason=persist`); }

  invalidateAsanaForTenant(state.t, state.w || null);
  await supabase.from('audit_events').insert({ id: randomUUID(), tenant_id: state.t, workspace_id: state.w || state.t, actor_id: state.u, actor_type: 'user', action: 'INTEGRATION_CONNECTED', entity_type: 'connector', entity_id: connectorId, metadata: { system: 'asana', user_gid: userGid, workspace_gid: workspace?.gid ?? null }, occurred_at: now }).then(() => {}, () => {});
  return res.redirect('/app/integrations?connected=asana');
});

asanaOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await asanaForTenant(req.tenantId, req.workspaceId ?? null);
  if (resolved) {
    for (const wh of resolved.connector.webhooks) {
      try { await resolved.adapter.deleteWebhook(wh.webhook_gid); } catch (err) { logger.warn('Asana deleteWebhook failed', { gid: wh.webhook_gid, error: String(err) }); }
    }
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('connectors').update({ status: 'disconnected', updated_at: new Date().toISOString() }).eq('tenant_id', req.tenantId).eq('system', 'asana');
  if (error) return res.status(500).json({ error: error.message });
  invalidateAsanaForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

asanaOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('connectors').select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at').eq('tenant_id', req.tenantId).eq('system', 'asana').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    asana_user_gid: cfg.asana_user_gid ?? null,
    email: cfg.email ?? null, name: cfg.name ?? null,
    workspace_gid: cfg.workspace_gid ?? null, workspace_name: cfg.workspace_name ?? null,
    webhooks: cfg.webhooks ?? [],
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at, updated_at: data.updated_at,
  });
});

asanaOAuthRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await asanaForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Asana not connected' });
  if (!resolved.connector.workspaceGid) return res.json({ ok: true, tasks_visible: 0, sample: [] });
  try {
    const tasks = await resolved.adapter.listTasks({ workspace: resolved.connector.workspaceGid, assignee: 'me', completed_since: 'now', limit: 5 });
    return res.json({
      ok: true,
      tasks_visible: tasks.length,
      sample: tasks.map(t => ({ gid: t.gid, name: t.name, due_on: t.due_on, completed: t.completed, url: t.permalink_url })),
    });
  } catch (err: any) { return res.status(502).json({ error: 'Asana API call failed', details: String(err?.message ?? err) }); }
});

asanaOAuthRouter.get('/workspaces', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await asanaForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Asana not connected' });
  try { const ws = await resolved.adapter.listWorkspaces(); return res.json({ ok: true, workspaces: ws }); }
  catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});

asanaOAuthRouter.get('/projects', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await asanaForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Asana not connected' });
  const wsGid = String(req.query.workspace_gid || resolved.connector.workspaceGid || '');
  if (!wsGid) return res.status(400).json({ error: 'workspace_gid is required' });
  try { const projects = await resolved.adapter.listProjects(wsGid, { archived: false, limit: 100 }); return res.json({ ok: true, projects }); }
  catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});

asanaOAuthRouter.post('/task', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await asanaForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Asana not connected' });
  const workspace = String(req.body?.workspace_gid || resolved.connector.workspaceGid || '');
  const name = String(req.body?.name || '').trim();
  if (!workspace || !name) return res.status(400).json({ error: 'workspace_gid and name are required' });
  try {
    const task = await resolved.adapter.createTask({
      workspace, name,
      notes: req.body?.notes,
      assignee: req.body?.assignee_gid,
      due_on: req.body?.due_on,
      projects: req.body?.project_gids,
    });
    return res.json({ ok: true, task: { gid: task.gid, name: task.name, url: task.permalink_url } });
  } catch (err: any) { return res.status(502).json({ error: 'Asana createTask failed', details: String(err?.message ?? err) }); }
});

asanaOAuthRouter.post('/register-webhook', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await asanaForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Asana not connected' });
  const base = publicBaseUrl(); if (!base) return res.status(503).json({ error: 'PUBLIC_BASE_URL not configured' });
  const resourceGid = String(req.body?.resource_gid || '');
  const resourceType = String(req.body?.resource_type || 'project');
  if (!resourceGid) return res.status(400).json({ error: 'resource_gid is required' });

  const targetUrl = `${base}/webhooks/asana`;

  // Prepare a handshake promise; the webhook handler will resolve it when Asana POSTs with X-Hook-Secret.
  const handshakePromise = new Promise<AsanaWebhookEntry>((resolve, reject) => {
    pendingHandshakes.set(targetUrl, { tenantId: req.tenantId!, connectorId: resolved.connector.id, resourceGid, resourceType, resolve, reject });
    setTimeout(() => { pendingHandshakes.delete(targetUrl); reject(new Error('handshake timeout')); }, 30_000);
  });

  try {
    const created = await resolved.adapter.createWebhook({ resourceGid, targetUrl });
    // Wait for the handshake POST to register the X-Hook-Secret.
    const entry = await handshakePromise.catch(() => null);

    const newEntry: AsanaWebhookEntry = entry ?? {
      webhook_gid: created.gid,
      resource_gid: resourceGid,
      resource_type: resourceType,
      secret: '', // handshake never arrived; webhooks won't verify until next register attempt
      target: targetUrl,
    };

    const supabase = getSupabaseAdmin();
    const merged = { ...resolved.connector.rawAuthConfig, webhooks: [...resolved.connector.webhooks, newEntry] };
    await supabase.from('connectors').update({ auth_config: merged, updated_at: new Date().toISOString() }).eq('id', resolved.connector.id);
    invalidateAsanaForTenant(req.tenantId, req.workspaceId ?? null);
    return res.json({ ok: true, webhook: newEntry });
  } catch (err: any) {
    pendingHandshakes.delete(targetUrl);
    return res.status(502).json({ error: String(err?.message ?? err) });
  }
});
