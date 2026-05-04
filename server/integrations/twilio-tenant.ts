/**
 * server/integrations/twilio-tenant.ts
 *
 * Per-tenant Twilio adapter resolver.
 *
 * Different from OAuth integrations: Twilio creds don't expire, so the
 * cache TTL just bounds memory usage. The reverse lookup
 * `findTenantByPhoneNumber` is the critical bit — Twilio webhooks
 * identify the destination via the `To` field, and we have to resolve
 * which tenant owns that number BEFORE we can verify the signature
 * (because every tenant signs with their own auth token).
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { TwilioAdapter } from './twilio.js';

interface CacheEntry {
  adapter: TwilioAdapter;
  accountSid: string;
  authToken: string;
  cachedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function cacheKey(tenantId: string, workspaceId: string | null): string {
  return `${tenantId}::${workspaceId ?? '_'}`;
}

export interface TwilioConnector {
  id: string;
  tenantId: string;
  accountSid: string;
  authToken: string;
  apiKeySid: string | null;
  apiKeySecret: string | null;
  defaultSmsFrom: string | null;
  defaultWhatsappFrom: string | null;
  messagingServiceSid: string | null;
  phoneNumberSids: string[];
  rawAuthConfig: Record<string, unknown>;
}

export async function loadTwilioConnector(tenantId: string): Promise<TwilioConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'twilio')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const accountSid = typeof cfg.account_sid === 'string' ? cfg.account_sid : '';
    const authToken = typeof cfg.auth_token === 'string' ? cfg.auth_token : '';
    if (!accountSid || !authToken) return null;

    return {
      id: String(data.id),
      tenantId: String(data.tenant_id),
      accountSid,
      authToken,
      apiKeySid: typeof cfg.api_key_sid === 'string' ? cfg.api_key_sid : null,
      apiKeySecret: typeof cfg.api_key_secret === 'string' ? cfg.api_key_secret : null,
      defaultSmsFrom: typeof cfg.default_sms_from === 'string' ? cfg.default_sms_from : null,
      defaultWhatsappFrom: typeof cfg.default_whatsapp_from === 'string' ? cfg.default_whatsapp_from : null,
      messagingServiceSid: typeof cfg.messaging_service_sid === 'string' ? cfg.messaging_service_sid : null,
      phoneNumberSids: Array.isArray(cfg.phone_number_sids) ? (cfg.phone_number_sids as string[]) : [],
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadTwilioConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

export async function twilioForTenant(
  tenantId: string,
  workspaceId: string | null,
): Promise<{ adapter: TwilioAdapter; connector: TwilioConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) {
    const connector = await loadTwilioConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }

  const connector = await loadTwilioConnector(tenantId);
  if (!connector) {
    cache.delete(key);
    return null;
  }

  const adapter = new TwilioAdapter({
    accountSid: connector.accountSid,
    authToken: connector.authToken,
    apiKeySid: connector.apiKeySid ?? undefined,
    apiKeySecret: connector.apiKeySecret ?? undefined,
  });

  cache.set(key, {
    adapter,
    accountSid: connector.accountSid,
    authToken: connector.authToken,
    cachedAt: Date.now(),
  });

  return { adapter, connector };
}

export function invalidateTwilioForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}

/**
 * Reverse lookup: given a phone number Twilio sent the webhook to, find
 * which tenant owns it. Critical for multi-tenant signature verification —
 * we MUST use the right authToken to validate, and that means knowing the
 * tenant before we trust anything in the request.
 *
 * Strategy:
 *   1. Strip channel prefixes (`whatsapp:` etc.) and normalise to E.164.
 *   2. Match against any `auth_config.phone_numbers[].phone_number` that
 *      the merchant registered, OR `auth_config.default_sms_from`, OR
 *      `auth_config.default_whatsapp_from`.
 *   3. Pick the most-recently-updated connector if multiple match.
 */
export async function findTenantByTwilioNumber(toRaw: string): Promise<{ tenantId: string; connectorId: string; authToken: string; accountSid: string } | null> {
  const normalised = toRaw.replace(/^whatsapp:/i, '').replace(/^sms:/i, '').trim();
  if (!normalised) return null;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, auth_config, updated_at')
      .eq('system', 'twilio')
      .eq('status', 'connected');
    if (error || !data) return null;

    const candidates = (data as Array<{ id: string; tenant_id: string; auth_config: any; updated_at: string }>)
      .filter((row) => {
        const cfg = row.auth_config ?? {};
        const numbers: string[] = Array.isArray(cfg.phone_numbers)
          ? cfg.phone_numbers.map((p: any) => p.phone_number ?? p)
          : [];
        const candidates = [
          cfg.default_sms_from,
          cfg.default_whatsapp_from,
          ...numbers,
        ].filter(Boolean) as string[];
        return candidates.some((c) => normaliseNumber(c) === normaliseNumber(normalised));
      })
      .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));

    const match = candidates[0];
    if (!match) return null;
    const cfg = match.auth_config ?? {};
    return {
      tenantId: match.tenant_id,
      connectorId: match.id,
      authToken: cfg.auth_token,
      accountSid: cfg.account_sid,
    };
  } catch (err) {
    logger.warn('findTenantByTwilioNumber failed', { error: String(err) });
    return null;
  }
}

function normaliseNumber(raw: string): string {
  return raw.replace(/^whatsapp:/i, '').replace(/^sms:/i, '').replace(/\s+/g, '').trim();
}
