/**
 * server/integrations/ups-tenant.ts
 *
 * Per-tenant UPS adapter resolver. UPS uses Client Credentials with ~4h
 * tokens — we cache + auto-refresh, persisting to connectors.auth_config
 * so cold serverless starts don't burn a refresh on every first call.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { UpsAdapter } from './ups.js';
import { fetchAccessToken, type UpsMode } from './ups-oauth.js';

interface CacheEntry {
  adapter: UpsAdapter;
  mode: UpsMode;
  expiresAt: string;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(tenantId: string, workspaceId: string | null): string {
  return `${tenantId}::${workspaceId ?? '_'}`;
}

export interface UpsConnector {
  id: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  mode: UpsMode;
  accountNumber: string | null;
  shipperNumber: string | null;
  webhookCredential: string | null;
  webhookUrl: string | null;
  webhookSubscriptionId: string | null;
  cachedAccessToken: string | null;
  cachedExpiresAt: string | null;
  rawAuthConfig: Record<string, unknown>;
}

export async function loadUpsConnector(tenantId: string): Promise<UpsConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'ups')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const clientId = typeof cfg.client_id === 'string' ? cfg.client_id : '';
    const clientSecret = typeof cfg.client_secret === 'string' ? cfg.client_secret : '';
    if (!clientId || !clientSecret) return null;

    return {
      id: String(data.id),
      tenantId: String(data.tenant_id),
      clientId,
      clientSecret,
      mode: (cfg.mode === 'production' ? 'production' : 'sandbox') as UpsMode,
      accountNumber: typeof cfg.account_number === 'string' ? cfg.account_number : null,
      shipperNumber: typeof cfg.shipper_number === 'string' ? cfg.shipper_number : null,
      webhookCredential: typeof cfg.webhook_credential === 'string' ? cfg.webhook_credential : null,
      webhookUrl: typeof cfg.webhook_url === 'string' ? cfg.webhook_url : null,
      webhookSubscriptionId: typeof cfg.webhook_subscription_id === 'string' ? cfg.webhook_subscription_id : null,
      cachedAccessToken: typeof cfg.access_token === 'string' ? cfg.access_token : null,
      cachedExpiresAt: typeof cfg.expires_at === 'string' ? cfg.expires_at : null,
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadUpsConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

export async function findTenantByUpsCredential(credential: string): Promise<{ tenantId: string; connectorId: string } | null> {
  if (!credential) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('connectors')
      .select('id, tenant_id, auth_config')
      .eq('system', 'ups')
      .eq('status', 'connected');
    if (!data) return null;
    for (const row of data) {
      const cfg = (row.auth_config ?? {}) as Record<string, unknown>;
      if (cfg.webhook_credential === credential) {
        return { tenantId: String(row.tenant_id), connectorId: String(row.id) };
      }
    }
    return null;
  } catch (err) {
    logger.warn('findTenantByUpsCredential failed', { error: String(err) });
    return null;
  }
}

async function persistRefreshedToken(connectorId: string, accessToken: string, expiresAt: string): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const { data: row } = await supabase.from('connectors').select('auth_config').eq('id', connectorId).maybeSingle();
    if (!row) return;
    const merged = {
      ...((row.auth_config ?? {}) as Record<string, unknown>),
      access_token: accessToken,
      expires_at: expiresAt,
    };
    await supabase
      .from('connectors')
      .update({ auth_config: merged, updated_at: new Date().toISOString() })
      .eq('id', connectorId);
  } catch (err) {
    logger.warn('ups persistRefreshedToken failed', { connectorId, error: String(err) });
  }
}

export async function upsForTenant(
  tenantId: string,
  workspaceId: string | null,
): Promise<{ adapter: UpsAdapter; connector: UpsConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && new Date(hit.expiresAt) > new Date(Date.now() + 60_000) && Date.now() - hit.cachedAt < 15 * 60_000) {
    const connector = await loadUpsConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }

  const connector = await loadUpsConnector(tenantId);
  if (!connector) {
    cache.delete(key);
    return null;
  }

  let accessToken = connector.cachedAccessToken;
  let expiresAt = connector.cachedExpiresAt;
  const stillValid = expiresAt && new Date(expiresAt).getTime() - Date.now() > 60_000;

  if (!accessToken || !stillValid) {
    try {
      const fresh = await fetchAccessToken({
        clientId: connector.clientId,
        clientSecret: connector.clientSecret,
        mode: connector.mode,
      });
      accessToken = fresh.accessToken;
      expiresAt = fresh.expiresAt;
      await persistRefreshedToken(connector.id, fresh.accessToken, fresh.expiresAt);
    } catch (err) {
      logger.warn('UPS token refresh failed', { tenantId, error: String(err) });
      return null;
    }
  }

  const adapter = new UpsAdapter(accessToken!, connector.mode);
  cache.set(key, {
    adapter,
    mode: connector.mode,
    expiresAt: expiresAt!,
    cachedAt: Date.now(),
  });

  return { adapter, connector };
}

export function invalidateUpsForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}
