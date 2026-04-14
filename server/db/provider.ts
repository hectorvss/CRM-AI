import { getSupabaseStatus, isSupabaseConfigured, pingSupabase } from './supabase.js';
import { logger } from '../utils/logger.js';

export type DatabaseProvider = 'sqlite' | 'supabase';

export function getDatabaseProvider(): DatabaseProvider {
  return 'supabase';
}

export function getDatabaseProviderStatus() {
  return {
    provider: 'supabase' as const,
    ...getSupabaseStatus(),
  };
}

export function assertDatabaseProviderReady() {
  if (!isSupabaseConfigured()) {
    throw new Error('DB_PROVIDER is set to supabase but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.');
  }
}

export async function getDatabaseConnectivityStatus() {
  logger.info('Pinging Supabase...');
  const ping = await pingSupabase();
  logger.info('Supabase ping result', { ping });
  return {
    provider: 'supabase' as const,
    ...getSupabaseStatus(),
    connectivity: ping,
  };
}
