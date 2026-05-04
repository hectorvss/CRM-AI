/**
 * server/integrations/woocommerce-tenant.ts
 *
 * Per-tenant WooCommerce adapter resolver. Auth is API-key (consumer
 * key/secret) over HTTPS; no token rotation. Cache the adapter for 15
 * minutes; re-read the row on cold lookup so disconnects propagate.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { WooCommerceAdapter } from './woocommerce.js';

interface CacheEntry {
  adapter: WooCommerceAdapter;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(tenantId: string, workspaceId: string | null): string {
  return `${tenantId}::${workspaceId ?? '_'}`;
}

export interface WooConnector {
  id: string;
  tenantId: string;
  siteUrl: string;
  consumerKey: string;
  consumerSecret: string;
  storeName: string | null;
  webhookSecret: string | null;
  webhookIds: number[];
  rawAuthConfig: Record<string, unknown>;
}

export async function loadWooConnector(tenantId: string): Promise<WooConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'woocommerce')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const siteUrl = typeof cfg.site_url === 'string' ? cfg.site_url : '';
    const ck = typeof cfg.consumer_key === 'string' ? cfg.consumer_key : '';
    const cs = typeof cfg.consumer_secret === 'string' ? cfg.consumer_secret : '';
    if (!siteUrl || !ck || !cs) return null;

    return {
      id: String(data.id),
      tenantId: String(data.tenant_id),
      siteUrl,
      consumerKey: ck,
      consumerSecret: cs,
      storeName: typeof cfg.store_name === 'string' ? cfg.store_name : null,
      webhookSecret: typeof cfg.webhook_secret === 'string' ? cfg.webhook_secret : null,
      webhookIds: Array.isArray(cfg.webhook_ids) ? (cfg.webhook_ids as number[]) : [],
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadWooConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

/** Reverse-lookup: find tenant by webhook secret (Woo doesn't include
    site identity in the webhook body — secret is the tenant key). */
export async function findTenantByWooSecret(secret: string): Promise<{ tenantId: string; connectorId: string; siteUrl: string } | null> {
  if (!secret) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('connectors')
      .select('id, tenant_id, auth_config')
      .eq('system', 'woocommerce')
      .eq('status', 'connected');
    if (!data) return null;
    for (const row of data) {
      const cfg = (row.auth_config ?? {}) as Record<string, unknown>;
      if (cfg.webhook_secret === secret) {
        return {
          tenantId: String(row.tenant_id),
          connectorId: String(row.id),
          siteUrl: typeof cfg.site_url === 'string' ? cfg.site_url : '',
        };
      }
    }
    return null;
  } catch (err) {
    logger.warn('findTenantByWooSecret failed', { error: String(err) });
    return null;
  }
}

export async function wooForTenant(
  tenantId: string,
  workspaceId: string | null,
): Promise<{ adapter: WooCommerceAdapter; connector: WooConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < 15 * 60_000) {
    const connector = await loadWooConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }

  const connector = await loadWooConnector(tenantId);
  if (!connector) {
    cache.delete(key);
    return null;
  }
  const adapter = new WooCommerceAdapter({
    siteUrl: connector.siteUrl,
    consumerKey: connector.consumerKey,
    consumerSecret: connector.consumerSecret,
  });
  cache.set(key, { adapter, cachedAt: Date.now() });
  return { adapter, connector };
}

export function invalidateWooForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}
