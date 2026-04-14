import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config.js';

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
