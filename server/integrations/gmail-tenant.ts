/**
 * server/integrations/gmail-tenant.ts
 *
 * Per-tenant Gmail adapter resolution. Different from Shopify/Stripe in
 * one important way: Gmail access tokens expire (~1h), so the resolver
 * checks expiry on every call and silently refreshes via the long-lived
 * refresh_token before handing back the adapter.
 *
 * After a refresh we persist the new access_token + expiresAt back into
 * `connectors.auth_config` so other instances pick it up — without this
 * every cold serverless invocation would refresh independently.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { GmailAdapter } from './gmail.js';
import { refreshAccessToken, type GmailOAuthEnv } from './gmail-oauth.js';

interface CacheEntry {
  adapter: GmailAdapter;
  emailAddress: string;
  expiresAt: string;   // ISO
  cachedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function cacheKey(tenantId: string, workspaceId: string | null): string {
  return `${tenantId}::${workspaceId ?? '_'}`;
}

export interface GmailConnector {
  id: string;
  tenantId: string;
  emailAddress: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scope: string;
  historyId: string | null;       // last persisted historyId for incremental sync
  watchExpiration: string | null; // when the Pub/Sub watch needs renewal
  rawAuthConfig: Record<string, unknown>;
}

function readEnv(): GmailOAuthEnv | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const stateSecret = process.env.GMAIL_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret || !publicBase) return null;
  return {
    clientId,
    clientSecret,
    stateSecret,
    redirectUri: `https://${publicBase}/api/integrations/gmail/callback`,
  };
}

export async function loadGmailConnector(tenantId: string): Promise<GmailConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, name, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'gmail')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const accessToken = typeof cfg.access_token === 'string' ? cfg.access_token : '';
    const refreshToken = typeof cfg.refresh_token === 'string' ? cfg.refresh_token : '';
    if (!accessToken || !refreshToken) return null;

    return {
      id: String(data.id),
      tenantId: String(data.tenant_id),
      emailAddress: typeof cfg.email_address === 'string'
        ? cfg.email_address
        : String(data.name ?? ''),
      accessToken,
      refreshToken,
      expiresAt: typeof cfg.expires_at === 'string' ? cfg.expires_at : new Date(0).toISOString(),
      scope: typeof cfg.scope === 'string' ? cfg.scope : '',
      historyId: typeof cfg.history_id === 'string' ? cfg.history_id : null,
      watchExpiration: typeof cfg.watch_expiration === 'string' ? cfg.watch_expiration : null,
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadGmailConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

/**
 * Persist the rotated access token + expiry back to the connector row so
 * other serverless instances can reuse it.
 */
async function persistRefreshedToken(connectorId: string, updates: { access_token: string; expires_at: string; refresh_token?: string }): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const { data: row, error: selErr } = await supabase
      .from('connectors')
      .select('auth_config')
      .eq('id', connectorId)
      .maybeSingle();
    if (selErr || !row) return;
    const merged = { ...((row.auth_config ?? {}) as Record<string, unknown>), ...updates };
    await supabase
      .from('connectors')
      .update({ auth_config: merged, updated_at: new Date().toISOString() })
      .eq('id', connectorId);
  } catch (err) {
    logger.warn('persistRefreshedToken failed', { connectorId, error: String(err) });
  }
}

export async function gmailForTenant(
  tenantId: string,
  workspaceId: string | null,
): Promise<{ adapter: GmailAdapter; emailAddress: string; connector: GmailConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS && new Date(hit.expiresAt) > new Date(Date.now() + 60_000)) {
    return { adapter: hit.adapter, emailAddress: hit.emailAddress, connector: (await loadGmailConnector(tenantId))! };
  }

  const connector = await loadGmailConnector(tenantId);
  if (!connector) {
    cache.delete(key);
    return null;
  }

  // Refresh if expiring within 60s.
  let accessToken = connector.accessToken;
  let expiresAt = connector.expiresAt;
  if (new Date(expiresAt).getTime() - Date.now() < 60_000) {
    const env = readEnv();
    if (!env) {
      logger.warn('gmailForTenant: cannot refresh without GOOGLE_CLIENT_ID/SECRET');
      return null;
    }
    try {
      const refreshed = await refreshAccessToken({ refreshToken: connector.refreshToken, env });
      accessToken = refreshed.accessToken;
      expiresAt = refreshed.expiresAt;
      await persistRefreshedToken(connector.id, {
        access_token: refreshed.accessToken,
        expires_at: refreshed.expiresAt,
        ...(refreshed.refreshToken !== connector.refreshToken
          ? { refresh_token: refreshed.refreshToken }
          : {}),
      });
    } catch (err) {
      logger.warn('Gmail token refresh failed', { tenantId, error: String(err) });
      return null;
    }
  }

  const adapter = new GmailAdapter(accessToken);
  cache.set(key, {
    adapter,
    emailAddress: connector.emailAddress,
    expiresAt,
    cachedAt: Date.now(),
  });

  return { adapter, emailAddress: connector.emailAddress, connector };
}

export function invalidateGmailForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}

/**
 * Look up which tenant owns a given email address. Used by the Pub/Sub
 * webhook: Google's notification only contains `emailAddress`, so we
 * route to the right tenant by reverse-mapping it through connectors.
 */
export async function findTenantByEmail(emailAddress: string): Promise<{ tenantId: string; connectorId: string } | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, auth_config')
      .eq('system', 'gmail')
      .eq('status', 'connected');
    if (error || !data) return null;
    const match = (data as Array<{ id: string; tenant_id: string; auth_config: any }>).find(
      (row) => (row.auth_config?.email_address ?? '').toLowerCase() === emailAddress.toLowerCase(),
    );
    if (!match) return null;
    return { tenantId: match.tenant_id, connectorId: match.id };
  } catch (err) {
    logger.warn('findTenantByEmail failed', { error: String(err) });
    return null;
  }
}
