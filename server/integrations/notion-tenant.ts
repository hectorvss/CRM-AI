/**
 * server/integrations/notion-tenant.ts
 *
 * Per-tenant Notion adapter resolver. Tokens are long-lived; we just
 * cache the adapter for 15 min and re-read the row on cold lookup.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { NotionAdapter } from './notion.js';

interface CacheEntry {
  adapter: NotionAdapter;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(tenantId: string, workspaceId: string | null): string {
  return `${tenantId}::${workspaceId ?? '_'}`;
}

export interface NotionConnector {
  id: string;
  tenantId: string;
  botId: string;
  workspaceId: string;
  workspaceName: string | null;
  workspaceIcon: string | null;
  ownerType: 'user' | 'workspace';
  ownerEmail: string | null;
  ownerName: string | null;
  accessToken: string;
  rawAuthConfig: Record<string, unknown>;
}

export async function loadNotionConnector(tenantId: string): Promise<NotionConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'notion')
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
      botId: typeof cfg.bot_id === 'string' ? cfg.bot_id : '',
      workspaceId: typeof cfg.workspace_id === 'string' ? cfg.workspace_id : '',
      workspaceName: typeof cfg.workspace_name === 'string' ? cfg.workspace_name : null,
      workspaceIcon: typeof cfg.workspace_icon === 'string' ? cfg.workspace_icon : null,
      ownerType: cfg.owner_type === 'workspace' ? 'workspace' : 'user',
      ownerEmail: typeof cfg.owner_email === 'string' ? cfg.owner_email : null,
      ownerName: typeof cfg.owner_name === 'string' ? cfg.owner_name : null,
      accessToken,
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadNotionConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

export async function notionForTenant(
  tenantId: string,
  workspaceId: string | null,
): Promise<{ adapter: NotionAdapter; connector: NotionConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < 15 * 60_000) {
    const connector = await loadNotionConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }

  const connector = await loadNotionConnector(tenantId);
  if (!connector) {
    cache.delete(key);
    return null;
  }
  const adapter = new NotionAdapter(connector.accessToken);
  cache.set(key, { adapter, cachedAt: Date.now() });
  return { adapter, connector };
}

export function invalidateNotionForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}
