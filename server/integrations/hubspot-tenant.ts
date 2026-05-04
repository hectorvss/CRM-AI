/**
 * server/integrations/hubspot-tenant.ts
 *
 * Per-tenant HubSpot adapter resolver. HubSpot tokens are short (~30 min)
 * so we refresh aggressively with a 60s safety margin.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { HubspotAdapter } from './hubspot.js';
import { refreshAccessToken, type HubspotOAuthEnv } from './hubspot-oauth.js';

interface CacheEntry {
  adapter: HubspotAdapter;
  expiresAt: string;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(tenantId: string, workspaceId: string | null): string {
  return `${tenantId}::${workspaceId ?? '_'}`;
}

export interface HubspotConnector {
  id: string;
  tenantId: string;
  hubId: number | null;
  appId: number | null;
  hubDomain: string | null;
  userEmail: string | null;
  userId: number | null;
  scopes: string[];
  refreshToken: string;
  cachedAccessToken: string | null;
  cachedExpiresAt: string | null;
  rawAuthConfig: Record<string, unknown>;
}

export async function loadHubspotConnector(tenantId: string): Promise<HubspotConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'hubspot')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const refreshToken = typeof cfg.refresh_token === 'string' ? cfg.refresh_token : '';
    if (!refreshToken) return null;

    return {
      id: String(data.id),
      tenantId: String(data.tenant_id),
      hubId: typeof cfg.hub_id === 'number' ? cfg.hub_id : null,
      appId: typeof cfg.app_id === 'number' ? cfg.app_id : null,
      hubDomain: typeof cfg.hub_domain === 'string' ? cfg.hub_domain : null,
      userEmail: typeof cfg.user_email === 'string' ? cfg.user_email : null,
      userId: typeof cfg.user_id === 'number' ? cfg.user_id : null,
      scopes: Array.isArray(cfg.scopes) ? (cfg.scopes as string[]) : [],
      refreshToken,
      cachedAccessToken: typeof cfg.access_token === 'string' ? cfg.access_token : null,
      cachedExpiresAt: typeof cfg.expires_at === 'string' ? cfg.expires_at : null,
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadHubspotConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

export async function findTenantByHubId(hubId: number): Promise<{ tenantId: string; connectorId: string } | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('connectors')
      .select('id, tenant_id, auth_config')
      .eq('system', 'hubspot')
      .eq('status', 'connected');
    if (!data) return null;
    for (const row of data) {
      const cfg = (row.auth_config ?? {}) as Record<string, unknown>;
      if (cfg.hub_id === hubId) {
        return { tenantId: String(row.tenant_id), connectorId: String(row.id) };
      }
    }
    return null;
  } catch (err) {
    logger.warn('findTenantByHubId failed', { hubId, error: String(err) });
    return null;
  }
}

async function persistRefreshedToken(connectorId: string, accessToken: string, refreshToken: string, expiresAt: string): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const { data: row } = await supabase.from('connectors').select('auth_config').eq('id', connectorId).maybeSingle();
    if (!row) return;
    const merged = {
      ...((row.auth_config ?? {}) as Record<string, unknown>),
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
    };
    await supabase
      .from('connectors')
      .update({ auth_config: merged, updated_at: new Date().toISOString() })
      .eq('id', connectorId);
  } catch (err) {
    logger.warn('hubspot persistRefreshedToken failed', { connectorId, error: String(err) });
  }
}

function envFromConfig(): HubspotOAuthEnv {
  return {
    clientId: process.env.HUBSPOT_CLIENT_ID ?? '',
    clientSecret: process.env.HUBSPOT_CLIENT_SECRET ?? '',
    redirectUri: process.env.HUBSPOT_REDIRECT_URI
      ?? `${(process.env.PUBLIC_BASE_URL ?? '').replace(/\/$/, '') || ''}/api/integrations/hubspot/callback`,
    stateSecret: process.env.HUBSPOT_STATE_SECRET ?? process.env.STATE_SECRET ?? 'dev-secret',
    appId: process.env.HUBSPOT_APP_ID,
  };
}

export async function hubspotForTenant(
  tenantId: string,
  workspaceId: string | null,
): Promise<{ adapter: HubspotAdapter; connector: HubspotConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && new Date(hit.expiresAt) > new Date(Date.now() + 60_000) && Date.now() - hit.cachedAt < 15 * 60_000) {
    const connector = await loadHubspotConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }

  const connector = await loadHubspotConnector(tenantId);
  if (!connector) {
    cache.delete(key);
    return null;
  }

  let accessToken = connector.cachedAccessToken;
  let expiresAt = connector.cachedExpiresAt;
  let refreshToken = connector.refreshToken;
  const stillValid = expiresAt && new Date(expiresAt).getTime() - Date.now() > 60_000;

  if (!accessToken || !stillValid) {
    try {
      const fresh = await refreshAccessToken({ refreshToken: connector.refreshToken, env: envFromConfig() });
      accessToken = fresh.accessToken;
      refreshToken = fresh.refreshToken;
      expiresAt = fresh.expiresAt;
      await persistRefreshedToken(connector.id, accessToken!, refreshToken, expiresAt!);
    } catch (err) {
      logger.warn('HubSpot refresh failed', { tenantId, error: String(err) });
      return null;
    }
  }

  const adapter = new HubspotAdapter(accessToken!);
  cache.set(key, { adapter, expiresAt: expiresAt!, cachedAt: Date.now() });
  return { adapter, connector };
}

export function invalidateHubspotForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}
