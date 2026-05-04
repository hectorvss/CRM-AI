/**
 * server/integrations/asana-tenant.ts
 *
 * Per-tenant Asana adapter resolver. Auto-refresh via shared asana-oauth.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { AsanaAdapter } from './asana.js';
import { refreshAccessToken, type AsanaOAuthEnv } from './asana-oauth.js';

interface CacheEntry { adapter: AsanaAdapter; cachedAt: number; expiresAt: number }
const cache = new Map<string, CacheEntry>();
const cacheKey = (t: string, w: string | null) => `${t}::${w ?? '_'}`;

export interface AsanaWebhookEntry {
  webhook_gid: string; resource_gid: string; resource_type: string; secret: string; target: string;
}

export interface AsanaConnector {
  id: string; tenantId: string;
  asanaUserGid: string; email: string | null; name: string | null;
  workspaceGid: string | null; workspaceName: string | null;
  scope: string;
  accessToken: string; refreshToken: string | null;
  accessTokenExpiresAt: string | null;
  webhooks: AsanaWebhookEntry[];
  rawAuthConfig: Record<string, unknown>;
}

function readEnv(): AsanaOAuthEnv | null {
  const clientId = process.env.ASANA_CLIENT_ID;
  const clientSecret = process.env.ASANA_CLIENT_SECRET;
  const stateSecret = process.env.ASANA_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret || !publicBase || !stateSecret) return null;
  return { clientId, clientSecret, stateSecret, redirectUri: `https://${publicBase}/api/integrations/asana/callback` };
}

export async function loadAsanaConnector(tenantId: string): Promise<AsanaConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('connectors').select('id, tenant_id, system, status, auth_config').eq('tenant_id', tenantId).eq('system', 'asana').eq('status', 'connected').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error; if (!data) return null;
    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const accessToken = typeof cfg.access_token === 'string' ? cfg.access_token : '';
    if (!accessToken) return null;
    return {
      id: String(data.id), tenantId: String(data.tenant_id),
      asanaUserGid: typeof cfg.asana_user_gid === 'string' ? cfg.asana_user_gid : '',
      email: typeof cfg.email === 'string' ? cfg.email : null,
      name: typeof cfg.name === 'string' ? cfg.name : null,
      workspaceGid: typeof cfg.workspace_gid === 'string' ? cfg.workspace_gid : null,
      workspaceName: typeof cfg.workspace_name === 'string' ? cfg.workspace_name : null,
      scope: typeof cfg.scope === 'string' ? cfg.scope : '',
      accessToken,
      refreshToken: typeof cfg.refresh_token === 'string' ? cfg.refresh_token : null,
      accessTokenExpiresAt: typeof cfg.access_token_expires_at === 'string' ? cfg.access_token_expires_at : null,
      webhooks: Array.isArray(cfg.webhooks) ? cfg.webhooks as AsanaWebhookEntry[] : [],
      rawAuthConfig: cfg,
    };
  } catch (err) { logger.warn('loadAsanaConnector failed', { tenantId, error: String(err) }); return null; }
}

/** Find tenant by Asana webhook gid (X-Hook-Signature is per-secret; we look up by webhook gid in URL or header). Asana doesn't include the webhook gid in headers, so we identify by signature match. */
export async function findAsanaTenantBySignature(verify: (secret: string) => boolean): Promise<{ tenantId: string; connectorId: string; webhook: AsanaWebhookEntry } | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from('connectors').select('id, tenant_id, auth_config').eq('system', 'asana').eq('status', 'connected');
    if (!data) return null;
    for (const row of data) {
      const cfg = (row.auth_config ?? {}) as Record<string, unknown>;
      const webhooks = Array.isArray(cfg.webhooks) ? cfg.webhooks as AsanaWebhookEntry[] : [];
      for (const wh of webhooks) {
        if (verify(wh.secret)) return { tenantId: String(row.tenant_id), connectorId: String(row.id), webhook: wh };
      }
    }
    return null;
  } catch (err) { logger.warn('findAsanaTenantBySignature failed', { error: String(err) }); return null; }
}

async function refreshIfNeeded(connector: AsanaConnector): Promise<AsanaConnector> {
  const exp = connector.accessTokenExpiresAt ? Date.parse(connector.accessTokenExpiresAt) : 0;
  if (exp && exp - Date.now() > 60_000) return connector;
  if (!connector.refreshToken) return connector;
  const env = readEnv(); if (!env) return connector;
  try {
    const grant = await refreshAccessToken({ refreshToken: connector.refreshToken, env });
    const supabase = getSupabaseAdmin();
    const merged = { ...connector.rawAuthConfig, access_token: grant.accessToken, refresh_token: grant.refreshToken ?? connector.refreshToken, token_type: grant.tokenType, access_token_expires_at: new Date(Date.now() + grant.expiresIn * 1000).toISOString() };
    await supabase.from('connectors').update({ auth_config: merged, updated_at: new Date().toISOString() }).eq('id', connector.id);
    return { ...connector, accessToken: grant.accessToken, refreshToken: grant.refreshToken ?? connector.refreshToken, accessTokenExpiresAt: new Date(Date.now() + grant.expiresIn * 1000).toISOString(), rawAuthConfig: merged };
  } catch (err) { logger.warn('asana token refresh failed', { connectorId: connector.id, error: String(err) }); return connector; }
}

export async function asanaForTenant(tenantId: string, workspaceId: string | null): Promise<{ adapter: AsanaAdapter; connector: AsanaConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expiresAt - 60_000 && Date.now() - hit.cachedAt < 5 * 60_000) {
    const connector = await loadAsanaConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }
  let connector = await loadAsanaConnector(tenantId);
  if (!connector) { cache.delete(key); return null; }
  connector = await refreshIfNeeded(connector);
  const adapter = new AsanaAdapter(connector.accessToken);
  const exp = connector.accessTokenExpiresAt ? Date.parse(connector.accessTokenExpiresAt) : Date.now() + 3_600_000;
  cache.set(key, { adapter, cachedAt: Date.now(), expiresAt: exp });
  return { adapter, connector };
}

export function invalidateAsanaForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}
