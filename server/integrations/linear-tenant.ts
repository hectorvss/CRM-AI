/**
 * server/integrations/linear-tenant.ts
 *
 * Per-tenant Linear adapter resolver. Linear tokens are effectively
 * long-lived (10y); we just cache the adapter for 15min and re-read
 * the row on cold lookup so disconnects propagate.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { LinearAdapter } from './linear.js';

interface CacheEntry {
  adapter: LinearAdapter;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(tenantId: string, workspaceId: string | null): string {
  return `${tenantId}::${workspaceId ?? '_'}`;
}

export interface LinearConnector {
  id: string;
  tenantId: string;
  organizationId: string;
  organizationName: string | null;
  organizationUrlKey: string | null;
  viewerId: string | null;
  viewerEmail: string | null;
  viewerName: string | null;
  scope: string;
  accessToken: string;
  webhookId: string | null;
  webhookSigningSecret: string | null;
  rawAuthConfig: Record<string, unknown>;
}

export async function loadLinearConnector(tenantId: string): Promise<LinearConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'linear')
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
      organizationId: typeof cfg.organization_id === 'string' ? cfg.organization_id : '',
      organizationName: typeof cfg.organization_name === 'string' ? cfg.organization_name : null,
      organizationUrlKey: typeof cfg.organization_url_key === 'string' ? cfg.organization_url_key : null,
      viewerId: typeof cfg.viewer_id === 'string' ? cfg.viewer_id : null,
      viewerEmail: typeof cfg.viewer_email === 'string' ? cfg.viewer_email : null,
      viewerName: typeof cfg.viewer_name === 'string' ? cfg.viewer_name : null,
      scope: typeof cfg.scope === 'string' ? cfg.scope : '',
      accessToken,
      webhookId: typeof cfg.webhook_id === 'string' ? cfg.webhook_id : null,
      webhookSigningSecret: typeof cfg.webhook_signing_secret === 'string' ? cfg.webhook_signing_secret : null,
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadLinearConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

/** Reverse-lookup: find tenant by Linear webhook signing secret. */
export async function findTenantByLinearSigningSecret(secret: string): Promise<{ tenantId: string; connectorId: string } | null> {
  if (!secret) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('connectors')
      .select('id, tenant_id, auth_config')
      .eq('system', 'linear')
      .eq('status', 'connected');
    if (!data) return null;
    for (const row of data) {
      const cfg = (row.auth_config ?? {}) as Record<string, unknown>;
      if (cfg.webhook_signing_secret === secret) {
        return { tenantId: String(row.tenant_id), connectorId: String(row.id) };
      }
    }
    return null;
  } catch (err) {
    logger.warn('findTenantByLinearSigningSecret failed', { error: String(err) });
    return null;
  }
}

export async function linearForTenant(
  tenantId: string,
  workspaceId: string | null,
): Promise<{ adapter: LinearAdapter; connector: LinearConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < 15 * 60_000) {
    const connector = await loadLinearConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }

  const connector = await loadLinearConnector(tenantId);
  if (!connector) {
    cache.delete(key);
    return null;
  }
  const adapter = new LinearAdapter(connector.accessToken);
  cache.set(key, { adapter, cachedAt: Date.now() });
  return { adapter, connector };
}

export function invalidateLinearForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}
