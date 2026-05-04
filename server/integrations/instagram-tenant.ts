/**
 * server/integrations/instagram-tenant.ts
 *
 * Per-tenant Instagram resolver. system='instagram' on connectors. Inbound
 * webhooks for IG arrive on `entry[].id = ig_user_id` (or sometimes the
 * page id), so we expose lookup by both.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { InstagramAdapter } from './instagram.js';

interface CacheEntry { adapter: InstagramAdapter; igUserId: string; cachedAt: number }
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();
const ck = (t: string, w: string | null) => `${t}::${w ?? '_'}`;

export interface InstagramConnector {
  id: string;
  tenantId: string;
  igUserId: string;
  pageId: string;
  username: string | null;
  pageAccessToken: string;
  appSecret: string;
  verifyToken: string;
  rawAuthConfig: Record<string, unknown>;
}

export async function loadInstagramConnector(tenantId: string): Promise<InstagramConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'instagram')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const igUserId = typeof cfg.ig_user_id === 'string' ? cfg.ig_user_id : '';
    const pageId = typeof cfg.page_id === 'string' ? cfg.page_id : '';
    const pageAccessToken = typeof cfg.page_access_token === 'string' ? cfg.page_access_token : '';
    if (!igUserId || !pageId || !pageAccessToken) return null;
    return {
      id: String(data.id),
      tenantId: String(data.tenant_id),
      igUserId,
      pageId,
      username: typeof cfg.username === 'string' ? cfg.username : null,
      pageAccessToken,
      appSecret: typeof cfg.app_secret === 'string' ? cfg.app_secret : '',
      verifyToken: typeof cfg.verify_token === 'string' ? cfg.verify_token : '',
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadInstagramConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

export async function instagramForTenant(tenantId: string, workspaceId: string | null): Promise<{ adapter: InstagramAdapter; connector: InstagramConnector } | null> {
  const key = ck(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) {
    const connector = await loadInstagramConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }
  const connector = await loadInstagramConnector(tenantId);
  if (!connector) { cache.delete(key); return null; }
  const adapter = new InstagramAdapter({
    igUserId: connector.igUserId,
    pageId: connector.pageId,
    pageAccessToken: connector.pageAccessToken,
    appSecret: connector.appSecret,
    verifyToken: connector.verifyToken,
  });
  cache.set(key, { adapter, igUserId: connector.igUserId, cachedAt: Date.now() });
  return { adapter, connector };
}

export function invalidateInstagramForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(ck(tenantId, workspaceId));
}

export async function findTenantByInstagramId(id: string): Promise<{ tenantId: string; connectorId: string; pageAccessToken: string; appSecret: string; verifyToken: string; igUserId: string; pageId: string } | null> {
  if (!id) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, auth_config')
      .eq('system', 'instagram')
      .eq('status', 'connected');
    if (error || !data) return null;
    const match = (data as Array<{ id: string; tenant_id: string; auth_config: any }>)
      .find((row) => {
        const cfg = row.auth_config ?? {};
        return cfg.ig_user_id === id || cfg.page_id === id;
      });
    if (!match) return null;
    const cfg = match.auth_config ?? {};
    return {
      tenantId: match.tenant_id,
      connectorId: match.id,
      pageAccessToken: cfg.page_access_token ?? '',
      appSecret: cfg.app_secret ?? '',
      verifyToken: cfg.verify_token ?? '',
      igUserId: cfg.ig_user_id ?? '',
      pageId: cfg.page_id ?? '',
    };
  } catch (err) {
    logger.warn('findTenantByInstagramId failed', { error: String(err) });
    return null;
  }
}
