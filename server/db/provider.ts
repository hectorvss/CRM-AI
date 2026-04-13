import { config } from '../config.js';
import { getSupabaseStatus, isSupabaseConfigured, pingSupabase } from './supabase.js';
import { logger } from '../utils/logger.js';

export type DatabaseProvider = 'sqlite' | 'supabase';

export function getDatabaseProvider(): DatabaseProvider {
  return config.db.provider;
}

export function getDatabaseProviderStatus() {
  if (config.db.provider === 'supabase') {
    return {
      provider: 'supabase' as const,
      ...getSupabaseStatus(),
    };
  }

  return {
    provider: 'sqlite' as const,
    enabled: true,
    configured: true,
    path: config.db.path,
  };
}

export function assertDatabaseProviderReady() {
  if (config.db.provider === 'supabase' && !isSupabaseConfigured()) {
    throw new Error('DB_PROVIDER is set to supabase but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.');
  }
}

export async function getDatabaseConnectivityStatus() {
  if (config.db.provider === 'supabase') {
    logger.info('Pinging Supabase...');
    const ping = await pingSupabase();
    logger.info('Supabase ping result', { ping });
    return {
      provider: 'supabase' as const,
      ...getSupabaseStatus(),
      connectivity: ping,
    };
  }

  return {
    provider: 'sqlite' as const,
    enabled: true,
    configured: true,
    path: config.db.path,
    connectivity: { ok: true as const },
  };
}
