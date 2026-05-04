/**
 * server/integrations/plaid-tenant.ts
 *
 * Plaid uses tenant-level credentials (client_id + secret pinned per
 * environment) plus per-user `item.access_token` rows stored in a
 * separate side table when needed. The connector here represents the
 * tenant-wide Plaid account.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { PlaidAdapter, type PlaidEnvironment } from './plaid.js';

interface CacheEntry { adapter: PlaidAdapter; cachedAt: number }
const cache = new Map<string, CacheEntry>();
const cacheKey = (t: string, w: string | null) => `${t}::${w ?? '_'}`;

export interface PlaidConnector {
  id: string; tenantId: string;
  environment: PlaidEnvironment;
  clientId: string; secret: string;
  webhookToken: string | null;
  rawAuthConfig: Record<string, unknown>;
}

export async function loadPlaidConnector(tenantId: string): Promise<PlaidConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('connectors').select('id, tenant_id, system, status, auth_config').eq('tenant_id', tenantId).eq('system', 'plaid').eq('status', 'connected').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error; if (!data) return null;
    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const clientId = typeof cfg.client_id === 'string' ? cfg.client_id : '';
    const secret = typeof cfg.secret === 'string' ? cfg.secret : '';
    const env = (typeof cfg.environment === 'string' ? cfg.environment : 'sandbox') as PlaidEnvironment;
    if (!clientId || !secret) return null;
    return {
      id: String(data.id), tenantId: String(data.tenant_id),
      environment: env, clientId, secret,
      webhookToken: typeof cfg.webhook_token === 'string' ? cfg.webhook_token : null,
      rawAuthConfig: cfg,
    };
  } catch (err) { logger.warn('loadPlaidConnector failed', { tenantId, error: String(err) }); return null; }
}

export async function findTenantByPlaidWebhookToken(token: string): Promise<{ tenantId: string; connectorId: string } | null> {
  if (!token) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from('connectors').select('id, tenant_id, auth_config').eq('system', 'plaid').eq('status', 'connected');
    if (!data) return null;
    for (const row of data) {
      const cfg = (row.auth_config ?? {}) as Record<string, unknown>;
      if (cfg.webhook_token === token) return { tenantId: String(row.tenant_id), connectorId: String(row.id) };
    }
    return null;
  } catch (err) { logger.warn('findTenantByPlaidWebhookToken failed', { error: String(err) }); return null; }
}

export async function plaidForTenant(tenantId: string, workspaceId: string | null): Promise<{ adapter: PlaidAdapter; connector: PlaidConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < 15 * 60_000) {
    const connector = await loadPlaidConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }
  const connector = await loadPlaidConnector(tenantId);
  if (!connector) { cache.delete(key); return null; }
  const adapter = new PlaidAdapter(connector.clientId, connector.secret, connector.environment);
  cache.set(key, { adapter, cachedAt: Date.now() });
  return { adapter, connector };
}

export function invalidatePlaidForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}
