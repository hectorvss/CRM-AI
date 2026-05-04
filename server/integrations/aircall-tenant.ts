/**
 * server/integrations/aircall-tenant.ts
 *
 * Per-tenant Aircall adapter resolver. Bearer tokens are long-lived;
 * cache adapters for 15min and re-read row on cold lookup.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { AircallAdapter } from './aircall.js';

interface CacheEntry { adapter: AircallAdapter; cachedAt: number }
const cache = new Map<string, CacheEntry>();
const cacheKey = (t: string, w: string | null) => `${t}::${w ?? '_'}`;

export interface AircallConnector {
  id: string;
  tenantId: string;
  integrationId: number;
  integrationName: string | null;
  companyId: number | null;
  companyName: string | null;
  scope: string;
  accessToken: string;
  webhookId: string | null;
  webhookToken: string | null;
  webhookUrl: string | null;
  rawAuthConfig: Record<string, unknown>;
}

export async function loadAircallConnector(tenantId: string): Promise<AircallConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'aircall')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const accessToken = typeof cfg.access_token === 'string' ? cfg.access_token : '';
    if (!accessToken) return null;
    return {
      id: String(data.id),
      tenantId: String(data.tenant_id),
      integrationId: typeof cfg.integration_id === 'number' ? cfg.integration_id : 0,
      integrationName: typeof cfg.integration_name === 'string' ? cfg.integration_name : null,
      companyId: typeof cfg.company_id === 'number' ? cfg.company_id : null,
      companyName: typeof cfg.company_name === 'string' ? cfg.company_name : null,
      scope: typeof cfg.scope === 'string' ? cfg.scope : '',
      accessToken,
      webhookId: typeof cfg.webhook_id === 'string' ? cfg.webhook_id : null,
      webhookToken: typeof cfg.webhook_token === 'string' ? cfg.webhook_token : null,
      webhookUrl: typeof cfg.webhook_url === 'string' ? cfg.webhook_url : null,
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadAircallConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

/** Reverse-lookup tenant by Aircall webhook token (for /webhooks/aircall). */
export async function findTenantByAircallWebhookToken(token: string): Promise<{ tenantId: string; connectorId: string; webhookToken: string } | null> {
  if (!token) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('connectors')
      .select('id, tenant_id, auth_config')
      .eq('system', 'aircall')
      .eq('status', 'connected');
    if (!data) return null;
    for (const row of data) {
      const cfg = (row.auth_config ?? {}) as Record<string, unknown>;
      if (cfg.webhook_token === token) {
        return { tenantId: String(row.tenant_id), connectorId: String(row.id), webhookToken: token };
      }
    }
    return null;
  } catch (err) {
    logger.warn('findTenantByAircallWebhookToken failed', { error: String(err) });
    return null;
  }
}

/** Iterate all connected Aircall connectors and try to verify the signature. */
export async function findAircallTenantBySignature(verify: (token: string) => boolean): Promise<{ tenantId: string; connectorId: string; webhookToken: string } | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('connectors')
      .select('id, tenant_id, auth_config')
      .eq('system', 'aircall')
      .eq('status', 'connected');
    if (!data) return null;
    for (const row of data) {
      const cfg = (row.auth_config ?? {}) as Record<string, unknown>;
      const tok = typeof cfg.webhook_token === 'string' ? cfg.webhook_token : '';
      if (!tok) continue;
      if (verify(tok)) {
        return { tenantId: String(row.tenant_id), connectorId: String(row.id), webhookToken: tok };
      }
    }
    return null;
  } catch (err) {
    logger.warn('findAircallTenantBySignature failed', { error: String(err) });
    return null;
  }
}

export async function aircallForTenant(tenantId: string, workspaceId: string | null): Promise<{ adapter: AircallAdapter; connector: AircallConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < 15 * 60_000) {
    const connector = await loadAircallConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }
  const connector = await loadAircallConnector(tenantId);
  if (!connector) { cache.delete(key); return null; }
  const adapter = new AircallAdapter(connector.accessToken);
  cache.set(key, { adapter, cachedAt: Date.now() });
  return { adapter, connector };
}

export function invalidateAircallForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}
