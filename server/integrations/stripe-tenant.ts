/**
 * server/integrations/stripe-tenant.ts
 *
 * Per-tenant Stripe adapter. Same shape as shopify-tenant.ts:
 *  - Reads the workspace's `connectors` row (system='stripe', status='connected').
 *  - Builds a fresh `StripeAdapter` from auth_config.access_token.
 *  - Caches in-memory by tenantId for 5 minutes — bounded so a token rotation
 *    propagates after a cold start.
 *
 * Returns null when the workspace has no Stripe connection — every caller
 * MUST handle that case.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { StripeAdapter } from './stripe.js';

interface CacheEntry {
  adapter: StripeAdapter;
  stripeUserId: string;
  livemode: boolean;
  cachedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function cacheKey(tenantId: string, workspaceId: string | null): string {
  return `${tenantId}::${workspaceId ?? '_'}`;
}

export interface StripeConnector {
  id: string;
  tenantId: string;
  stripeUserId: string;
  accessToken: string;
  refreshToken: string | null;
  publishableKey: string | null;
  webhookSecret: string;
  livemode: boolean;
  scope: string;
}

export async function loadStripeConnector(tenantId: string): Promise<StripeConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'stripe')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const accessToken = typeof cfg.access_token === 'string' ? cfg.access_token : '';
    const stripeUserId = typeof cfg.stripe_user_id === 'string' ? cfg.stripe_user_id : '';
    if (!accessToken) return null;

    return {
      id: String(data.id),
      tenantId: String(data.tenant_id),
      stripeUserId,
      accessToken,
      refreshToken: typeof cfg.refresh_token === 'string' ? cfg.refresh_token : null,
      publishableKey: typeof cfg.publishable_key === 'string' ? cfg.publishable_key : null,
      webhookSecret: typeof cfg.webhook_secret === 'string' ? cfg.webhook_secret : '',
      livemode: cfg.livemode === true,
      scope: typeof cfg.scope === 'string' ? cfg.scope : 'read_write',
    };
  } catch (err) {
    logger.warn('loadStripeConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

export async function stripeForTenant(
  tenantId: string,
  workspaceId: string | null,
): Promise<{ adapter: StripeAdapter; stripeUserId: string; livemode: boolean } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) {
    return { adapter: hit.adapter, stripeUserId: hit.stripeUserId, livemode: hit.livemode };
  }

  const connector = await loadStripeConnector(tenantId);
  if (!connector) {
    cache.delete(key);
    return null;
  }

  const adapter = new StripeAdapter(connector.accessToken, connector.webhookSecret);

  cache.set(key, {
    adapter,
    stripeUserId: connector.stripeUserId,
    livemode: connector.livemode,
    cachedAt: Date.now(),
  });

  return { adapter, stripeUserId: connector.stripeUserId, livemode: connector.livemode };
}

export function invalidateStripeForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}

export function resetStripeTenantCache(): void {
  cache.clear();
}
