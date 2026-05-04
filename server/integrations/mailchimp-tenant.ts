/**
 * server/integrations/mailchimp-tenant.ts
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { MailchimpAdapter } from './mailchimp.js';

interface CacheEntry { adapter: MailchimpAdapter; cachedAt: number }
const cache = new Map<string, CacheEntry>();
const cacheKey = (t: string, w: string | null) => `${t}::${w ?? '_'}`;

export interface MailchimpWebhookEntry { webhook_id: string; list_id: string; url: string }

export interface MailchimpConnector {
  id: string; tenantId: string;
  userId: number; accountId: string | null; accountName: string | null;
  email: string | null; dc: string | null; apiEndpoint: string;
  accessToken: string;
  webhookToken: string | null;
  webhooks: MailchimpWebhookEntry[];
  rawAuthConfig: Record<string, unknown>;
}

export async function loadMailchimpConnector(tenantId: string): Promise<MailchimpConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('connectors').select('id, tenant_id, system, status, auth_config').eq('tenant_id', tenantId).eq('system', 'mailchimp').eq('status', 'connected').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error; if (!data) return null;
    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const accessToken = typeof cfg.access_token === 'string' ? cfg.access_token : '';
    const apiEndpoint = typeof cfg.api_endpoint === 'string' ? cfg.api_endpoint : '';
    if (!accessToken || !apiEndpoint) return null;
    return {
      id: String(data.id), tenantId: String(data.tenant_id),
      userId: typeof cfg.user_id === 'number' ? cfg.user_id : 0,
      accountId: typeof cfg.account_id === 'string' ? cfg.account_id : null,
      accountName: typeof cfg.account_name === 'string' ? cfg.account_name : null,
      email: typeof cfg.email === 'string' ? cfg.email : null,
      dc: typeof cfg.dc === 'string' ? cfg.dc : null,
      apiEndpoint, accessToken,
      webhookToken: typeof cfg.webhook_token === 'string' ? cfg.webhook_token : null,
      webhooks: Array.isArray(cfg.webhooks) ? cfg.webhooks as MailchimpWebhookEntry[] : [],
      rawAuthConfig: cfg,
    };
  } catch (err) { logger.warn('loadMailchimpConnector failed', { tenantId, error: String(err) }); return null; }
}

export async function findTenantByMailchimpToken(token: string): Promise<{ tenantId: string; connectorId: string } | null> {
  if (!token) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from('connectors').select('id, tenant_id, auth_config').eq('system', 'mailchimp').eq('status', 'connected');
    if (!data) return null;
    for (const row of data) {
      const cfg = (row.auth_config ?? {}) as Record<string, unknown>;
      if (cfg.webhook_token === token) return { tenantId: String(row.tenant_id), connectorId: String(row.id) };
    }
    return null;
  } catch (err) { logger.warn('findTenantByMailchimpToken failed', { error: String(err) }); return null; }
}

export async function mailchimpForTenant(tenantId: string, workspaceId: string | null): Promise<{ adapter: MailchimpAdapter; connector: MailchimpConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < 15 * 60_000) {
    const connector = await loadMailchimpConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }
  const connector = await loadMailchimpConnector(tenantId);
  if (!connector) { cache.delete(key); return null; }
  const adapter = new MailchimpAdapter(connector.accessToken, connector.apiEndpoint);
  cache.set(key, { adapter, cachedAt: Date.now() });
  return { adapter, connector };
}

export function invalidateMailchimpForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}
