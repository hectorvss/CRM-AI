import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://erzfvnpzbmwnpchhemjt.supabase.co';

// The anon key is the ONLY key that should ever appear in browser code.
// It enforces Row Level Security — it cannot bypass RLS unlike the service role key.
// Set VITE_SUPABASE_ANON_KEY in your environment. If missing at build time we try
// to fetch it at runtime from /api/public/config (same endpoint the landing uses).
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let _supabase: SupabaseClient;

if (supabaseAnonKey) {
  _supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
  // Placeholder — will be replaced once /api/public/config responds.
  _supabase = createClient(supabaseUrl, 'demo-no-auth-key', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export let supabase = _supabase;

/**
 * Whether a real Supabase auth key is configured.
 * Updated asynchronously if the key is fetched at runtime.
 */
export let supabaseAuthEnabled = !!supabaseAnonKey;

/**
 * When VITE_SUPABASE_ANON_KEY is missing at build time, try fetching it from
 * the server's public config endpoint. This covers Vercel deployments where only
 * SUPABASE_ANON_KEY (without VITE_ prefix) is set.
 *
 * Returns `true` if the client was upgraded to a real auth client.
 */
export async function ensureSupabaseClient(): Promise<boolean> {
  if (supabaseAnonKey) return true; // already configured at build time

  try {
    const res = await fetch('/api/public/config', { credentials: 'omit' });
    if (!res.ok) return false;
    const cfg = await res.json();
    if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey) return false;

    const upgraded = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });

    // Swap the singleton so all subsequent imports see the real client.
    supabase = upgraded;
    _supabase = upgraded;
    supabaseAuthEnabled = true;
    return true;
  } catch {
    return false;
  }
}
