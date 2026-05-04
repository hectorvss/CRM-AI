/**
 * server/integrations/slack-tenant.ts
 *
 * Per-tenant Slack adapter resolver. Slack tokens are usually static
 * (xoxb-) but workspaces with token rotation enabled get refresh_token
 * + expires_in — we transparently refresh in that case.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { SlackAdapter } from './slack.js';
import { refreshAccessToken, type SlackOAuthEnv } from './slack-oauth.js';

interface CacheEntry {
  adapter: SlackAdapter;
  expiresAt: string | null;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(tenantId: string, workspaceId: string | null): string {
  return `${tenantId}::${workspaceId ?? '_'}`;
}

export interface SlackConnector {
  id: string;
  tenantId: string;
  teamId: string;
  teamName: string;
  teamDomain: string | null;
  appId: string;
  botUserId: string;
  installerUserId: string | null;
  scopes: string[];
  refreshToken: string | null;
  cachedAccessToken: string | null;
  cachedExpiresAt: string | null;
  rawAuthConfig: Record<string, unknown>;
}

export async function loadSlackConnector(tenantId: string): Promise<SlackConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'slack')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const accessToken = typeof cfg.access_token === 'string' ? cfg.access_token : '';
    if (!accessToken) return null;

    return {
      id: String(data.id),
      tenantId: String(data.tenant_id),
      teamId: typeof cfg.team_id === 'string' ? cfg.team_id : '',
      teamName: typeof cfg.team_name === 'string' ? cfg.team_name : '',
      teamDomain: typeof cfg.team_domain === 'string' ? cfg.team_domain : null,
      appId: typeof cfg.app_id === 'string' ? cfg.app_id : '',
      botUserId: typeof cfg.bot_user_id === 'string' ? cfg.bot_user_id : '',
      installerUserId: typeof cfg.installer_user_id === 'string' ? cfg.installer_user_id : null,
      scopes: Array.isArray(cfg.scopes) ? (cfg.scopes as string[]) : (typeof cfg.scope === 'string' ? cfg.scope.split(',') : []),
      refreshToken: typeof cfg.refresh_token === 'string' ? cfg.refresh_token : null,
      cachedAccessToken: accessToken,
      cachedExpiresAt: typeof cfg.expires_at === 'string' ? cfg.expires_at : null,
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadSlackConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

/**
 * Reverse-lookup: given a Slack team_id from an inbound Events API event,
 * resolve the tenant + workspace it belongs to.
 */
export async function findTenantBySlackTeam(teamId: string): Promise<{ tenantId: string; connectorId: string } | null> {
  if (!teamId) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('connectors')
      .select('id, tenant_id, auth_config')
      .eq('system', 'slack')
      .eq('status', 'connected');
    if (!data) return null;
    for (const row of data) {
      const cfg = (row.auth_config ?? {}) as Record<string, unknown>;
      if (cfg.team_id === teamId) {
        return { tenantId: String(row.tenant_id), connectorId: String(row.id) };
      }
    }
    return null;
  } catch (err) {
    logger.warn('findTenantBySlackTeam failed', { teamId, error: String(err) });
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
    logger.warn('slack persistRefreshedToken failed', { connectorId, error: String(err) });
  }
}

function envFromConfig(): SlackOAuthEnv {
  return {
    clientId: process.env.SLACK_CLIENT_ID ?? '',
    clientSecret: process.env.SLACK_CLIENT_SECRET ?? '',
    redirectUri: process.env.SLACK_REDIRECT_URI
      ?? `${(process.env.PUBLIC_BASE_URL ?? '').replace(/\/$/, '') || ''}/api/integrations/slack/callback`,
    stateSecret: process.env.SLACK_STATE_SECRET ?? process.env.STATE_SECRET ?? 'dev-secret',
    signingSecret: process.env.SLACK_SIGNING_SECRET ?? '',
  };
}

export async function slackForTenant(
  tenantId: string,
  workspaceId: string | null,
): Promise<{ adapter: SlackAdapter; connector: SlackConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  // Static tokens have no expiresAt — cache for 15 min then re-check the row
  // in case the merchant rotated/disconnected.
  if (hit && Date.now() - hit.cachedAt < 15 * 60_000) {
    if (!hit.expiresAt || new Date(hit.expiresAt).getTime() - Date.now() > 60_000) {
      const connector = await loadSlackConnector(tenantId);
      if (connector) return { adapter: hit.adapter, connector };
    }
  }

  const connector = await loadSlackConnector(tenantId);
  if (!connector) {
    cache.delete(key);
    return null;
  }

  let accessToken = connector.cachedAccessToken;
  let refreshToken = connector.refreshToken;
  let expiresAt = connector.cachedExpiresAt;
  const stillValid = !expiresAt || new Date(expiresAt).getTime() - Date.now() > 60_000;

  if (!stillValid && refreshToken) {
    try {
      const fresh = await refreshAccessToken({ refreshToken, env: envFromConfig() });
      accessToken = fresh.accessToken;
      refreshToken = fresh.refreshToken;
      expiresAt = fresh.expiresAt;
      await persistRefreshedToken(connector.id, accessToken!, refreshToken, expiresAt!);
    } catch (err) {
      logger.warn('Slack refresh failed', { tenantId, error: String(err) });
      return null;
    }
  }

  const adapter = new SlackAdapter(accessToken!);
  cache.set(key, { adapter, expiresAt, cachedAt: Date.now() });
  return { adapter, connector };
}

export function invalidateSlackForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}
