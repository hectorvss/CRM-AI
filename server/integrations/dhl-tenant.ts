/**
 * server/integrations/dhl-tenant.ts
 *
 * Per-tenant DHL adapter resolver. DHL keys are static (no token rotation),
 * so we just cache the adapter for 15 minutes and skip the connector lookup
 * when warm.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { DhlAdapter, type DhlMode } from './dhl.js';

interface CacheEntry {
  adapter: DhlAdapter;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(tenantId: string, workspaceId: string | null): string {
  return `${tenantId}::${workspaceId ?? '_'}`;
}

export interface DhlConnector {
  id: string;
  tenantId: string;
  apiKey: string;
  mydhlUsername: string | null;
  mydhlPassword: string | null;
  mydhlMode: DhlMode;
  accountNumber: string | null;
  webhookSecret: string | null;
  webhookUrl: string | null;
  rawAuthConfig: Record<string, unknown>;
}

export async function loadDhlConnector(tenantId: string): Promise<DhlConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'dhl')
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
      mydhlUsername: typeof cfg.mydhl_username === 'string' ? cfg.mydhl_username : null,
      mydhlPassword: typeof cfg.mydhl_password === 'string' ? cfg.mydhl_password : null,
      mydhlMode: (cfg.mydhl_mode === 'production' ? 'production' : 'sandbox') as DhlMode,
      accountNumber: typeof cfg.account_number === 'string' ? cfg.account_number : null,
      webhookSecret: typeof cfg.webhook_secret === 'string' ? cfg.webhook_secret : null,
      webhookUrl: typeof cfg.webhook_url === 'string' ? cfg.webhook_url : null,
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadDhlConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

export async function findTenantByDhlSecret(secret: string): Promise<{ tenantId: string; connectorId: string } | null> {
  if (!secret) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('connectors')
      .select('id, tenant_id, auth_config')
      .eq('system', 'dhl')
      .eq('status', 'connected');
    if (!data) return null;
    for (const row of data) {
      const cfg = (row.auth_config ?? {}) as Record<string, unknown>;
      if (cfg.webhook_secret === secret) {
        return { tenantId: String(row.tenant_id), connectorId: String(row.id) };
      }
    }
    return null;
  } catch (err) {
    logger.warn('findTenantByDhlSecret failed', { error: String(err) });
    return null;
  }
}

export async function dhlForTenant(
  tenantId: string,
  workspaceId: string | null,
): Promise<{ adapter: DhlAdapter; connector: DhlConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < 15 * 60_000) {
    const connector = await loadDhlConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }

  const connector = await loadDhlConnector(tenantId);
  if (!connector) {
    cache.delete(key);
    return null;
  }

  const adapter = new DhlAdapter(
    connector.apiKey,
    connector.mydhlUsername && connector.mydhlPassword
      ? { username: connector.mydhlUsername, password: connector.mydhlPassword, mode: connector.mydhlMode }
      : null,
  );
  cache.set(key, { adapter, cachedAt: Date.now() });
  return { adapter, connector };
}

export function invalidateDhlForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}
