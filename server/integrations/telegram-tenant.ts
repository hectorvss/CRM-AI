/**
 * server/integrations/telegram-tenant.ts
 *
 * Per-tenant Telegram resolver. system='telegram'. Webhooks identify the
 * bot by their `secret_token` header (we set it at setWebhook time and
 * verify on every inbound), so reverse lookup is keyed on that.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { TelegramAdapter } from './telegram.js';

interface CacheEntry { adapter: TelegramAdapter; cachedAt: number }
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();
const ck = (t: string, w: string | null) => `${t}::${w ?? '_'}`;

export interface TelegramConnector {
  id: string;
  tenantId: string;
  botId: number;
  botUsername: string | null;
  botName: string | null;
  botToken: string;
  webhookSecretToken: string;
  rawAuthConfig: Record<string, unknown>;
}

export async function loadTelegramConnector(tenantId: string): Promise<TelegramConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'telegram')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const botToken = typeof cfg.bot_token === 'string' ? cfg.bot_token : '';
    if (!botToken) return null;
    return {
      id: String(data.id),
      tenantId: String(data.tenant_id),
      botId: typeof cfg.bot_id === 'number' ? cfg.bot_id : 0,
      botUsername: typeof cfg.bot_username === 'string' ? cfg.bot_username : null,
      botName: typeof cfg.bot_name === 'string' ? cfg.bot_name : null,
      botToken,
      webhookSecretToken: typeof cfg.webhook_secret_token === 'string' ? cfg.webhook_secret_token : '',
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadTelegramConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

export async function telegramForTenant(tenantId: string, workspaceId: string | null): Promise<{ adapter: TelegramAdapter; connector: TelegramConnector } | null> {
  const key = ck(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) {
    const connector = await loadTelegramConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }
  const connector = await loadTelegramConnector(tenantId);
  if (!connector) { cache.delete(key); return null; }
  const adapter = new TelegramAdapter({ botToken: connector.botToken, webhookSecretToken: connector.webhookSecretToken });
  cache.set(key, { adapter, cachedAt: Date.now() });
  return { adapter, connector };
}

export function invalidateTelegramForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(ck(tenantId, workspaceId));
}

/** Resolve tenant by the secret token Telegram echoes back on each delivery. */
export async function findTenantByTelegramSecret(secretToken: string): Promise<{ tenantId: string; connectorId: string; botToken: string; botId: number } | null> {
  if (!secretToken) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, auth_config')
      .eq('system', 'telegram')
      .eq('status', 'connected');
    if (error || !data) return null;
    const match = (data as Array<{ id: string; tenant_id: string; auth_config: any }>)
      .find((row) => (row.auth_config?.webhook_secret_token ?? '') === secretToken);
    if (!match) return null;
    const cfg = match.auth_config ?? {};
    return {
      tenantId: match.tenant_id,
      connectorId: match.id,
      botToken: cfg.bot_token ?? '',
      botId: cfg.bot_id ?? 0,
    };
  } catch (err) {
    logger.warn('findTenantByTelegramSecret failed', { error: String(err) });
    return null;
  }
}
