/**
 * server/integrations/gitlab-tenant.ts
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { GitLabAdapter } from './gitlab.js';
import { refreshAccessToken, type GitLabOAuthEnv } from './gitlab-oauth.js';

interface CacheEntry { adapter: GitLabAdapter; cachedAt: number; expiresAt: number }
const cache = new Map<string, CacheEntry>();
const cacheKey = (t: string, w: string | null) => `${t}::${w ?? '_'}`;

export interface GitLabHookEntry { hook_id: number; project_id: number; url: string; token: string; events: string[] }

export interface GitLabConnector {
  id: string; tenantId: string;
  userId: number; username: string; name: string | null; email: string | null;
  baseUrl: string;
  scope: string;
  accessToken: string; refreshToken: string | null;
  accessTokenExpiresAt: string | null;
  hooks: GitLabHookEntry[];
  rawAuthConfig: Record<string, unknown>;
}

function readEnv(): GitLabOAuthEnv | null {
  const clientId = process.env.GITLAB_CLIENT_ID;
  const clientSecret = process.env.GITLAB_CLIENT_SECRET;
  const stateSecret = process.env.GITLAB_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const baseUrl = process.env.GITLAB_BASE_URL || undefined;
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret || !publicBase || !stateSecret) return null;
  return { clientId, clientSecret, stateSecret, baseUrl, redirectUri: `https://${publicBase}/api/integrations/gitlab/callback` };
}

export async function loadGitLabConnector(tenantId: string): Promise<GitLabConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('connectors').select('id, tenant_id, system, status, auth_config').eq('tenant_id', tenantId).eq('system', 'gitlab').eq('status', 'connected').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error; if (!data) return null;
    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const accessToken = typeof cfg.access_token === 'string' ? cfg.access_token : '';
    if (!accessToken) return null;
    return {
      id: String(data.id), tenantId: String(data.tenant_id),
      userId: typeof cfg.user_id === 'number' ? cfg.user_id : 0,
      username: typeof cfg.username === 'string' ? cfg.username : '',
      name: typeof cfg.name === 'string' ? cfg.name : null,
      email: typeof cfg.email === 'string' ? cfg.email : null,
      baseUrl: typeof cfg.base_url === 'string' ? cfg.base_url : 'https://gitlab.com',
      scope: typeof cfg.scope === 'string' ? cfg.scope : '',
      accessToken,
      refreshToken: typeof cfg.refresh_token === 'string' ? cfg.refresh_token : null,
      accessTokenExpiresAt: typeof cfg.access_token_expires_at === 'string' ? cfg.access_token_expires_at : null,
      hooks: Array.isArray(cfg.hooks) ? cfg.hooks as GitLabHookEntry[] : [],
      rawAuthConfig: cfg,
    };
  } catch (err) { logger.warn('loadGitLabConnector failed', { tenantId, error: String(err) }); return null; }
}

/** Find tenant by webhook X-Gitlab-Token (per-hook secret). */
export async function findTenantByGitLabToken(token: string): Promise<{ tenantId: string; connectorId: string; hook: GitLabHookEntry } | null> {
  if (!token) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from('connectors').select('id, tenant_id, auth_config').eq('system', 'gitlab').eq('status', 'connected');
    if (!data) return null;
    for (const row of data) {
      const cfg = (row.auth_config ?? {}) as Record<string, unknown>;
      const hooks = Array.isArray(cfg.hooks) ? cfg.hooks as GitLabHookEntry[] : [];
      for (const h of hooks) {
        if (h.token === token) return { tenantId: String(row.tenant_id), connectorId: String(row.id), hook: h };
      }
    }
    return null;
  } catch (err) { logger.warn('findTenantByGitLabToken failed', { error: String(err) }); return null; }
}

async function refreshIfNeeded(connector: GitLabConnector): Promise<GitLabConnector> {
  const exp = connector.accessTokenExpiresAt ? Date.parse(connector.accessTokenExpiresAt) : 0;
  if (exp && exp - Date.now() > 60_000) return connector;
  if (!connector.refreshToken) return connector;
  const env = readEnv(); if (!env) return connector;
  try {
    const grant = await refreshAccessToken({ refreshToken: connector.refreshToken, env });
    const supabase = getSupabaseAdmin();
    const merged = { ...connector.rawAuthConfig, access_token: grant.accessToken, refresh_token: grant.refreshToken ?? connector.refreshToken, scope: grant.scope || connector.scope, access_token_expires_at: new Date((grant.createdAt + grant.expiresIn) * 1000).toISOString() };
    await supabase.from('connectors').update({ auth_config: merged, updated_at: new Date().toISOString() }).eq('id', connector.id);
    return { ...connector, accessToken: grant.accessToken, refreshToken: grant.refreshToken ?? connector.refreshToken, accessTokenExpiresAt: new Date((grant.createdAt + grant.expiresIn) * 1000).toISOString(), rawAuthConfig: merged };
  } catch (err) { logger.warn('gitlab token refresh failed', { connectorId: connector.id, error: String(err) }); return connector; }
}

export async function gitlabForTenant(tenantId: string, workspaceId: string | null): Promise<{ adapter: GitLabAdapter; connector: GitLabConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expiresAt - 60_000 && Date.now() - hit.cachedAt < 5 * 60_000) {
    const connector = await loadGitLabConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }
  let connector = await loadGitLabConnector(tenantId);
  if (!connector) { cache.delete(key); return null; }
  connector = await refreshIfNeeded(connector);
  const adapter = new GitLabAdapter(connector.accessToken, connector.baseUrl);
  const exp = connector.accessTokenExpiresAt ? Date.parse(connector.accessTokenExpiresAt) : Date.now() + 7_200_000;
  cache.set(key, { adapter, cachedAt: Date.now(), expiresAt: exp });
  return { adapter, connector };
}

export function invalidateGitLabForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}
