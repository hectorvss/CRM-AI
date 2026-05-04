/**
 * server/integrations/confluence-tenant.ts
 *
 * Per-tenant Confluence adapter resolver. Same refresh pattern as Jira:
 * 1h access token, transparent refresh 60s before expiry.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { ConfluenceAdapter } from './confluence.js';
import { refreshAccessToken, type ConfluenceOAuthEnv } from './confluence-oauth.js';

interface CacheEntry { adapter: ConfluenceAdapter; cachedAt: number; expiresAt: number }
const cache = new Map<string, CacheEntry>();
const cacheKey = (t: string, w: string | null) => `${t}::${w ?? '_'}`;

export interface ConfluenceConnector {
  id: string;
  tenantId: string;
  cloudId: string;
  siteName: string | null;
  siteUrl: string | null;
  accountId: string | null;
  accountEmail: string | null;
  accountName: string | null;
  scope: string;
  accessToken: string;
  refreshToken: string | null;
  accessTokenExpiresAt: string | null;
  rawAuthConfig: Record<string, unknown>;
}

function readEnv(): ConfluenceOAuthEnv | null {
  const clientId = process.env.CONFLUENCE_CLIENT_ID;
  const clientSecret = process.env.CONFLUENCE_CLIENT_SECRET;
  const stateSecret = process.env.CONFLUENCE_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret || !publicBase || !stateSecret) return null;
  return { clientId, clientSecret, stateSecret, redirectUri: `https://${publicBase}/api/integrations/confluence/callback` };
}

export async function loadConfluenceConnector(tenantId: string): Promise<ConfluenceConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'confluence')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const accessToken = typeof cfg.access_token === 'string' ? cfg.access_token : '';
    const cloudId = typeof cfg.cloud_id === 'string' ? cfg.cloud_id : '';
    if (!accessToken || !cloudId) return null;
    return {
      id: String(data.id),
      tenantId: String(data.tenant_id),
      cloudId,
      siteName: typeof cfg.site_name === 'string' ? cfg.site_name : null,
      siteUrl: typeof cfg.site_url === 'string' ? cfg.site_url : null,
      accountId: typeof cfg.account_id === 'string' ? cfg.account_id : null,
      accountEmail: typeof cfg.account_email === 'string' ? cfg.account_email : null,
      accountName: typeof cfg.account_name === 'string' ? cfg.account_name : null,
      scope: typeof cfg.scope === 'string' ? cfg.scope : '',
      accessToken,
      refreshToken: typeof cfg.refresh_token === 'string' ? cfg.refresh_token : null,
      accessTokenExpiresAt: typeof cfg.access_token_expires_at === 'string' ? cfg.access_token_expires_at : null,
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadConfluenceConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

async function refreshIfNeeded(connector: ConfluenceConnector): Promise<ConfluenceConnector> {
  const exp = connector.accessTokenExpiresAt ? Date.parse(connector.accessTokenExpiresAt) : 0;
  if (exp && exp - Date.now() > 60_000) return connector;
  if (!connector.refreshToken) return connector;
  const env = readEnv();
  if (!env) return connector;
  try {
    const grant = await refreshAccessToken({ refreshToken: connector.refreshToken, env });
    const supabase = getSupabaseAdmin();
    const merged = {
      ...connector.rawAuthConfig,
      access_token: grant.accessToken,
      refresh_token: grant.refreshToken ?? connector.refreshToken,
      token_type: grant.tokenType,
      scope: grant.scope || connector.scope,
      access_token_expires_at: new Date(Date.now() + grant.expiresIn * 1000).toISOString(),
    };
    await supabase
      .from('connectors')
      .update({ auth_config: merged, updated_at: new Date().toISOString() })
      .eq('id', connector.id);
    return {
      ...connector,
      accessToken: grant.accessToken,
      refreshToken: grant.refreshToken ?? connector.refreshToken,
      accessTokenExpiresAt: new Date(Date.now() + grant.expiresIn * 1000).toISOString(),
      rawAuthConfig: merged,
    };
  } catch (err) {
    logger.warn('confluence token refresh failed', { connectorId: connector.id, error: String(err) });
    return connector;
  }
}

export async function confluenceForTenant(tenantId: string, workspaceId: string | null): Promise<{ adapter: ConfluenceAdapter; connector: ConfluenceConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expiresAt - 60_000 && Date.now() - hit.cachedAt < 5 * 60_000) {
    const connector = await loadConfluenceConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }
  let connector = await loadConfluenceConnector(tenantId);
  if (!connector) { cache.delete(key); return null; }
  connector = await refreshIfNeeded(connector);
  const adapter = new ConfluenceAdapter(connector.accessToken, connector.cloudId);
  const exp = connector.accessTokenExpiresAt ? Date.parse(connector.accessTokenExpiresAt) : Date.now() + 3_600_000;
  cache.set(key, { adapter, cachedAt: Date.now(), expiresAt: exp });
  return { adapter, connector };
}

export function invalidateConfluenceForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}
