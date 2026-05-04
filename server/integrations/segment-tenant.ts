/**
 * server/integrations/segment-tenant.ts
 *
 * Segment uses a single Source Write Key (no OAuth). The connector stores
 * the write key + an inbound webhook token (for Destination Functions
 * forwarding events back to Clain).
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { SegmentAdapter } from './segment.js';

interface CacheEntry { adapter: SegmentAdapter; cachedAt: number }
const cache = new Map<string, CacheEntry>();
const cacheKey = (t: string, w: string | null) => `${t}::${w ?? '_'}`;

export interface SegmentConnector {
  id: string; tenantId: string;
  writeKey: string;
  workspaceSlug: string | null;
  sourceName: string | null;
  webhookToken: string | null;
  rawAuthConfig: Record<string, unknown>;
}

export async function loadSegmentConnector(tenantId: string): Promise<SegmentConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('connectors').select('id, tenant_id, system, status, auth_config').eq('tenant_id', tenantId).eq('system', 'segment').eq('status', 'connected').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error; if (!data) return null;
    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const writeKey = typeof cfg.write_key === 'string' ? cfg.write_key : '';
    if (!writeKey) return null;
    return {
      id: String(data.id), tenantId: String(data.tenant_id),
      writeKey,
      workspaceSlug: typeof cfg.workspace_slug === 'string' ? cfg.workspace_slug : null,
      sourceName: typeof cfg.source_name === 'string' ? cfg.source_name : null,
      webhookToken: typeof cfg.webhook_token === 'string' ? cfg.webhook_token : null,
      rawAuthConfig: cfg,
    };
  } catch (err) { logger.warn('loadSegmentConnector failed', { tenantId, error: String(err) }); return null; }
}

export async function findTenantBySegmentWebhookToken(token: string): Promise<{ tenantId: string; connectorId: string } | null> {
  if (!token) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from('connectors').select('id, tenant_id, auth_config').eq('system', 'segment').eq('status', 'connected');
    if (!data) return null;
    for (const row of data) {
      const cfg = (row.auth_config ?? {}) as Record<string, unknown>;
      if (cfg.webhook_token === token) return { tenantId: String(row.tenant_id), connectorId: String(row.id) };
    }
    return null;
  } catch (err) { logger.warn('findTenantBySegmentWebhookToken failed', { error: String(err) }); return null; }
}

export async function segmentForTenant(tenantId: string, workspaceId: string | null): Promise<{ adapter: SegmentAdapter; connector: SegmentConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < 15 * 60_000) {
    const connector = await loadSegmentConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }
  const connector = await loadSegmentConnector(tenantId);
  if (!connector) { cache.delete(key); return null; }
  const adapter = new SegmentAdapter(connector.writeKey);
  cache.set(key, { adapter, cachedAt: Date.now() });
  return { adapter, connector };
}

export function invalidateSegmentForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}
