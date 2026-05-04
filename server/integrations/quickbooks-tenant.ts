/**
 * server/integrations/quickbooks-tenant.ts
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { QuickBooksAdapter } from './quickbooks.js';
import { refreshAccessToken, type QuickBooksOAuthEnv } from './quickbooks-oauth.js';

interface CacheEntry { adapter: QuickBooksAdapter; cachedAt: number; expiresAt: number }
const cache = new Map<string, CacheEntry>();
const cacheKey = (t: string, w: string | null) => `${t}::${w ?? '_'}`;

export interface QuickBooksConnector {
  id: string; tenantId: string;
  realmId: string; companyName: string | null;
  scope: string;
  accessToken: string; refreshToken: string | null;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  rawAuthConfig: Record<string, unknown>;
}

function readEnv(): QuickBooksOAuthEnv | null {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
  const stateSecret = process.env.QUICKBOOKS_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const verifierToken = process.env.QUICKBOOKS_VERIFIER_TOKEN || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret || !publicBase || !stateSecret) return null;
  return { clientId, clientSecret, stateSecret, verifierToken, redirectUri: `https://${publicBase}/api/integrations/quickbooks/callback` };
}

export async function loadQuickBooksConnector(tenantId: string): Promise<QuickBooksConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('connectors').select('id, tenant_id, system, status, auth_config').eq('tenant_id', tenantId).eq('system', 'quickbooks').eq('status', 'connected').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error; if (!data) return null;
    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const accessToken = typeof cfg.access_token === 'string' ? cfg.access_token : '';
    const realmId = typeof cfg.realm_id === 'string' ? cfg.realm_id : '';
    if (!accessToken || !realmId) return null;
    return {
      id: String(data.id), tenantId: String(data.tenant_id),
      realmId, companyName: typeof cfg.company_name === 'string' ? cfg.company_name : null,
      scope: typeof cfg.scope === 'string' ? cfg.scope : '',
      accessToken,
      refreshToken: typeof cfg.refresh_token === 'string' ? cfg.refresh_token : null,
      accessTokenExpiresAt: typeof cfg.access_token_expires_at === 'string' ? cfg.access_token_expires_at : null,
      refreshTokenExpiresAt: typeof cfg.refresh_token_expires_at === 'string' ? cfg.refresh_token_expires_at : null,
      rawAuthConfig: cfg,
    };
  } catch (err) { logger.warn('loadQuickBooksConnector failed', { tenantId, error: String(err) }); return null; }
}

/** QB webhooks include realmId per event in payload — find tenant by realmId. */
export async function findQuickBooksTenantsByRealm(realmId: string): Promise<{ tenantId: string; connectorId: string }[]> {
  if (!realmId) return [];
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from('connectors').select('id, tenant_id, auth_config').eq('system', 'quickbooks').eq('status', 'connected');
    if (!data) return [];
    return data.filter(r => ((r.auth_config ?? {}) as any).realm_id === realmId).map(r => ({ tenantId: String(r.tenant_id), connectorId: String(r.id) }));
  } catch (err) { logger.warn('findQuickBooksTenantsByRealm failed', { error: String(err) }); return []; }
}

async function refreshIfNeeded(connector: QuickBooksConnector): Promise<QuickBooksConnector> {
  const exp = connector.accessTokenExpiresAt ? Date.parse(connector.accessTokenExpiresAt) : 0;
  if (exp && exp - Date.now() > 60_000) return connector;
  if (!connector.refreshToken) return connector;
  const env = readEnv(); if (!env) return connector;
  try {
    const grant = await refreshAccessToken({ refreshToken: connector.refreshToken, env });
    const supabase = getSupabaseAdmin();
    const merged = { ...connector.rawAuthConfig, access_token: grant.accessToken, refresh_token: grant.refreshToken, access_token_expires_at: new Date(Date.now() + grant.expiresIn * 1000).toISOString(), refresh_token_expires_at: new Date(Date.now() + grant.xRefreshTokenExpiresIn * 1000).toISOString() };
    await supabase.from('connectors').update({ auth_config: merged, updated_at: new Date().toISOString() }).eq('id', connector.id);
    return { ...connector, accessToken: grant.accessToken, refreshToken: grant.refreshToken, accessTokenExpiresAt: new Date(Date.now() + grant.expiresIn * 1000).toISOString(), refreshTokenExpiresAt: new Date(Date.now() + grant.xRefreshTokenExpiresIn * 1000).toISOString(), rawAuthConfig: merged };
  } catch (err) { logger.warn('quickbooks token refresh failed', { connectorId: connector.id, error: String(err) }); return connector; }
}

export async function quickbooksForTenant(tenantId: string, workspaceId: string | null): Promise<{ adapter: QuickBooksAdapter; connector: QuickBooksConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expiresAt - 60_000 && Date.now() - hit.cachedAt < 5 * 60_000) {
    const connector = await loadQuickBooksConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }
  let connector = await loadQuickBooksConnector(tenantId);
  if (!connector) { cache.delete(key); return null; }
  connector = await refreshIfNeeded(connector);
  const adapter = new QuickBooksAdapter(connector.accessToken, connector.realmId);
  const exp = connector.accessTokenExpiresAt ? Date.parse(connector.accessTokenExpiresAt) : Date.now() + 3_600_000;
  cache.set(key, { adapter, cachedAt: Date.now(), expiresAt: exp });
  return { adapter, connector };
}

export function invalidateQuickBooksForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}
