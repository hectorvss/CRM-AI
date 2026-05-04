/**
 * server/integrations/whatsapp-tenant.ts
 *
 * Per-tenant Meta WhatsApp Cloud API resolver. Independent from Twilio's
 * WhatsApp path — this lives on the `whatsapp` connector row, while
 * Twilio's WhatsApp lives on the `twilio` connector row. A merchant can
 * have either or both.
 *
 * Webhooks: Meta sends events with `entry[].id = WABA_ID` and
 * `entry[].changes[].value.metadata.phone_number_id`. We use those to
 * resolve which tenant owns the message.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { WhatsAppAdapter } from './whatsapp.js';

interface CacheEntry {
  adapter: WhatsAppAdapter;
  phoneNumberId: string;
  wabaId: string | null;
  cachedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function cacheKey(tenantId: string, workspaceId: string | null): string {
  return `${tenantId}::${workspaceId ?? '_'}`;
}

export interface WhatsAppConnector {
  id: string;
  tenantId: string;
  phoneNumberId: string;
  /** WhatsApp Business Account ID (the parent of phoneNumberId). */
  wabaId: string | null;
  accessToken: string;
  webhookSecret: string;
  verifyToken: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  rawAuthConfig: Record<string, unknown>;
}

export async function loadWhatsAppConnector(tenantId: string): Promise<WhatsAppConnector | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, system, status, auth_config')
      .eq('tenant_id', tenantId)
      .eq('system', 'whatsapp')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    const phoneNumberId = typeof cfg.phone_number_id === 'string' ? cfg.phone_number_id : '';
    const accessToken = typeof cfg.access_token === 'string' ? cfg.access_token : '';
    if (!phoneNumberId || !accessToken) return null;

    return {
      id: String(data.id),
      tenantId: String(data.tenant_id),
      phoneNumberId,
      wabaId: typeof cfg.waba_id === 'string' ? cfg.waba_id : null,
      accessToken,
      webhookSecret: typeof cfg.app_secret === 'string' ? cfg.app_secret : '',
      verifyToken: typeof cfg.verify_token === 'string' ? cfg.verify_token : '',
      displayPhoneNumber: typeof cfg.display_phone_number === 'string' ? cfg.display_phone_number : null,
      verifiedName: typeof cfg.verified_name === 'string' ? cfg.verified_name : null,
      rawAuthConfig: cfg,
    };
  } catch (err) {
    logger.warn('loadWhatsAppConnector failed', { tenantId, error: String(err) });
    return null;
  }
}

export async function whatsappForTenant(
  tenantId: string,
  workspaceId: string | null,
): Promise<{ adapter: WhatsAppAdapter; connector: WhatsAppConnector } | null> {
  const key = cacheKey(tenantId, workspaceId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) {
    const connector = await loadWhatsAppConnector(tenantId);
    if (connector) return { adapter: hit.adapter, connector };
  }

  const connector = await loadWhatsAppConnector(tenantId);
  if (!connector) {
    cache.delete(key);
    return null;
  }

  const adapter = new WhatsAppAdapter({
    accessToken: connector.accessToken,
    phoneNumberId: connector.phoneNumberId,
    verifyToken: connector.verifyToken,
    webhookSecret: connector.webhookSecret,
  });

  cache.set(key, {
    adapter,
    phoneNumberId: connector.phoneNumberId,
    wabaId: connector.wabaId,
    cachedAt: Date.now(),
  });

  return { adapter, connector };
}

export function invalidateWhatsAppForTenant(tenantId: string, workspaceId: string | null): void {
  cache.delete(cacheKey(tenantId, workspaceId));
}

/**
 * Resolve the tenant from a Meta webhook event. Meta puts the WABA id at
 * `entry[].id` and the phone_number_id at
 * `entry[].changes[].value.metadata.phone_number_id`. We try both:
 * phone_number_id is unique per number (preferred), wabaId is the fallback
 * if no phone_number_id (status events for templates etc.).
 */
export async function findTenantByPhoneNumberId(
  phoneNumberId: string,
): Promise<{ tenantId: string; connectorId: string; accessToken: string; webhookSecret: string; verifyToken: string } | null> {
  if (!phoneNumberId) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, auth_config, updated_at')
      .eq('system', 'whatsapp')
      .eq('status', 'connected');
    if (error || !data) return null;

    const match = (data as Array<{ id: string; tenant_id: string; auth_config: any; updated_at: string }>)
      .find((row) => (row.auth_config?.phone_number_id ?? '') === phoneNumberId);
    if (!match) return null;
    const cfg = match.auth_config ?? {};
    return {
      tenantId: match.tenant_id,
      connectorId: match.id,
      accessToken: cfg.access_token ?? '',
      webhookSecret: cfg.app_secret ?? '',
      verifyToken: cfg.verify_token ?? '',
    };
  } catch (err) {
    logger.warn('findTenantByPhoneNumberId failed', { error: String(err) });
    return null;
  }
}

/** Reverse lookup by WABA ID — used for template status events. */
export async function findTenantByWabaId(
  wabaId: string,
): Promise<{ tenantId: string; connectorId: string; accessToken: string; webhookSecret: string; verifyToken: string } | null> {
  if (!wabaId) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, tenant_id, auth_config, updated_at')
      .eq('system', 'whatsapp')
      .eq('status', 'connected');
    if (error || !data) return null;

    const match = (data as Array<{ id: string; tenant_id: string; auth_config: any; updated_at: string }>)
      .find((row) => (row.auth_config?.waba_id ?? '') === wabaId);
    if (!match) return null;
    const cfg = match.auth_config ?? {};
    return {
      tenantId: match.tenant_id,
      connectorId: match.id,
      accessToken: cfg.access_token ?? '',
      webhookSecret: cfg.app_secret ?? '',
      verifyToken: cfg.verify_token ?? '',
    };
  } catch (err) {
    logger.warn('findTenantByWabaId failed', { error: String(err) });
    return null;
  }
}
