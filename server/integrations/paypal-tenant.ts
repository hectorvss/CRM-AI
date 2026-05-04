/**
 * server/integrations/paypal-tenant.ts
 *
 * Per-tenant PayPal adapter. Different from Stripe Connect — PayPal uses
 * Client Credentials, so tokens are short-lived (~9h) and we mint them
 * server-side from the merchant's clientId+secret stored on connect.
 *
 * The cache lives in two layers:
 *   1. In-memory (TTL = min(token_ttl, 15 min)) — fast hot path.
 *   2. `connectors.auth_config.access_token` + `expires_at` — survives
 *      cold starts so a serverless function spawn doesn't refresh on
 *      every first request.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { PayPalAdapter } from './paypal.js';
import { fetchAccessToken, type PayPalMode } from './paypal-oauth.js';

interface CacheEntry {
  adapter: PayPalAdapter;
  mode: PayPalMode;
  expiresAt: string;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(tenantId: string, workspaceId: string | null): string {
  return `${tenantId}::${workspaceId ?? '_'}`;
}

export interface PayPalConnector {
  id: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  mode: PayPalMode;
  webhookId: string | null;
  merchantEmail: string | null;
  cachedAccessToken: string | null;
  cachedExpiresAt: string | null;
  rawAuthConfig: Record<string, unknown>;
}

export async function loadPayPalConnector(tenantId: string): Promise<PayPalConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'paypal')
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
      mode: (cfg.mode === 'live' ? 'live' : 'sandbox') as PayPalMode,
      webhookId: typeof cfg.webhook_id === 'string' ? cfg.webhook_id : null,
      merchantEmail: typeof cfg.merchant_email === 'string' ? cfg.merchant_email : null,
      cachedAccessToken: typeof cfg.access_token === 'string' ? cfg.access_token : null,
      cachedExpiresAt: typeof cfg.expires_at === 'string' ? cfg.expires_at : null,
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadPayPalConnector failed', { tenantId, error: String(err) });
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
    logger.warn('paypal persistRefreshedToken failed', { connectorId, error: String(err) });
  }
}

export async function paypalForTenant(
  tenantId: string,
  workspaceId: string | null,
): Promise<{ adapter: PayPalAdapter; connector: PayPalConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && new Date(hit.expiresAt) > new Date(Date.now() + 60_000) && Date.now() - hit.cachedAt < 15 * 60_000) {
    const connector = await loadPayPalConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }

  const connector = await loadPayPalConnector(tenantId);
  if (!connector) {
    cache.delete(key);
    return null;
  }

  // Try to reuse the persisted access_token if it still has > 60s left.
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
      logger.warn('PayPal token refresh failed', { tenantId, error: String(err) });
      return null;
    }
  }

  const adapter = new PayPalAdapter(accessToken!, connector.mode);
  cache.set(key, {
    adapter,
    mode: connector.mode,
    expiresAt: expiresAt!,
    cachedAt: Date.now(),
  });

  return { adapter, connector };
}

export function invalidatePayPalForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}
