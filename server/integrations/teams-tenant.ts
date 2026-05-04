/**
 * server/integrations/teams-tenant.ts
 *
 * Per-tenant Microsoft Teams adapter resolver. Reuses the same Identity
 * Platform refresh-token flow as Outlook; tokens are ~1h, refresh
 * proactively at 60s before expiry.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { TeamsAdapter } from './teams.js';
import { refreshAccessToken, type TeamsOAuthEnv } from './teams-oauth.js';

interface CacheEntry {
  adapter: TeamsAdapter;
  expiresAt: string;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(tenantId: string, workspaceId: string | null): string {
  return `${tenantId}::${workspaceId ?? '_'}`;
}

export interface TeamsConnector {
  id: string;
  tenantId: string;
  msUserId: string;
  msUserPrincipalName: string;
  msUserMail: string | null;
  msUserDisplayName: string | null;
  refreshToken: string;
  cachedAccessToken: string | null;
  cachedExpiresAt: string | null;
  scope: string | null;
  /** Map of resource → { subscription_id, expiration_dt, client_state } */
  subscriptions: Record<string, { id: string; expires: string; clientState: string }>;
  rawAuthConfig: Record<string, unknown>;
}

export async function loadTeamsConnector(tenantId: string): Promise<TeamsConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'teams')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const refreshToken = typeof cfg.refresh_token === 'string' ? cfg.refresh_token : '';
    const msUserId = typeof cfg.ms_user_id === 'string' ? cfg.ms_user_id : '';
    if (!refreshToken || !msUserId) return null;

    return {
      id: String(data.id),
      tenantId: String(data.tenant_id),
      msUserId,
      msUserPrincipalName: typeof cfg.ms_user_principal_name === 'string' ? cfg.ms_user_principal_name : '',
      msUserMail: typeof cfg.ms_user_mail === 'string' ? cfg.ms_user_mail : null,
      msUserDisplayName: typeof cfg.ms_user_display_name === 'string' ? cfg.ms_user_display_name : null,
      refreshToken,
      cachedAccessToken: typeof cfg.access_token === 'string' ? cfg.access_token : null,
      cachedExpiresAt: typeof cfg.expires_at === 'string' ? cfg.expires_at : null,
      scope: typeof cfg.scope === 'string' ? cfg.scope : null,
      subscriptions: (cfg.subscriptions ?? {}) as Record<string, { id: string; expires: string; clientState: string }>,
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadTeamsConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

/** Reverse-lookup by Graph subscription clientState (per-subscription secret). */
export async function findTenantByTeamsClientState(clientState: string): Promise<{ tenantId: string; connectorId: string } | null> {
  if (!clientState) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('connectors')
      .select('id, tenant_id, auth_config')
      .eq('system', 'teams')
      .eq('status', 'connected');
    if (!data) return null;
    for (const row of data) {
      const cfg = (row.auth_config ?? {}) as Record<string, unknown>;
      const subs = (cfg.subscriptions ?? {}) as Record<string, { clientState?: string }>;
      for (const v of Object.values(subs)) {
        if (v?.clientState === clientState) {
          return { tenantId: String(row.tenant_id), connectorId: String(row.id) };
        }
      }
    }
    return null;
  } catch (err) {
    logger.warn('findTenantByTeamsClientState failed', { error: String(err) });
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
    logger.warn('teams persistRefreshedToken failed', { connectorId, error: String(err) });
  }
}

function envFromConfig(): TeamsOAuthEnv {
  return {
    clientId: process.env.TEAMS_CLIENT_ID ?? process.env.MS_CLIENT_ID ?? '',
    clientSecret: process.env.TEAMS_CLIENT_SECRET ?? process.env.MS_CLIENT_SECRET ?? '',
    tenant: process.env.TEAMS_TENANT_ID ?? process.env.MS_TENANT_ID ?? 'common',
    redirectUri: process.env.TEAMS_REDIRECT_URI
      ?? `${(process.env.PUBLIC_BASE_URL ?? '').replace(/\/$/, '') || ''}/api/integrations/teams/callback`,
    stateSecret: process.env.TEAMS_STATE_SECRET ?? process.env.STATE_SECRET ?? 'dev-secret',
  };
}

export async function teamsForTenant(
  tenantId: string,
  workspaceId: string | null,
): Promise<{ adapter: TeamsAdapter; connector: TeamsConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && new Date(hit.expiresAt) > new Date(Date.now() + 60_000) && Date.now() - hit.cachedAt < 30 * 60_000) {
    const connector = await loadTeamsConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }

  const connector = await loadTeamsConnector(tenantId);
  if (!connector) {
    cache.delete(key);
    return null;
  }

  let accessToken = connector.cachedAccessToken;
  let refreshToken = connector.refreshToken;
  let expiresAt = connector.cachedExpiresAt;
  const stillValid = expiresAt && new Date(expiresAt).getTime() - Date.now() > 60_000;

  if (!accessToken || !stillValid) {
    try {
      const fresh = await refreshAccessToken({ refreshToken, env: envFromConfig() });
      accessToken = fresh.accessToken;
      refreshToken = fresh.refreshToken;
      expiresAt = fresh.expiresAt;
      await persistRefreshedToken(connector.id, accessToken!, refreshToken, expiresAt!);
    } catch (err) {
      logger.warn('Teams refresh failed', { tenantId, error: String(err) });
      return null;
    }
  }

  const adapter = new TeamsAdapter(accessToken!);
  cache.set(key, { adapter, expiresAt: expiresAt!, cachedAt: Date.now() });
  return { adapter, connector };
}

export function invalidateTeamsForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}
