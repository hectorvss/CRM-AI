/**
 * server/integrations/salesforce-tenant.ts
 *
 * Per-tenant Salesforce adapter. Refresh-token grant with auto-rotation:
 * the access_token is opaque; we keep `expires_at` (90 min default) and
 * silently refresh when within 60s of expiry. Each refresh may return a
 * new instance_url (rare, but happens during org migrations) so we
 * persist that too.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { SalesforceAdapter } from './salesforce.js';
import { refreshAccessToken, type SalesforceMode, type SalesforceOAuthEnv } from './salesforce-oauth.js';

interface CacheEntry {
  adapter: SalesforceAdapter;
  expiresAt: string;
  instanceUrl: string;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(tenantId: string, workspaceId: string | null): string {
  return `${tenantId}::${workspaceId ?? '_'}`;
}

export interface SalesforceConnector {
  id: string;
  tenantId: string;
  mode: SalesforceMode;
  instanceUrl: string;
  identityUrl: string | null;
  organizationId: string | null;
  userId: string | null;
  email: string | null;
  username: string | null;
  refreshToken: string;
  cachedAccessToken: string | null;
  cachedExpiresAt: string | null;
  apiVersion: string;
  pushTopics: string[];
  rawAuthConfig: Record<string, unknown>;
}

export async function loadSalesforceConnector(tenantId: string): Promise<SalesforceConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'salesforce')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const refreshToken = typeof cfg.refresh_token === 'string' ? cfg.refresh_token : '';
    const instanceUrl = typeof cfg.instance_url === 'string' ? cfg.instance_url : '';
    if (!refreshToken || !instanceUrl) return null;

    return {
      id: String(data.id),
      tenantId: String(data.tenant_id),
      mode: (cfg.mode === 'sandbox' ? 'sandbox' : 'production') as SalesforceMode,
      instanceUrl,
      identityUrl: typeof cfg.identity_url === 'string' ? cfg.identity_url : null,
      organizationId: typeof cfg.organization_id === 'string' ? cfg.organization_id : null,
      userId: typeof cfg.user_id === 'string' ? cfg.user_id : null,
      email: typeof cfg.email === 'string' ? cfg.email : null,
      username: typeof cfg.username === 'string' ? cfg.username : null,
      refreshToken,
      cachedAccessToken: typeof cfg.access_token === 'string' ? cfg.access_token : null,
      cachedExpiresAt: typeof cfg.expires_at === 'string' ? cfg.expires_at : null,
      apiVersion: typeof cfg.api_version === 'string' ? cfg.api_version : 'v59.0',
      pushTopics: Array.isArray(cfg.push_topics) ? (cfg.push_topics as string[]) : [],
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadSalesforceConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

async function persistRefreshedToken(connectorId: string, accessToken: string, expiresAt: string, instanceUrl: string, refreshToken: string): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const { data: row } = await supabase.from('connectors').select('auth_config').eq('id', connectorId).maybeSingle();
    if (!row) return;
    const merged = {
      ...((row.auth_config ?? {}) as Record<string, unknown>),
      access_token: accessToken,
      expires_at: expiresAt,
      instance_url: instanceUrl,
      refresh_token: refreshToken,
    };
    await supabase
      .from('connectors')
      .update({ auth_config: merged, updated_at: new Date().toISOString() })
      .eq('id', connectorId);
  } catch (err) {
    logger.warn('salesforce persistRefreshedToken failed', { connectorId, error: String(err) });
  }
}

function envFromConfig(): SalesforceOAuthEnv {
  return {
    clientId: process.env.SALESFORCE_CLIENT_ID ?? '',
    clientSecret: process.env.SALESFORCE_CLIENT_SECRET ?? '',
    redirectUri: process.env.SALESFORCE_REDIRECT_URI
      ?? `${(process.env.PUBLIC_BASE_URL ?? '').replace(/\/$/, '') || ''}/api/integrations/salesforce/callback`,
    stateSecret: process.env.SALESFORCE_STATE_SECRET ?? process.env.STATE_SECRET ?? 'dev-secret',
  };
}

export async function salesforceForTenant(
  tenantId: string,
  workspaceId: string | null,
): Promise<{ adapter: SalesforceAdapter; connector: SalesforceConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && new Date(hit.expiresAt) > new Date(Date.now() + 60_000) && Date.now() - hit.cachedAt < 30 * 60_000) {
    const connector = await loadSalesforceConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }

  const connector = await loadSalesforceConnector(tenantId);
  if (!connector) {
    cache.delete(key);
    return null;
  }

  let accessToken = connector.cachedAccessToken;
  let expiresAt = connector.cachedExpiresAt;
  let instanceUrl = connector.instanceUrl;
  let refreshToken = connector.refreshToken;
  const stillValid = expiresAt && new Date(expiresAt).getTime() - Date.now() > 60_000;

  if (!accessToken || !stillValid) {
    try {
      const fresh = await refreshAccessToken({
        refreshToken: connector.refreshToken,
        mode: connector.mode,
        env: envFromConfig(),
      });
      accessToken = fresh.accessToken;
      expiresAt = fresh.expiresAt;
      instanceUrl = fresh.instanceUrl;
      refreshToken = fresh.refreshToken;
      await persistRefreshedToken(connector.id, accessToken!, expiresAt!, instanceUrl, refreshToken);
    } catch (err) {
      logger.warn('Salesforce refresh failed', { tenantId, error: String(err) });
      return null;
    }
  }

  const adapter = new SalesforceAdapter(accessToken!, instanceUrl, connector.apiVersion);
  cache.set(key, {
    adapter,
    expiresAt: expiresAt!,
    instanceUrl,
    cachedAt: Date.now(),
  });
  return { adapter, connector };
}

export function invalidateSalesforceForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}
