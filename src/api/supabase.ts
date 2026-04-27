import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://erzfvnpzbmwnpchhemjt.supabase.co';

// The anon key is the ONLY key that should ever appear in browser code.
// It enforces Row Level Security — it cannot bypass RLS unlike the service role key.
// Set VITE_SUPABASE_ANON_KEY in your environment. If missing, auth is skipped (demo mode).
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let _supabase: SupabaseClient;

if (supabaseAnonKey) {
  _supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
  // Demo / offline mode: create a client that always returns no session.
  // API calls still work via the fallback x-tenant-id headers in client.ts.
  _supabase = createClient(supabaseUrl, 'demo-no-auth-key', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const supabase = _supabase;
