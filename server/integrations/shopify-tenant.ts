/**
 * server/integrations/shopify-tenant.ts
 *
 * Per-tenant Shopify adapter resolution.
 *
 * Until now the registry held a single global Shopify adapter built from
 * env vars — fine for dev, useless for SaaS where every workspace connects
 * its own store. This module:
 *
 *  1. Looks up the workspace's `connectors` row (system='shopify', status='connected').
 *  2. Reads `auth_config` JSON: { shop_domain, access_token, scope, webhook_secret }.
 *  3. Constructs (and caches) a `ShopifyAdapter` + `ShopifyGraphQLClient` keyed
 *     by tenantId+workspaceId. Cache is in-memory per serverless instance,
 *     so a token rotation just means the next cold start picks up the new
 *     value.
 *  4. Returns null when the workspace has no Shopify connector — callers
 *     should fall back gracefully (no-op, "not connected" UX message).
 *
 * The legacy env-based registry adapter remains so single-tenant dev still
 * works without onboarding through OAuth.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { ShopifyAdapter } from './shopify.js';
import { ShopifyGraphQLClient } from './shopify-graphql.js';

interface CacheEntry {
  rest: ShopifyAdapter;
  gql: ShopifyGraphQLClient;
  shopDomain: string;
  /** Connector row id — used to invalidate when a re-install happens. */
  connectorId: string;
  /** When the cache entry was created — bound to a TTL so token rotations propagate. */
  cachedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function cacheKey(tenantId: string, workspaceId: string | null): string {
  return `${tenantId}::${workspaceId ?? '_'}`;
}

export interface ShopifyConnector {
  id: string;
  tenantId: string;
  shopDomain: string;
  accessToken: string;
  scope: string;
  webhookSecret: string | null;
}

/**
 * Read the active Shopify connector for a workspace. Returns null if none
 * is connected. The connectors table is tenant-scoped (no workspace_id
 * column), so we look up by tenant + system='shopify' + status='connected'
 * and pick the most recently updated row.
 */
export async function loadShopifyConnector(tenantId: string): Promise<ShopifyConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'shopify')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const shopDomain = typeof cfg.shop_domain === 'string' ? cfg.shop_domain : '';
    const accessToken = typeof cfg.access_token === 'string' ? cfg.access_token : '';
    if (!shopDomain || !accessToken) return null;

    return {
      id: String(data.id),
      tenantId: String(data.tenant_id),
      shopDomain,
      accessToken,
      scope: typeof cfg.scope === 'string' ? cfg.scope : '',
      webhookSecret: typeof cfg.webhook_secret === 'string' ? cfg.webhook_secret : null,
    };
  } catch (err) {
    logger.warn('loadShopifyConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

/**
 * Resolve a Shopify adapter pair (REST + GraphQL) for a workspace, building
 * and caching it on first use.
 *
 * Returns null when the workspace has no connected Shopify store — every
 * caller MUST handle this case (skip the operation, return "not connected"
 * UX, etc.). Throwing here would defeat the multi-tenant model.
 */
export async function shopifyForTenant(
  tenantId: string,
  workspaceId: string | null,
): Promise<{ rest: ShopifyAdapter; gql: ShopifyGraphQLClient; shopDomain: string } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) {
    return { rest: hit.rest, gql: hit.gql, shopDomain: hit.shopDomain };
  }

  const connector = await loadShopifyConnector(tenantId);
  if (!connector) {
    cache.delete(key);
    return null;
  }

  const rest = new ShopifyAdapter({
    shopDomain: connector.shopDomain,
    adminApiToken: connector.accessToken,
    webhookSecret: connector.webhookSecret ?? '',
  });
  const gql = new ShopifyGraphQLClient({
    shopDomain: connector.shopDomain,
    accessToken: connector.accessToken,
  });

  cache.set(key, {
    rest,
    gql,
    shopDomain: connector.shopDomain,
    connectorId: connector.id,
    cachedAt: Date.now(),
  });

  return { rest, gql, shopDomain: connector.shopDomain };
}

/** Drop the cache entry for a workspace — called after re-install or disconnect. */
export function invalidateShopifyForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}

/** Drop ALL cache entries — diagnostics / tests. */
export function resetShopifyTenantCache(): void {
  cache.clear();
}
