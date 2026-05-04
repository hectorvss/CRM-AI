/**
 * server/integrations/zoom-tenant.ts
 *
 * Per-tenant Zoom adapter resolver with transparent token refresh.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { ZoomAdapter } from './zoom.js';
import { refreshAccessToken, type ZoomOAuthEnv } from './zoom-oauth.js';

interface CacheEntry { adapter: ZoomAdapter; cachedAt: number; expiresAt: number }
const cache = new Map<string, CacheEntry>();
const cacheKey = (t: string, w: string | null) => `${t}::${w ?? '_'}`;

export interface ZoomConnector {
  id: string; tenantId: string;
  zoomUserId: string; accountId: string | null;
  email: string | null; name: string | null;
  scope: string;
  accessToken: string; refreshToken: string | null;
  accessTokenExpiresAt: string | null;
  rawAuthConfig: Record<string, unknown>;
}

function readEnv(): ZoomOAuthEnv | null {
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  const stateSecret = process.env.ZOOM_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const webhookSecretToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret || !publicBase || !stateSecret) return null;
  return { clientId, clientSecret, stateSecret, webhookSecretToken, redirectUri: `https://${publicBase}/api/integrations/zoom/callback` };
}

export async function loadZoomConnector(tenantId: string): Promise<ZoomConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('connectors').select('id, tenant_id, system, status, auth_config').eq('tenant_id', tenantId).eq('system', 'zoom').eq('status', 'connected').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error; if (!data) return null;
    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const accessToken = typeof cfg.access_token === 'string' ? cfg.access_token : '';
    if (!accessToken) return null;
    return {
      id: String(data.id), tenantId: String(data.tenant_id),
      zoomUserId: typeof cfg.zoom_user_id === 'string' ? cfg.zoom_user_id : '',
      accountId: typeof cfg.account_id === 'string' ? cfg.account_id : null,
      email: typeof cfg.email === 'string' ? cfg.email : null,
      name: typeof cfg.name === 'string' ? cfg.name : null,
      scope: typeof cfg.scope === 'string' ? cfg.scope : '',
      accessToken,
      refreshToken: typeof cfg.refresh_token === 'string' ? cfg.refresh_token : null,
      accessTokenExpiresAt: typeof cfg.access_token_expires_at === 'string' ? cfg.access_token_expires_at : null,
      rawAuthConfig: cfg,
    };
  } catch (err) { logger.warn('loadZoomConnector failed', { tenantId, error: String(err) }); return null; }
}

/** Reverse-lookup tenants by Zoom account_id (for webhooks). */
export async function findZoomTenantsByAccount(accountId: string): Promise<{ tenantId: string; connectorId: string }[]> {
  if (!accountId) return [];
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from('connectors').select('id, tenant_id, auth_config').eq('system', 'zoom').eq('status', 'connected');
    if (!data) return [];
    return data.filter(r => ((r.auth_config ?? {}) as any).account_id === accountId).map(r => ({ tenantId: String(r.tenant_id), connectorId: String(r.id) }));
  } catch (err) { logger.warn('findZoomTenantsByAccount failed', { error: String(err) }); return []; }
}

async function refreshIfNeeded(connector: ZoomConnector): Promise<ZoomConnector> {
  const exp = connector.accessTokenExpiresAt ? Date.parse(connector.accessTokenExpiresAt) : 0;
  if (exp && exp - Date.now() > 60_000) return connector;
  if (!connector.refreshToken) return connector;
  const env = readEnv(); if (!env) return connector;
  try {
    const grant = await refreshAccessToken({ refreshToken: connector.refreshToken, env });
    const supabase = getSupabaseAdmin();
    const merged = { ...connector.rawAuthConfig, access_token: grant.accessToken, refresh_token: grant.refreshToken ?? connector.refreshToken, token_type: grant.tokenType, scope: grant.scope || connector.scope, access_token_expires_at: new Date(Date.now() + grant.expiresIn * 1000).toISOString() };
    await supabase.from('connectors').update({ auth_config: merged, updated_at: new Date().toISOString() }).eq('id', connector.id);
    return { ...connector, accessToken: grant.accessToken, refreshToken: grant.refreshToken ?? connector.refreshToken, accessTokenExpiresAt: new Date(Date.now() + grant.expiresIn * 1000).toISOString(), rawAuthConfig: merged };
  } catch (err) { logger.warn('zoom token refresh failed', { connectorId: connector.id, error: String(err) }); return connector; }
}

export async function zoomForTenant(tenantId: string, workspaceId: string | null): Promise<{ adapter: ZoomAdapter; connector: ZoomConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expiresAt - 60_000 && Date.now() - hit.cachedAt < 5 * 60_000) {
    const connector = await loadZoomConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }
  let connector = await loadZoomConnector(tenantId);
  if (!connector) { cache.delete(key); return null; }
  connector = await refreshIfNeeded(connector);
  const adapter = new ZoomAdapter(connector.accessToken);
  const exp = connector.accessTokenExpiresAt ? Date.parse(connector.accessTokenExpiresAt) : Date.now() + 3_600_000;
  cache.set(key, { adapter, cachedAt: Date.now(), expiresAt: exp });
  return { adapter, connector };
}

export function invalidateZoomForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}
