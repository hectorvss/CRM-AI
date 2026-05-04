/**
 * server/integrations/postmark-tenant.ts
 *
 * Per-tenant Postmark resolver. system='postmark'. Reverse lookup by
 * webhook_url_token is the critical bit — Postmark webhooks have no
 * built-in signature, so we route to the right tenant via a per-tenant
 * random token in the webhook URL itself.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { PostmarkAdapter } from './postmark.js';

interface CacheEntry { adapter: PostmarkAdapter; cachedAt: number }
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();
const ck = (t: string, w: string | null) => `${t}::${w ?? '_'}`;

export interface PostmarkConnector {
  id: string;
  tenantId: string;
  serverToken: string;
  accountToken: string | null;
  serverId: number | null;
  serverName: string | null;
  defaultFromAddress: string | null;
  defaultFromName: string | null;
  webhookId: number | null;
  webhookToken: string;
  rawAuthConfig: Record<string, unknown>;
}

export async function loadPostmarkConnector(tenantId: string): Promise<PostmarkConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'postmark')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const serverToken = typeof cfg.server_token === 'string' ? cfg.server_token : '';
    if (!serverToken) return null;
    return {
      id: String(data.id),
      tenantId: String(data.tenant_id),
      serverToken,
      accountToken: typeof cfg.account_token === 'string' ? cfg.account_token : null,
      serverId: typeof cfg.server_id === 'number' ? cfg.server_id : null,
      serverName: typeof cfg.server_name === 'string' ? cfg.server_name : null,
      defaultFromAddress: typeof cfg.default_from_address === 'string' ? cfg.default_from_address : null,
      defaultFromName: typeof cfg.default_from_name === 'string' ? cfg.default_from_name : null,
      webhookId: typeof cfg.webhook_id === 'number' ? cfg.webhook_id : null,
      webhookToken: typeof cfg.webhook_token === 'string' ? cfg.webhook_token : '',
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadPostmarkConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

export async function postmarkForTenant(tenantId: string, workspaceId: string | null): Promise<{ adapter: PostmarkAdapter; connector: PostmarkConnector } | null> {
  const key = ck(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) {
    const connector = await loadPostmarkConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }
  const connector = await loadPostmarkConnector(tenantId);
  if (!connector) { cache.delete(key); return null; }
  const adapter = new PostmarkAdapter(connector.serverToken, connector.accountToken ?? undefined);
  cache.set(key, { adapter, cachedAt: Date.now() });
  return { adapter, connector };
}

export function invalidatePostmarkForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(ck(tenantId, workspaceId));
}

/** Resolve tenant by the random token we stamped in the webhook URL. */
export async function findTenantByPostmarkToken(token: string): Promise<{ tenantId: string; connectorId: string; serverToken: string } | null> {
  if (!token) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, auth_config')
      .eq('system', 'postmark')
      .eq('status', 'connected');
    if (error || !data) return null;
    const match = (data as Array<{ id: string; tenant_id: string; auth_config: any }>)
      .find((row) => (row.auth_config?.webhook_token ?? '') === token);
    if (!match) return null;
    const cfg = match.auth_config ?? {};
    return {
      tenantId: match.tenant_id,
      connectorId: match.id,
      serverToken: cfg.server_token ?? '',
    };
  } catch (err) {
    logger.warn('findTenantByPostmarkToken failed', { error: String(err) });
    return null;
  }
}
