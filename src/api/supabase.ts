/**
 * Supabase client factory for the SPA.
 *
 * Configuration sources (priority):
 *   1. `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` baked at build time.
 *   2. Runtime fetch from `/api/public/config` (covers Vercel deployments where
 *      only the un-prefixed `SUPABASE_*` vars exist server-side).
 *
 * If NEITHER is available the SPA cannot authenticate users. We DO NOT silently
 * fall back to a fake key — that hides the misconfiguration and lets users land
 * on a dashboard that quietly returns 401 forever. Instead:
 *   - `supabase` exports a stub client that throws on any auth call (so the app
 *     surfaces the failure rather than hanging indefinitely).
 *   - `isSupabaseConfigured()` returns `false`.
 *   - `getSupabaseConfigError()` returns a human-readable diagnostic string.
 *   - The top-level `<App>` shows a fatal-config screen explaining the env vars
 *     that must be set.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const buildTimeUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
const buildTimeKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;

let _supabase: SupabaseClient | null = null;
let _configured = false;
let _configError: string | null = null;

const SUPABASE_AUTH_OPTIONS = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Keeps tokens fresh on tab focus so a long-idle dashboard doesn't 401.
    detectSessionInUrl: true,
  },
} as const;

function buildClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, SUPABASE_AUTH_OPTIONS);
}

/**
 * Throws on any access. Used as a placeholder when no Supabase config is
 * available — calling code that depends on auth will surface a clear error
 * rather than hanging on a bogus key.
 */
function makeUnconfiguredClient(): SupabaseClient {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === 'then') return undefined; // not a thenable
      throw new Error(
        '[supabase] client is not configured. ' +
        'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or expose them via /api/public/config).',
      );
    },
  };
  return new Proxy({}, handler) as unknown as SupabaseClient;
}

if (buildTimeUrl && buildTimeKey) {
  _supabase = buildClient(buildTimeUrl, buildTimeKey);
  _configured = true;
} else {
  _supabase = makeUnconfiguredClient();
  _configured = false;
  const missing: string[] = [];
  if (!buildTimeUrl) missing.push('VITE_SUPABASE_URL');
  if (!buildTimeKey) missing.push('VITE_SUPABASE_ANON_KEY');
  _configError = `Missing build-time env vars: ${missing.join(', ')}. Will attempt runtime config from /api/public/config.`;
}

export let supabase: SupabaseClient = _supabase!;

/**
 * Backwards-compatible flag (some components still read this).
 * Kept in sync with `isSupabaseConfigured()`.
 */
export let supabaseAuthEnabled = _configured;

export function isSupabaseConfigured(): boolean {
  return _configured;
}

export function getSupabaseConfigError(): string | null {
  return _configError;
}

/**
 * Best-effort runtime config fetch. Idempotent — once a real client is wired
 * up, subsequent calls short-circuit. Returns `true` if a usable client is
 * available after the call.
 *
 * On failure we DO NOT downgrade to a fake key. The unconfigured-client proxy
 * stays in place so `App.tsx` can render the fatal-config screen.
 */
let _runtimeFetchPromise: Promise<boolean> | null = null;

export async function ensureSupabaseClient(): Promise<boolean> {
  if (_configured) return true;
  if (_runtimeFetchPromise) return _runtimeFetchPromise;

  _runtimeFetchPromise = (async () => {
    try {
      const res = await fetch('/api/public/config', { credentials: 'omit' });
      if (!res.ok) {
        _configError = `Runtime config fetch failed (HTTP ${res.status}). Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.`;
        return false;
      }
      const cfg = await res.json().catch(() => null) as { supabaseUrl?: string; supabaseAnonKey?: string } | null;
      if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey) {
        _configError = 'Runtime config response missing supabaseUrl/supabaseAnonKey.';
        return false;
      }

      const upgraded = buildClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
      // Swap the singleton reference so subsequent imports see the real client.
      _supabase = upgraded;
      supabase = upgraded;
      _configured = true;
      _configError = null;
      supabaseAuthEnabled = true;
      return true;
    } catch (err) {
      _configError = `Runtime config fetch threw: ${(err as Error)?.message ?? 'unknown error'}`;
      console.error('[supabase] runtime config fetch failed', err);
      return false;
    } finally {
      // Allow another attempt on next reload, but not within this session.
      _runtimeFetchPromise = null;
    }
  })();

  return _runtimeFetchPromise;
}
