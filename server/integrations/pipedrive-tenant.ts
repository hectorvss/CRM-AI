/**
 * server/integrations/pipedrive-tenant.ts
 *
 * Per-tenant Pipedrive resolver with token refresh + per-company api_domain.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { PipedriveAdapter } from './pipedrive.js';
import { refreshAccessToken, type PipedriveOAuthEnv } from './pipedrive-oauth.js';

interface CacheEntry { adapter: PipedriveAdapter; cachedAt: number; expiresAt: number }
const cache = new Map<string, CacheEntry>();
const cacheKey = (t: string, w: string | null) => `${t}::${w ?? '_'}`;

export interface PipedriveWebhookEntry { hook_id: number; event_action: string; event_object: string; subscription_url: string }

export interface PipedriveConnector {
  id: string; tenantId: string;
  userId: number; companyId: number; companyName: string | null; companyDomain: string | null;
  apiDomain: string; email: string | null; name: string | null;
  scope: string;
  accessToken: string; refreshToken: string | null; accessTokenExpiresAt: string | null;
  webhookUser: string | null; webhookPass: string | null;
  webhooks: PipedriveWebhookEntry[];
  rawAuthConfig: Record<string, unknown>;
}

function readEnv(): PipedriveOAuthEnv | null {
  const clientId = process.env.PIPEDRIVE_CLIENT_ID;
  const clientSecret = process.env.PIPEDRIVE_CLIENT_SECRET;
  const stateSecret = process.env.PIPEDRIVE_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret || !publicBase || !stateSecret) return null;
  return { clientId, clientSecret, stateSecret, redirectUri: `https://${publicBase}/api/integrations/pipedrive/callback` };
}

export async function loadPipedriveConnector(tenantId: string): Promise<PipedriveConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('connectors').select('id, tenant_id, system, status, auth_config').eq('tenant_id', tenantId).eq('system', 'pipedrive').eq('status', 'connected').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error; if (!data) return null;
    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const accessToken = typeof cfg.access_token === 'string' ? cfg.access_token : '';
    const apiDomain = typeof cfg.api_domain === 'string' ? cfg.api_domain : '';
    if (!accessToken || !apiDomain) return null;
    return {
      id: String(data.id), tenantId: String(data.tenant_id),
      userId: typeof cfg.user_id === 'number' ? cfg.user_id : 0,
      companyId: typeof cfg.company_id === 'number' ? cfg.company_id : 0,
      companyName: typeof cfg.company_name === 'string' ? cfg.company_name : null,
      companyDomain: typeof cfg.company_domain === 'string' ? cfg.company_domain : null,
      apiDomain,
      email: typeof cfg.email === 'string' ? cfg.email : null,
      name: typeof cfg.name === 'string' ? cfg.name : null,
      scope: typeof cfg.scope === 'string' ? cfg.scope : '',
      accessToken,
      refreshToken: typeof cfg.refresh_token === 'string' ? cfg.refresh_token : null,
      accessTokenExpiresAt: typeof cfg.access_token_expires_at === 'string' ? cfg.access_token_expires_at : null,
      webhookUser: typeof cfg.webhook_user === 'string' ? cfg.webhook_user : null,
      webhookPass: typeof cfg.webhook_pass === 'string' ? cfg.webhook_pass : null,
      webhooks: Array.isArray(cfg.webhooks) ? cfg.webhooks as PipedriveWebhookEntry[] : [],
      rawAuthConfig: cfg,
    };
  } catch (err) { logger.warn('loadPipedriveConnector failed', { tenantId, error: String(err) }); return null; }
}

export async function findPipedriveTenantByBasicCreds(verify: (user: string, pass: string) => boolean): Promise<{ tenantId: string; connectorId: string } | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from('connectors').select('id, tenant_id, auth_config').eq('system', 'pipedrive').eq('status', 'connected');
    if (!data) return null;
    for (const row of data) {
      const cfg = (row.auth_config ?? {}) as Record<string, unknown>;
      const u = typeof cfg.webhook_user === 'string' ? cfg.webhook_user : '';
      const p = typeof cfg.webhook_pass === 'string' ? cfg.webhook_pass : '';
      if (u && p && verify(u, p)) return { tenantId: String(row.tenant_id), connectorId: String(row.id) };
    }
    return null;
  } catch (err) { logger.warn('findPipedriveTenantByBasicCreds failed', { error: String(err) }); return null; }
}

async function refreshIfNeeded(connector: PipedriveConnector): Promise<PipedriveConnector> {
  const exp = connector.accessTokenExpiresAt ? Date.parse(connector.accessTokenExpiresAt) : 0;
  if (exp && exp - Date.now() > 60_000) return connector;
  if (!connector.refreshToken) return connector;
  const env = readEnv(); if (!env) return connector;
  try {
    const grant = await refreshAccessToken({ refreshToken: connector.refreshToken, env });
    const supabase = getSupabaseAdmin();
    const merged = { ...connector.rawAuthConfig, access_token: grant.accessToken, refresh_token: grant.refreshToken ?? connector.refreshToken, token_type: grant.tokenType, scope: grant.scope || connector.scope, api_domain: grant.apiDomain ?? connector.apiDomain, access_token_expires_at: new Date(Date.now() + grant.expiresIn * 1000).toISOString() };
    await supabase.from('connectors').update({ auth_config: merged, updated_at: new Date().toISOString() }).eq('id', connector.id);
    return { ...connector, accessToken: grant.accessToken, refreshToken: grant.refreshToken ?? connector.refreshToken, apiDomain: grant.apiDomain ?? connector.apiDomain, accessTokenExpiresAt: new Date(Date.now() + grant.expiresIn * 1000).toISOString(), rawAuthConfig: merged };
  } catch (err) { logger.warn('pipedrive token refresh failed', { connectorId: connector.id, error: String(err) }); return connector; }
}

export async function pipedriveForTenant(tenantId: string, workspaceId: string | null): Promise<{ adapter: PipedriveAdapter; connector: PipedriveConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expiresAt - 60_000 && Date.now() - hit.cachedAt < 5 * 60_000) {
    const connector = await loadPipedriveConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }
  let connector = await loadPipedriveConnector(tenantId);
  if (!connector) { cache.delete(key); return null; }
  connector = await refreshIfNeeded(connector);
  const adapter = new PipedriveAdapter(connector.accessToken, connector.apiDomain);
  const exp = connector.accessTokenExpiresAt ? Date.parse(connector.accessTokenExpiresAt) : Date.now() + 3_600_000;
  cache.set(key, { adapter, cachedAt: Date.now(), expiresAt: exp });
  return { adapter, connector };
}

export function invalidatePipedriveForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}
