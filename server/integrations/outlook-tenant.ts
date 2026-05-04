/**
 * server/integrations/outlook-tenant.ts
 *
 * Per-tenant Outlook adapter resolution. Same shape as gmail-tenant.ts:
 * loads the connector row, refreshes the access token if it's about to
 * expire, persists the rotated token, returns a ready-to-use adapter.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { OutlookAdapter } from './outlook.js';
import { refreshAccessToken, type OutlookOAuthEnv } from './outlook-oauth.js';

interface CacheEntry {
  adapter: OutlookAdapter;
  email: string;
  expiresAt: string;
  cachedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function cacheKey(tenantId: string, workspaceId: string | null): string {
  return `${tenantId}::${workspaceId ?? '_'}`;
}

export interface OutlookConnector {
  id: string;
  tenantId: string;
  email: string;
  displayName: string | null;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scope: string;
  subscriptionId: string | null;
  subscriptionExpiresAt: string | null;
  subscriptionClientState: string | null;
  rawAuthConfig: Record<string, unknown>;
}

function readEnv(): OutlookOAuthEnv | null {
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  const tenant = process.env.MS_TENANT_ID || 'common';
  const stateSecret = process.env.OUTLOOK_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret || !publicBase) return null;
  return {
    clientId,
    clientSecret,
    tenant,
    stateSecret,
    redirectUri: `https://${publicBase}/api/integrations/outlook/callback`,
  };
}

export async function loadOutlookConnector(tenantId: string): Promise<OutlookConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, name, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'outlook')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const accessToken = typeof cfg.access_token === 'string' ? cfg.access_token : '';
    const refreshToken = typeof cfg.refresh_token === 'string' ? cfg.refresh_token : '';
    if (!accessToken || !refreshToken) return null;

    return {
      id: String(data.id),
      tenantId: String(data.tenant_id),
      email: typeof cfg.email === 'string' ? cfg.email : String(data.name ?? ''),
      displayName: typeof cfg.display_name === 'string' ? cfg.display_name : null,
      accessToken,
      refreshToken,
      expiresAt: typeof cfg.expires_at === 'string' ? cfg.expires_at : new Date(0).toISOString(),
      scope: typeof cfg.scope === 'string' ? cfg.scope : '',
      subscriptionId: typeof cfg.subscription_id === 'string' ? cfg.subscription_id : null,
      subscriptionExpiresAt: typeof cfg.subscription_expires_at === 'string' ? cfg.subscription_expires_at : null,
      subscriptionClientState: typeof cfg.subscription_client_state === 'string' ? cfg.subscription_client_state : null,
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadOutlookConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

async function persistRefreshedToken(connectorId: string, updates: { access_token: string; expires_at: string; refresh_token?: string }): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const { data: row } = await supabase.from('connectors').select('auth_config').eq('id', connectorId).maybeSingle();
    if (!row) return;
    const merged = { ...((row.auth_config ?? {}) as Record<string, unknown>), ...updates };
    await supabase.from('connectors').update({ auth_config: merged, updated_at: new Date().toISOString() }).eq('id', connectorId);
  } catch (err) {
    logger.warn('outlook persistRefreshedToken failed', { connectorId, error: String(err) });
  }
}

export async function outlookForTenant(
  tenantId: string,
  workspaceId: string | null,
): Promise<{ adapter: OutlookAdapter; email: string; connector: OutlookConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS && new Date(hit.expiresAt) > new Date(Date.now() + 60_000)) {
    const connector = await loadOutlookConnector(tenantId);
    if (connector) return { adapter: hit.adapter, email: hit.email, connector };
  }

  const connector = await loadOutlookConnector(tenantId);
  if (!connector) {
    cache.delete(key);
    return null;
  }

  let accessToken = connector.accessToken;
  let expiresAt = connector.expiresAt;
  if (new Date(expiresAt).getTime() - Date.now() < 60_000) {
    const env = readEnv();
    if (!env) {
      logger.warn('outlookForTenant: cannot refresh without MS_CLIENT_ID/SECRET');
      return null;
    }
    try {
      const refreshed = await refreshAccessToken({ refreshToken: connector.refreshToken, env });
      accessToken = refreshed.accessToken;
      expiresAt = refreshed.expiresAt;
      await persistRefreshedToken(connector.id, {
        access_token: refreshed.accessToken,
        expires_at: refreshed.expiresAt,
        ...(refreshed.refreshToken !== connector.refreshToken
          ? { refresh_token: refreshed.refreshToken }
          : {}),
      });
    } catch (err) {
      logger.warn('Outlook token refresh failed', { tenantId, error: String(err) });
      return null;
    }
  }

  const adapter = new OutlookAdapter(accessToken);
  cache.set(key, {
    adapter,
    email: connector.email,
    expiresAt,
    cachedAt: Date.now(),
  });

  return { adapter, email: connector.email, connector };
}

export function invalidateOutlookForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}

/**
 * Resolve the tenant from an inbound Microsoft Graph notification. Each
 * notification carries `subscriptionId` + `clientState`; we look up the
 * connector that owns that pair (clientState is what makes it secure —
 * an attacker who guesses the subscriptionId still can't forge the state).
 */
export async function findTenantBySubscriptionId(subscriptionId: string, clientState: string): Promise<{ tenantId: string; connectorId: string; accessToken: string; refreshToken: string; expiresAt: string } | null> {
  if (!subscriptionId || !clientState) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, auth_config')
      .eq('system', 'outlook')
      .eq('status', 'connected');
    if (error || !data) return null;

    const match = (data as Array<{ id: string; tenant_id: string; auth_config: any }>).find((row) => {
      const cfg = row.auth_config ?? {};
      return cfg.subscription_id === subscriptionId && cfg.subscription_client_state === clientState;
    });
    if (!match) return null;
    const cfg = match.auth_config ?? {};
    return {
      tenantId: match.tenant_id,
      connectorId: match.id,
      accessToken: cfg.access_token ?? '',
      refreshToken: cfg.refresh_token ?? '',
      expiresAt: cfg.expires_at ?? '',
    };
  } catch (err) {
    logger.warn('findTenantBySubscriptionId failed', { error: String(err) });
    return null;
  }
}
