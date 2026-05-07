/**
 * server/integrations/delighted-tenant.ts
 *
 * Per-tenant Delighted resolver.
 * system='delighted' on connectors. Cache TTL: 5 min.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { DelightedAdapter } from './delighted.js';

interface CacheEntry { adapter: DelightedAdapter; cachedAt: number }
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();
const ck = (t: string, w: string | null) => `${t}::${w ?? '_'}`;

export interface DelightedConnector {
  id: string;
  tenantId: string;
  apiKey: string;
  rawAuthConfig: Record<string, unknown>;
}

export async function loadDelightedConnector(tenantId: string): Promise<DelightedConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'delighted')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const apiKey = typeof cfg.api_key === 'string' ? cfg.api_key : '';
    if (!apiKey) return null;
    return {
      id: String(data.id),
      tenantId: String(data.tenant_id),
      apiKey,
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadDelightedConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

export async function delightedForTenant(
  tenantId: string,
  workspaceId: string | null,
): Promise<{ adapter: DelightedAdapter; connector: DelightedConnector } | null> {
  const key = ck(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) {
    const connector = await loadDelightedConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }
  const connector = await loadDelightedConnector(tenantId);
  if (!connector) { cache.delete(key); return null; }
  const adapter = new DelightedAdapter(connector.apiKey);
  cache.set(key, { adapter, cachedAt: Date.now() });
  return { adapter, connector };
}

export function invalidateDelightedForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(ck(tenantId, workspaceId));
}
