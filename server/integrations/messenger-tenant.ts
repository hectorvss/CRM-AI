/**
 * server/integrations/messenger-tenant.ts
 *
 * Per-tenant Messenger resolver. The system identifier on the connectors
 * row is `messenger`. Reverse lookup by Page ID is the critical bit —
 * inbound webhooks identify the recipient via `entry[].id` (page id).
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { MessengerAdapter } from './messenger.js';

interface CacheEntry {
  adapter: MessengerAdapter;
  pageId: string;
  cachedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function cacheKey(tenantId: string, workspaceId: string | null): string {
  return `${tenantId}::${workspaceId ?? '_'}`;
}

export interface MessengerConnector {
  id: string;
  tenantId: string;
  pageId: string;
  pageName: string | null;
  pageAccessToken: string;
  appSecret: string;
  verifyToken: string;
  rawAuthConfig: Record<string, unknown>;
}

export async function loadMessengerConnector(tenantId: string): Promise<MessengerConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'messenger')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const pageId = typeof cfg.page_id === 'string' ? cfg.page_id : '';
    const pageAccessToken = typeof cfg.page_access_token === 'string' ? cfg.page_access_token : '';
    if (!pageId || !pageAccessToken) return null;
    return {
      id: String(data.id),
      tenantId: String(data.tenant_id),
      pageId,
      pageName: typeof cfg.page_name === 'string' ? cfg.page_name : null,
      pageAccessToken,
      appSecret: typeof cfg.app_secret === 'string' ? cfg.app_secret : '',
      verifyToken: typeof cfg.verify_token === 'string' ? cfg.verify_token : '',
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadMessengerConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

export async function messengerForTenant(tenantId: string, workspaceId: string | null): Promise<{ adapter: MessengerAdapter; connector: MessengerConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) {
    const connector = await loadMessengerConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }
  const connector = await loadMessengerConnector(tenantId);
  if (!connector) {
    cache.delete(key);
    return null;
  }
  const adapter = new MessengerAdapter({
    pageId: connector.pageId,
    pageAccessToken: connector.pageAccessToken,
    appSecret: connector.appSecret,
    verifyToken: connector.verifyToken,
  });
  cache.set(key, { adapter, pageId: connector.pageId, cachedAt: Date.now() });
  return { adapter, connector };
}

export function invalidateMessengerForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}

export async function findTenantByMessengerPageId(pageId: string): Promise<{ tenantId: string; connectorId: string; pageAccessToken: string; appSecret: string; verifyToken: string } | null> {
  if (!pageId) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, auth_config')
      .eq('system', 'messenger')
      .eq('status', 'connected');
    if (error || !data) return null;
    const match = (data as Array<{ id: string; tenant_id: string; auth_config: any }>)
      .find((row) => (row.auth_config?.page_id ?? '') === pageId);
    if (!match) return null;
    const cfg = match.auth_config ?? {};
    return {
      tenantId: match.tenant_id,
      connectorId: match.id,
      pageAccessToken: cfg.page_access_token ?? '',
      appSecret: cfg.app_secret ?? '',
      verifyToken: cfg.verify_token ?? '',
    };
  } catch (err) {
    logger.warn('findTenantByMessengerPageId failed', { error: String(err) });
    return null;
  }
}
