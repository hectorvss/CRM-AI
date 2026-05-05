import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import Prototype from './prototype/Prototype.tsx';
import InboxPrototype2 from './prototype/InboxPrototype2.tsx';
import PageErrorBoundary from './components/PageErrorBoundary.tsx';
import {
  supabase,
  isSupabaseConfigured,
  getSupabaseConfigError,
  ensureSupabaseClient,
} from './api/supabase';
import { UNAUTHORIZED_EVENT } from './api/hooks';
import './index.css';

// Membership cache key — kept in sync with `src/api/client.ts`. Cleared on 401
// so a stale tenant_id can't pollute the next session.
const MEMBERSHIP_CACHE_KEY = 'crmai.membership.v1';

/**
 * Global 401 handler.
 *
 * The SPA listens for `crmai:unauthorized` (dispatched by api/hooks.ts whenever
 * a request comes back 401). It clears local membership cache, signs the user
 * out of Supabase to invalidate the access token client-side, and redirects
 * them to the sign-in page with a `return` query param so they land back where
 * they were after re-authenticating.
 *
 * Guarded by `redirecting` — multiple in-flight 401s only redirect once.
 */
let redirecting = false;
async function handleUnauthorized() {
  if (redirecting) return;
  redirecting = true;

  try {
    localStorage.removeItem(MEMBERSHIP_CACHE_KEY);
  } catch { /* storage may be disabled */ }

  try {
    if (isSupabaseConfigured()) {
      await supabase.auth.signOut();
    }
  } catch (err) {
    console.error('[auth] signOut failed during 401 handler', err);
  }

  try {
    const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const target = `/#/signin?return=${encodeURIComponent(here)}`;
    window.location.href = target;
  } catch (err) {
    console.error('[auth] redirect to /signin failed', err);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener(UNAUTHORIZED_EVENT, () => {
    void handleUnauthorized();
  });
}

/**
 * Top-level shell. Performs the runtime supabase-config probe and either
 * renders the app or a fatal-config screen if Supabase is not reachable.
 */
function Root() {
  const [ready, setReady] = useState(isSupabaseConfigured());
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    (async () => {
      const ok = await ensureSupabaseClient();
      if (cancelled) return;
      if (ok) {
        setReady(true);
      } else {
        setFatal(getSupabaseConfigError() ?? 'Supabase is not configured.');
      }
    })();
    return () => { cancelled = true; };
  }, [ready]);

  if (fatal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-lg w-full rounded-lg border border-red-200 bg-white p-6 shadow-md">
          <div className="flex items-center gap-3 mb-3">
            <span className="material-symbols-outlined text-red-500">error</span>
            <h1 className="text-lg font-bold text-gray-900">Application not configured</h1>
          </div>
          <p className="text-sm text-gray-700 mb-3">
            The frontend cannot reach Supabase. Authentication is disabled until
            the deployment exposes the required environment variables:
          </p>
          <ul className="list-disc pl-5 text-sm text-gray-700 mb-3">
            <li><code>VITE_SUPABASE_URL</code></li>
            <li><code>VITE_SUPABASE_ANON_KEY</code></li>
          </ul>
          <p className="text-xs text-gray-500">
            Or expose <code>supabaseUrl</code> / <code>supabaseAnonKey</code> from
            <code> /api/public/config</code>.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded bg-gray-50 p-2 text-xs text-red-700">
            {fatal}
          </pre>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <PageErrorBoundary page="root">
      <App />
    </PageErrorBoundary>
  );
}

// Render standalone prototypes at ?prototype=N — no auth required.
const protoParam = typeof window !== 'undefined'
  ? new URLSearchParams(window.location.search).get('prototype')
  : null;

function PrototypeShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f3f3f1] flex items-start justify-start overflow-auto">
      {children}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrototypeShell><Prototype /></PrototypeShell>
  </StrictMode>,
);
