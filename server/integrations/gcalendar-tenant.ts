/**
 * server/integrations/gcalendar-tenant.ts
 *
 * Per-tenant Google Calendar adapter resolver. 1h access tokens; transparent
 * refresh via shared google-oauth helpers.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { GCalendarAdapter } from './gcalendar.js';
import { refreshAccessToken, type GoogleOAuthEnv } from './google-oauth.js';

interface CacheEntry { adapter: GCalendarAdapter; cachedAt: number; expiresAt: number }
const cache = new Map<string, CacheEntry>();
const cacheKey = (t: string, w: string | null) => `${t}::${w ?? '_'}`;

export interface GCalChannelEntry {
  channel_id: string;
  resource_id: string;
  calendar_id: string;
  token: string;
  expiration: string;
}

export interface GCalendarConnector {
  id: string;
  tenantId: string;
  googleSub: string;
  email: string | null;
  name: string | null;
  scope: string;
  accessToken: string;
  refreshToken: string | null;
  accessTokenExpiresAt: string | null;
  channels: GCalChannelEntry[];
  rawAuthConfig: Record<string, unknown>;
}

function readEnv(): GoogleOAuthEnv | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const stateSecret = process.env.GOOGLE_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret || !publicBase || !stateSecret) return null;
  return { clientId, clientSecret, stateSecret, redirectUri: `https://${publicBase}/api/integrations/gcalendar/callback` };
}

export async function loadGCalendarConnector(tenantId: string): Promise<GCalendarConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'gcalendar')
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
      googleSub: typeof cfg.google_sub === 'string' ? cfg.google_sub : '',
      email: typeof cfg.email === 'string' ? cfg.email : null,
      name: typeof cfg.name === 'string' ? cfg.name : null,
      scope: typeof cfg.scope === 'string' ? cfg.scope : '',
      accessToken,
      refreshToken: typeof cfg.refresh_token === 'string' ? cfg.refresh_token : null,
      accessTokenExpiresAt: typeof cfg.access_token_expires_at === 'string' ? cfg.access_token_expires_at : null,
      channels: Array.isArray(cfg.channels) ? cfg.channels as GCalChannelEntry[] : [],
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadGCalendarConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

export async function findTenantByGCalChannelToken(token: string): Promise<{ tenantId: string; connectorId: string; channel: GCalChannelEntry } | null> {
  if (!token) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('connectors')
      .select('id, tenant_id, auth_config')
      .eq('system', 'gcalendar')
      .eq('status', 'connected');
    if (!data) return null;
    for (const row of data) {
      const cfg = (row.auth_config ?? {}) as Record<string, unknown>;
      const channels = Array.isArray(cfg.channels) ? cfg.channels as GCalChannelEntry[] : [];
      const match = channels.find(c => c.token === token);
      if (match) return { tenantId: String(row.tenant_id), connectorId: String(row.id), channel: match };
    }
    return null;
  } catch (err) {
    logger.warn('findTenantByGCalChannelToken failed', { error: String(err) });
    return null;
  }
}

async function refreshIfNeeded(connector: GCalendarConnector): Promise<GCalendarConnector> {
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
    await supabase.from('connectors').update({ auth_config: merged, updated_at: new Date().toISOString() }).eq('id', connector.id);
    return { ...connector, accessToken: grant.accessToken, refreshToken: grant.refreshToken ?? connector.refreshToken, accessTokenExpiresAt: new Date(Date.now() + grant.expiresIn * 1000).toISOString(), rawAuthConfig: merged };
  } catch (err) {
    logger.warn('gcalendar token refresh failed', { connectorId: connector.id, error: String(err) });
    return connector;
  }
}

export async function gcalendarForTenant(tenantId: string, workspaceId: string | null): Promise<{ adapter: GCalendarAdapter; connector: GCalendarConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expiresAt - 60_000 && Date.now() - hit.cachedAt < 5 * 60_000) {
    const connector = await loadGCalendarConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }
  let connector = await loadGCalendarConnector(tenantId);
  if (!connector) { cache.delete(key); return null; }
  connector = await refreshIfNeeded(connector);
  const adapter = new GCalendarAdapter(connector.accessToken);
  const exp = connector.accessTokenExpiresAt ? Date.parse(connector.accessTokenExpiresAt) : Date.now() + 3_600_000;
  cache.set(key, { adapter, cachedAt: Date.now(), expiresAt: exp });
  return { adapter, connector };
}

export function invalidateGCalendarForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}
