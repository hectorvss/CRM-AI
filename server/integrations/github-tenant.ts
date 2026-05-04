/**
 * server/integrations/github-tenant.ts
 *
 * Per-tenant GitHub adapter resolver. OAuth App tokens are long-lived;
 * we cache adapters for 15min and re-read the row on cold lookup.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { GitHubAdapter } from './github.js';

interface CacheEntry { adapter: GitHubAdapter; cachedAt: number }
const cache = new Map<string, CacheEntry>();
const cacheKey = (t: string, w: string | null) => `${t}::${w ?? '_'}`;

export interface GitHubWebhookEntry {
  hook_id: number;
  scope: 'repo' | 'org';
  owner: string;
  repo?: string;
  events: string[];
  url: string;
}

export interface GitHubConnector {
  id: string;
  tenantId: string;
  userId: number;
  login: string;
  name: string | null;
  email: string | null;
  scope: string;
  accessToken: string;
  webhookSecret: string | null;
  webhooks: GitHubWebhookEntry[];
  rawAuthConfig: Record<string, unknown>;
}

export async function loadGitHubConnector(tenantId: string): Promise<GitHubConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'github')
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
      userId: typeof cfg.user_id === 'number' ? cfg.user_id : 0,
      login: typeof cfg.login === 'string' ? cfg.login : '',
      name: typeof cfg.name === 'string' ? cfg.name : null,
      email: typeof cfg.email === 'string' ? cfg.email : null,
      scope: typeof cfg.scope === 'string' ? cfg.scope : '',
      accessToken,
      webhookSecret: typeof cfg.webhook_secret === 'string' ? cfg.webhook_secret : null,
      webhooks: Array.isArray(cfg.webhooks) ? cfg.webhooks as GitHubWebhookEntry[] : [],
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadGitHubConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

/** Reverse-lookup tenant by GitHub webhook secret (for /webhooks/github). */
export async function findTenantByGitHubWebhookSecret(secret: string): Promise<{ tenantId: string; connectorId: string } | null> {
  if (!secret) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('connectors')
      .select('id, tenant_id, auth_config')
      .eq('system', 'github')
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
    logger.warn('findTenantByGitHubWebhookSecret failed', { error: String(err) });
    return null;
  }
}

export async function githubForTenant(tenantId: string, workspaceId: string | null): Promise<{ adapter: GitHubAdapter; connector: GitHubConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < 15 * 60_000) {
    const connector = await loadGitHubConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }
  const connector = await loadGitHubConnector(tenantId);
  if (!connector) { cache.delete(key); return null; }
  const adapter = new GitHubAdapter(connector.accessToken);
  cache.set(key, { adapter, cachedAt: Date.now() });
  return { adapter, connector };
}

export function invalidateGitHubForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}
