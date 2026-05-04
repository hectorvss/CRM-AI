/**
 * server/integrations/calendly-tenant.ts
 *
 * Per-tenant Calendly adapter resolver. Tokens are 1h-lived with a
 * refresh_token; we transparently refresh at 60s before expiry and
 * persist the new token pair on the connector row.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { CalendlyAdapter } from './calendly.js';
import { refreshAccessToken, type CalendlyOAuthEnv } from './calendly-oauth.js';

interface CacheEntry {
  adapter: CalendlyAdapter;
  expiresAt: string;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(tenantId: string, workspaceId: string | null): string {
  return `${tenantId}::${workspaceId ?? '_'}`;
}

export interface CalendlyConnector {
  id: string;
  tenantId: string;
  ownerUri: string;
  organizationUri: string;
  ownerEmail: string | null;
  ownerName: string | null;
  schedulingUrl: string | null;
  refreshToken: string;
  cachedAccessToken: string | null;
  cachedExpiresAt: string | null;
  webhookUuid: string | null;
  webhookSigningKey: string | null;
  rawAuthConfig: Record<string, unknown>;
}

export async function loadCalendlyConnector(tenantId: string): Promise<CalendlyConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'calendly')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const refreshToken = typeof cfg.refresh_token === 'string' ? cfg.refresh_token : '';
    const ownerUri = typeof cfg.owner_uri === 'string' ? cfg.owner_uri : '';
    if (!refreshToken || !ownerUri) return null;

    return {
      id: String(data.id),
      tenantId: String(data.tenant_id),
      ownerUri,
      organizationUri: typeof cfg.organization_uri === 'string' ? cfg.organization_uri : '',
      ownerEmail: typeof cfg.owner_email === 'string' ? cfg.owner_email : null,
      ownerName: typeof cfg.owner_name === 'string' ? cfg.owner_name : null,
      schedulingUrl: typeof cfg.scheduling_url === 'string' ? cfg.scheduling_url : null,
      refreshToken,
      cachedAccessToken: typeof cfg.access_token === 'string' ? cfg.access_token : null,
      cachedExpiresAt: typeof cfg.expires_at === 'string' ? cfg.expires_at : null,
      webhookUuid: typeof cfg.webhook_uuid === 'string' ? cfg.webhook_uuid : null,
      webhookSigningKey: typeof cfg.webhook_signing_key === 'string' ? cfg.webhook_signing_key : null,
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadCalendlyConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

/** Reverse-lookup: find tenant by webhook signing key (for inbound events). */
export async function findTenantByCalendlySigningKey(key: string): Promise<{ tenantId: string; connectorId: string } | null> {
  if (!key) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('connectors')
      .select('id, tenant_id, auth_config')
      .eq('system', 'calendly')
      .eq('status', 'connected');
    if (!data) return null;
    for (const row of data) {
      const cfg = (row.auth_config ?? {}) as Record<string, unknown>;
      if (cfg.webhook_signing_key === key) {
        return { tenantId: String(row.tenant_id), connectorId: String(row.id) };
      }
    }
    return null;
  } catch (err) {
    logger.warn('findTenantByCalendlySigningKey failed', { error: String(err) });
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
    logger.warn('calendly persistRefreshedToken failed', { connectorId, error: String(err) });
  }
}

function envFromConfig(): CalendlyOAuthEnv {
  return {
    clientId: process.env.CALENDLY_CLIENT_ID ?? '',
    clientSecret: process.env.CALENDLY_CLIENT_SECRET ?? '',
    redirectUri: process.env.CALENDLY_REDIRECT_URI
      ?? `${(process.env.PUBLIC_BASE_URL ?? '').replace(/\/$/, '') || ''}/api/integrations/calendly/callback`,
    stateSecret: process.env.CALENDLY_STATE_SECRET ?? process.env.STATE_SECRET ?? 'dev-secret',
  };
}

export async function calendlyForTenant(
  tenantId: string,
  workspaceId: string | null,
): Promise<{ adapter: CalendlyAdapter; connector: CalendlyConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && new Date(hit.expiresAt) > new Date(Date.now() + 60_000) && Date.now() - hit.cachedAt < 30 * 60_000) {
    const connector = await loadCalendlyConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }

  const connector = await loadCalendlyConnector(tenantId);
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
      logger.warn('Calendly refresh failed', { tenantId, error: String(err) });
      return null;
    }
  }

  const adapter = new CalendlyAdapter(accessToken!);
  cache.set(key, { adapter, expiresAt: expiresAt!, cachedAt: Date.now() });
  return { adapter, connector };
}

export function invalidateCalendlyForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}
