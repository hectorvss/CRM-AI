/**
 * server/integrations/freshdesk-tenant.ts
 *
 * Per-tenant Freshdesk resolver. system='freshdesk' on connectors.
 * Caches adapters in-process for 5 minutes to avoid redundant DB round-trips.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { FreshdeskAdapter } from './freshdesk.js';

interface CacheEntry {
  adapter: FreshdeskAdapter;
  connector: FreshdeskConnector;
  cachedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();
const ck = (tenantId: string, workspaceId: string | null | undefined) =>
  `${tenantId}::${workspaceId ?? '_'}`;

export interface FreshdeskConnector {
  id: string;
  tenantId: string;
  subdomain: string;
  apiKey: string;
  agentName: string | null;
  agentEmail: string | null;
  rawAuthConfig: Record<string, unknown>;
}

export async function loadFreshdeskConnector(
  tenantId: string,
): Promise<FreshdeskConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'freshdesk')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const subdomain = typeof cfg.subdomain === 'string' ? cfg.subdomain : '';
    const apiKey = typeof cfg.api_key === 'string' ? cfg.api_key : '';
    if (!subdomain || !apiKey) return null;
    return {
      id: String(data.id),
      tenantId: String(data.tenant_id),
      subdomain,
      apiKey,
      agentName: typeof cfg.agent_name === 'string' ? cfg.agent_name : null,
      agentEmail: typeof cfg.agent_email === 'string' ? cfg.agent_email : null,
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadFreshdeskConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

export async function freshdeskForTenant(
  tenantId: string,
  workspaceId: string | null | undefined,
): Promise<{ adapter: FreshdeskAdapter; connector: FreshdeskConnector } | null> {
  const key = ck(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) {
    // Refresh connector metadata (non-secret fields) in case it was updated,
    // but reuse the existing adapter instance to avoid unnecessary allocation.
    const connector = await loadFreshdeskConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
    cache.delete(key);
    return null;
  }
  const connector = await loadFreshdeskConnector(tenantId);
  if (!connector) {
    cache.delete(key);
    return null;
  }
  const adapter = new FreshdeskAdapter(connector.subdomain, connector.apiKey);
  cache.set(key, { adapter, connector, cachedAt: Date.now() });
  return { adapter, connector };
}

export function invalidateFreshdeskForTenant(
  tenantId: string,
  workspaceId: string | null | undefined,
): void {
  cache.delete(ck(tenantId, workspaceId));
}
