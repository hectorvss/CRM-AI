/**
 * server/integrations/google-analytics-tenant.ts
 *
 * Per-tenant Google Analytics 4 resolver.
 * system='ga' on connectors. Cache TTL: 5 min.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { GoogleAnalyticsAdapter } from './google-analytics.js';

interface CacheEntry { adapter: GoogleAnalyticsAdapter; cachedAt: number }
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();
const ck = (t: string, w: string | null) => `${t}::${w ?? '_'}`;

export interface GAConnector {
  id: string;
  tenantId: string;
  measurementId: string;
  apiSecret: string;
  rawAuthConfig: Record<string, unknown>;
}

export async function loadGAConnector(tenantId: string): Promise<GAConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'ga')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const measurementId = typeof cfg.measurement_id === 'string' ? cfg.measurement_id : '';
    const apiSecret = typeof cfg.api_secret === 'string' ? cfg.api_secret : '';
    if (!measurementId || !apiSecret) return null;
    return {
      id: String(data.id),
      tenantId: String(data.tenant_id),
      measurementId,
      apiSecret,
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadGAConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

export async function gaForTenant(
  tenantId: string,
  workspaceId: string | null,
): Promise<{ adapter: GoogleAnalyticsAdapter; connector: GAConnector } | null> {
  const key = ck(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) {
    const connector = await loadGAConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }
  const connector = await loadGAConnector(tenantId);
  if (!connector) { cache.delete(key); return null; }
  const adapter = new GoogleAnalyticsAdapter({
    measurementId: connector.measurementId,
    apiSecret: connector.apiSecret,
  });
  cache.set(key, { adapter, cachedAt: Date.now() });
  return { adapter, connector };
}

export function invalidateGAForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(ck(tenantId, workspaceId));
}
