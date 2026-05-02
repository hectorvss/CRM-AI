import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config.js';

/**
 * ⚠️  CRITICAL — TENANT ISOLATION MODEL  ⚠️
 * ─────────────────────────────────────────────────────────────────────────────
 * This module exposes the Supabase **service-role** client. The service-role
 * key BYPASSES Row-Level Security (RLS) entirely. Even though the database
 * schema declares RLS policies, they are NOT enforced for any query made
 * through `getSupabaseAdmin()`.
 *
 * Tenant isolation in this codebase is therefore an APPLICATION-LAYER
 * INVARIANT: every read/write must include an explicit
 *
 *     .eq('tenant_id', <currentTenantId>)
 *
 * filter (and, where applicable, `.eq('workspace_id', …)`).  Forgetting this
 * filter is a CRITICAL security bug — it leaks data across tenants.
 *
 * For new code, prefer `getSupabaseAdminScoped(tenantId)` from
 * `./scopedQuery.ts`, which automatically applies the tenant filter and
 * makes it impossible to forget. Existing call sites should be migrated
 * incrementally.
 *
 * NEVER expose this client to a browser/edge runtime — it must remain
 * server-side only.
 * ─────────────────────────────────────────────────────────────────────────────
 */

let _client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(config.db.supabaseUrl && config.db.supabaseServiceRoleKey);
}

export function getSupabaseAdmin(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }

  if (!_client) {
    _client = createClient(config.db.supabaseUrl!, config.db.supabaseServiceRoleKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return _client;
}

export function getSupabaseStatus() {
  return {
    enabled: config.db.provider === 'supabase',
    configured: isSupabaseConfigured(),
    url: config.db.supabaseUrl ? new URL(config.db.supabaseUrl).origin : null,
  };
}

export async function pingSupabase(): Promise<{ ok: boolean; error?: string | null }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'missing_credentials' };
  }

  try {
    const client = getSupabaseAdmin();
    const { error } = await client.from('workspaces').select('id').limit(1);
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'unknown_error',
    };
  }
}
