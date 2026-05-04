/**
 * server/integrations/zendesk-tenant.ts
 *
 * Per-tenant Zendesk adapter resolver. Tokens are typically long-lived
 * (no expiry) but newer accounts can opt into rotation, in which case
 * we refresh transparently.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { ZendeskAdapter } from './zendesk.js';
import { refreshAccessToken, type ZendeskOAuthEnv } from './zendesk-oauth.js';

interface CacheEntry {
  adapter: ZendeskAdapter;
  expiresAt: string | null;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(tenantId: string, workspaceId: string | null): string {
  return `${tenantId}::${workspaceId ?? '_'}`;
}

export interface ZendeskConnector {
  id: string;
  tenantId: string;
  subdomain: string;
  scopes: string[];
  refreshToken: string | null;
  cachedAccessToken: string | null;
  cachedExpiresAt: string | null;
  webhookId: string | null;
  webhookSecret: string | null;
  rawAuthConfig: Record<string, unknown>;
}

export async function loadZendeskConnector(tenantId: string): Promise<ZendeskConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'zendesk')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const accessToken = typeof cfg.access_token === 'string' ? cfg.access_token : '';
    const subdomain = typeof cfg.subdomain === 'string' ? cfg.subdomain : '';
    if (!accessToken || !subdomain) return null;

    return {
      id: String(data.id),
      tenantId: String(data.tenant_id),
      subdomain,
      scopes: typeof cfg.scope === 'string' ? cfg.scope.split(' ').filter(Boolean) : [],
      refreshToken: typeof cfg.refresh_token === 'string' ? cfg.refresh_token : null,
      cachedAccessToken: accessToken,
      cachedExpiresAt: typeof cfg.expires_at === 'string' ? cfg.expires_at : null,
      webhookId: typeof cfg.webhook_id === 'string' ? cfg.webhook_id : null,
      webhookSecret: typeof cfg.webhook_secret === 'string' ? cfg.webhook_secret : null,
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadZendeskConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

/** Reverse-lookup: find tenant whose webhook signing secret matches. */
export async function findTenantByZendeskWebhookSecret(secret: string): Promise<{ tenantId: string; connectorId: string; subdomain: string } | null> {
  if (!secret) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('connectors')
      .select('id, tenant_id, auth_config')
      .eq('system', 'zendesk')
      .eq('status', 'connected');
    if (!data) return null;
    for (const row of data) {
      const cfg = (row.auth_config ?? {}) as Record<string, unknown>;
      if (cfg.webhook_secret === secret) {
        return {
          tenantId: String(row.tenant_id),
          connectorId: String(row.id),
          subdomain: typeof cfg.subdomain === 'string' ? cfg.subdomain : '',
        };
      }
    }
    return null;
  } catch (err) {
    logger.warn('findTenantByZendeskWebhookSecret failed', { error: String(err) });
    return null;
  }
}

async function persistRefreshedToken(connectorId: string, accessToken: string, refreshToken: string | null, expiresAt: string | null): Promise<void> {
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
    logger.warn('zendesk persistRefreshedToken failed', { connectorId, error: String(err) });
  }
}

function envFromConfig(): ZendeskOAuthEnv {
  return {
    clientId: process.env.ZENDESK_CLIENT_ID ?? '',
    clientSecret: process.env.ZENDESK_CLIENT_SECRET ?? '',
    redirectUri: process.env.ZENDESK_REDIRECT_URI
      ?? `${(process.env.PUBLIC_BASE_URL ?? '').replace(/\/$/, '') || ''}/api/integrations/zendesk/callback`,
    stateSecret: process.env.ZENDESK_STATE_SECRET ?? process.env.STATE_SECRET ?? 'dev-secret',
  };
}

export async function zendeskForTenant(
  tenantId: string,
  workspaceId: string | null,
): Promise<{ adapter: ZendeskAdapter; connector: ZendeskConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < 15 * 60_000) {
    if (!hit.expiresAt || new Date(hit.expiresAt).getTime() - Date.now() > 60_000) {
      const connector = await loadZendeskConnector(tenantId);
      if (connector) return { adapter: hit.adapter, connector };
    }
  }

  const connector = await loadZendeskConnector(tenantId);
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
      const fresh = await refreshAccessToken({ refreshToken, subdomain: connector.subdomain, env: envFromConfig() });
      accessToken = fresh.accessToken;
      refreshToken = fresh.refreshToken;
      expiresAt = fresh.expiresAt;
      await persistRefreshedToken(connector.id, accessToken!, refreshToken, expiresAt);
    } catch (err) {
      logger.warn('Zendesk refresh failed', { tenantId, error: String(err) });
      return null;
    }
  }

  const adapter = new ZendeskAdapter(accessToken!, connector.subdomain);
  cache.set(key, { adapter, expiresAt, cachedAt: Date.now() });
  return { adapter, connector };
}

export function invalidateZendeskForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}
