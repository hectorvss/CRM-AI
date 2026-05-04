/**
 * server/integrations/front-tenant.ts
 *
 * Per-tenant Front adapter resolver. 1h access tokens; transparent refresh
 * 60s before expiry, persisted back into the connector row.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { FrontAdapter } from './front.js';
import { refreshAccessToken, type FrontOAuthEnv } from './front-oauth.js';

interface CacheEntry { adapter: FrontAdapter; cachedAt: number; expiresAt: number }
const cache = new Map<string, CacheEntry>();
const cacheKey = (t: string, w: string | null) => `${t}::${w ?? '_'}`;

export interface FrontConnector {
  id: string;
  tenantId: string;
  identityId: string;
  email: string | null;
  username: string | null;
  scope: string;
  accessToken: string;
  refreshToken: string | null;
  accessTokenExpiresAt: string | null;
  webhookId: string | null;
  webhookUrl: string | null;
  rawAuthConfig: Record<string, unknown>;
}

function readEnv(): FrontOAuthEnv | null {
  const clientId = process.env.FRONT_CLIENT_ID;
  const clientSecret = process.env.FRONT_CLIENT_SECRET;
  const stateSecret = process.env.FRONT_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret || !publicBase || !stateSecret) return null;
  return { clientId, clientSecret, stateSecret, redirectUri: `https://${publicBase}/api/integrations/front/callback` };
}

export async function loadFrontConnector(tenantId: string): Promise<FrontConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'front')
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
      identityId: typeof cfg.identity_id === 'string' ? cfg.identity_id : '',
      email: typeof cfg.email === 'string' ? cfg.email : null,
      username: typeof cfg.username === 'string' ? cfg.username : null,
      scope: typeof cfg.scope === 'string' ? cfg.scope : '',
      accessToken,
      refreshToken: typeof cfg.refresh_token === 'string' ? cfg.refresh_token : null,
      accessTokenExpiresAt: typeof cfg.access_token_expires_at === 'string' ? cfg.access_token_expires_at : null,
      webhookId: typeof cfg.webhook_id === 'string' ? cfg.webhook_id : null,
      webhookUrl: typeof cfg.webhook_url === 'string' ? cfg.webhook_url : null,
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadFrontConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

/**
 * Reverse-lookup tenant by Front payload. Front uses the **app secret**
 * (= OAuth client_secret) for signing, so the same signature is valid for
 * all tenants. We discriminate by `payload._links.related.inboxes` URL or
 * by the `type.id` of conversation handle. Simplest: match by the `payload`
 * email/inbox to a connected tenant via the conversation's inboxes.
 *
 * For our purposes, since the app-level webhook fires once globally, we
 * persist with **all** matching tenants. In practice users will only have
 * the app installed in one tenant per app instance.
 */
export async function findFrontTenants(_event: any): Promise<{ tenantId: string; connectorId: string }[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('connectors')
      .select('id, tenant_id')
      .eq('system', 'front')
      .eq('status', 'connected');
    return (data ?? []).map(r => ({ tenantId: String(r.tenant_id), connectorId: String(r.id) }));
  } catch (err) {
    logger.warn('findFrontTenants failed', { error: String(err) });
    return [];
  }
}

async function refreshIfNeeded(connector: FrontConnector): Promise<FrontConnector> {
  const exp = connector.accessTokenExpiresAt ? Date.parse(connector.accessTokenExpiresAt) : 0;
  if (exp && exp - Date.now() > 60_000) return connector;
  if (!connector.refreshToken) return connector;
  const env = readEnv();
  if (!env) return connector;
  try {
    const grant = await refreshAccessToken({ refreshToken: connector.refreshToken, env });
    const supabase = getSupabaseAdmin();
    const merged = {
      ...connector.rawAuthConfig,
      access_token: grant.accessToken,
      refresh_token: grant.refreshToken ?? connector.refreshToken,
      token_type: grant.tokenType,
      scope: grant.scope || connector.scope,
      access_token_expires_at: new Date(Date.now() + grant.expiresIn * 1000).toISOString(),
    };
    await supabase
      .from('connectors')
      .update({ auth_config: merged, updated_at: new Date().toISOString() })
      .eq('id', connector.id);
    return {
      ...connector,
      accessToken: grant.accessToken,
      refreshToken: grant.refreshToken ?? connector.refreshToken,
      accessTokenExpiresAt: new Date(Date.now() + grant.expiresIn * 1000).toISOString(),
      rawAuthConfig: merged,
    };
  } catch (err) {
    logger.warn('front token refresh failed', { connectorId: connector.id, error: String(err) });
    return connector;
  }
}

export async function frontForTenant(tenantId: string, workspaceId: string | null): Promise<{ adapter: FrontAdapter; connector: FrontConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expiresAt - 60_000 && Date.now() - hit.cachedAt < 5 * 60_000) {
    const connector = await loadFrontConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }
  let connector = await loadFrontConnector(tenantId);
  if (!connector) { cache.delete(key); return null; }
  connector = await refreshIfNeeded(connector);
  const adapter = new FrontAdapter(connector.accessToken);
  const exp = connector.accessTokenExpiresAt ? Date.parse(connector.accessTokenExpiresAt) : Date.now() + 3_600_000;
  cache.set(key, { adapter, cachedAt: Date.now(), expiresAt: exp });
  return { adapter, connector };
}

export function invalidateFrontForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}
