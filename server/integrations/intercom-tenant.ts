/**
 * server/integrations/intercom-tenant.ts
 *
 * Per-tenant Intercom adapter resolver. Tokens are long-lived (no
 * expiry, no refresh flow) — we just cache the adapter for 15 min,
 * then re-read the row in case of disconnect.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { IntercomAdapter } from './intercom.js';
import type { IntercomRegion } from './intercom-oauth.js';

interface CacheEntry {
  adapter: IntercomAdapter;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(tenantId: string, workspaceId: string | null): string {
  return `${tenantId}::${workspaceId ?? '_'}`;
}

export interface IntercomConnector {
  id: string;
  tenantId: string;
  appId: string;
  appName: string | null;
  region: IntercomRegion;
  adminId: string | null;
  adminEmail: string | null;
  adminName: string | null;
  accessToken: string;
  rawAuthConfig: Record<string, unknown>;
}

export async function loadIntercomConnector(tenantId: string): Promise<IntercomConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'intercom')
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
      appId: typeof cfg.app_id === 'string' ? cfg.app_id : '',
      appName: typeof cfg.app_name === 'string' ? cfg.app_name : null,
      region: ((cfg.region === 'eu' || cfg.region === 'au') ? cfg.region : 'us') as IntercomRegion,
      adminId: typeof cfg.admin_id === 'string' ? cfg.admin_id : null,
      adminEmail: typeof cfg.admin_email === 'string' ? cfg.admin_email : null,
      adminName: typeof cfg.admin_name === 'string' ? cfg.admin_name : null,
      accessToken,
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadIntercomConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

/** Reverse-lookup: find tenant by Intercom workspace ("app_id"). */
export async function findTenantByIntercomAppId(appId: string): Promise<{ tenantId: string; connectorId: string } | null> {
  if (!appId) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('connectors')
      .select('id, tenant_id, auth_config')
      .eq('system', 'intercom')
      .eq('status', 'connected');
    if (!data) return null;
    for (const row of data) {
      const cfg = (row.auth_config ?? {}) as Record<string, unknown>;
      if (cfg.app_id === appId) {
        return { tenantId: String(row.tenant_id), connectorId: String(row.id) };
      }
    }
    return null;
  } catch (err) {
    logger.warn('findTenantByIntercomAppId failed', { appId, error: String(err) });
    return null;
  }
}

export async function intercomForTenant(
  tenantId: string,
  workspaceId: string | null,
): Promise<{ adapter: IntercomAdapter; connector: IntercomConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < 15 * 60_000) {
    const connector = await loadIntercomConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }

  const connector = await loadIntercomConnector(tenantId);
  if (!connector) {
    cache.delete(key);
    return null;
  }

  const adapter = new IntercomAdapter(connector.accessToken, connector.region);
  cache.set(key, { adapter, cachedAt: Date.now() });
  return { adapter, connector };
}

export function invalidateIntercomForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}
