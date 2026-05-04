/**
 * server/integrations/discord-tenant.ts
 *
 * Discord uses a single application Bot Token (set via env) plus per-guild
 * OAuth installs. The connector stores the guild_id, the user OAuth grant,
 * and the application id. Bot token is shared via env.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { DiscordAdapter } from './discord.js';
import { refreshAccessToken, type DiscordOAuthEnv } from './discord-oauth.js';

interface CacheEntry { adapter: DiscordAdapter; cachedAt: number }
const cache = new Map<string, CacheEntry>();
const cacheKey = (t: string, w: string | null) => `${t}::${w ?? '_'}`;

export interface DiscordConnector {
  id: string; tenantId: string;
  guildId: string; guildName: string | null;
  applicationId: string;
  userAccessToken: string; userRefreshToken: string | null; userAccessTokenExpiresAt: string | null;
  scope: string;
  rawAuthConfig: Record<string, unknown>;
}

function readEnv(): DiscordOAuthEnv | null {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const stateSecret = process.env.DISCORD_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicKey = process.env.DISCORD_PUBLIC_KEY || '';
  const botToken = process.env.DISCORD_BOT_TOKEN || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret || !publicBase || !stateSecret) return null;
  return { clientId, clientSecret, stateSecret, publicKey, botToken, redirectUri: `https://${publicBase}/api/integrations/discord/callback` };
}

export async function loadDiscordConnector(tenantId: string): Promise<DiscordConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('connectors').select('id, tenant_id, system, status, auth_config').eq('tenant_id', tenantId).eq('system', 'discord').eq('status', 'connected').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error; if (!data) return null;
    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const guildId = typeof cfg.guild_id === 'string' ? cfg.guild_id : '';
    const userAccessToken = typeof cfg.user_access_token === 'string' ? cfg.user_access_token : '';
    const applicationId = typeof cfg.application_id === 'string' ? cfg.application_id : '';
    if (!guildId || !applicationId) return null;
    return {
      id: String(data.id), tenantId: String(data.tenant_id),
      guildId, guildName: typeof cfg.guild_name === 'string' ? cfg.guild_name : null,
      applicationId,
      userAccessToken,
      userRefreshToken: typeof cfg.user_refresh_token === 'string' ? cfg.user_refresh_token : null,
      userAccessTokenExpiresAt: typeof cfg.user_access_token_expires_at === 'string' ? cfg.user_access_token_expires_at : null,
      scope: typeof cfg.scope === 'string' ? cfg.scope : '',
      rawAuthConfig: cfg,
    };
  } catch (err) { logger.warn('loadDiscordConnector failed', { tenantId, error: String(err) }); return null; }
}

/** Find tenants by guild_id (used when an Interaction comes in). */
export async function findDiscordTenantsByGuild(guildId: string): Promise<{ tenantId: string; connectorId: string }[]> {
  if (!guildId) return [];
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from('connectors').select('id, tenant_id, auth_config').eq('system', 'discord').eq('status', 'connected');
    if (!data) return [];
    return data.filter(r => ((r.auth_config ?? {}) as any).guild_id === guildId).map(r => ({ tenantId: String(r.tenant_id), connectorId: String(r.id) }));
  } catch (err) { logger.warn('findDiscordTenantsByGuild failed', { error: String(err) }); return []; }
}

async function refreshUserTokenIfNeeded(connector: DiscordConnector): Promise<DiscordConnector> {
  const exp = connector.userAccessTokenExpiresAt ? Date.parse(connector.userAccessTokenExpiresAt) : 0;
  if (exp && exp - Date.now() > 60_000) return connector;
  if (!connector.userRefreshToken) return connector;
  const env = readEnv(); if (!env) return connector;
  try {
    const grant = await refreshAccessToken({ refreshToken: connector.userRefreshToken, env });
    const supabase = getSupabaseAdmin();
    const merged = { ...connector.rawAuthConfig, user_access_token: grant.accessToken, user_refresh_token: grant.refreshToken ?? connector.userRefreshToken, user_access_token_expires_at: new Date(Date.now() + grant.expiresIn * 1000).toISOString() };
    await supabase.from('connectors').update({ auth_config: merged, updated_at: new Date().toISOString() }).eq('id', connector.id);
    return { ...connector, userAccessToken: grant.accessToken, userRefreshToken: grant.refreshToken ?? connector.userRefreshToken, userAccessTokenExpiresAt: new Date(Date.now() + grant.expiresIn * 1000).toISOString(), rawAuthConfig: merged };
  } catch (err) { logger.warn('discord token refresh failed', { connectorId: connector.id, error: String(err) }); return connector; }
}

/**
 * Resolve a per-tenant Discord adapter using the **bot token** (not the
 * user OAuth token), since channel posting / DM creation / commands all
 * go through the bot identity.
 */
export async function discordForTenant(tenantId: string, workspaceId: string | null): Promise<{ adapter: DiscordAdapter; connector: DiscordConnector } | null> {
  const env = readEnv();
  if (!env || !env.botToken) { logger.warn('discord: DISCORD_BOT_TOKEN not set'); return null; }
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < 15 * 60_000) {
    const connector = await loadDiscordConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }
  let connector = await loadDiscordConnector(tenantId);
  if (!connector) { cache.delete(key); return null; }
  connector = await refreshUserTokenIfNeeded(connector);
  const adapter = new DiscordAdapter(env.botToken, 'bot');
  cache.set(key, { adapter, cachedAt: Date.now() });
  return { adapter, connector };
}

export function invalidateDiscordForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}
