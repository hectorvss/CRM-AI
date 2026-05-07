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
const LAST_REDIRECT_KEY = 'crmai.lastUnauthRedirect';
const COUNT_KEY = 'crmai.unauthRedirectCount';
const COUNT_RESET_KEY = 'crmai.unauthRedirectCountAt';
async function handleUnauthorized() {
  if (redirecting) return;

  // Hard-stop ceiling: if we've already redirected 3+ times in the last
  // 60s the user is in a redirect storm we cannot recover from automatically.
  // Halt all further redirects for this session and surface a banner so the
  // user can see what's happening and reload manually. This is the absolute
  // backstop for any path that bypasses the 10s throttle below.
  try {
    const countRaw = sessionStorage.getItem(COUNT_KEY);
    const countAt = parseInt(sessionStorage.getItem(COUNT_RESET_KEY) || '0', 10);
    const now = Date.now();
    const count = (countRaw && now - countAt < 60000) ? parseInt(countRaw, 10) : 0;
    if (count >= 3) {
      console.error('[auth] Hard-stop: 3+ unauthorized redirects in 60s. Halting.');
      try {
        document.body.insertAdjacentHTML(
          'afterbegin',
          '<div style="position:fixed;top:0;left:0;right:0;background:#fee2e2;color:#b91c1c;padding:8px;text-align:center;z-index:9999;font-family:system-ui;font-size:13px">Sesión expirada — recarga la página manualmente.</div>',
        );
      } catch { /* DOM may not be ready */ }
      return;
    }
    sessionStorage.setItem(COUNT_KEY, String(count + 1));
    sessionStorage.setItem(COUNT_RESET_KEY, String(now));
  } catch { /* sessionStorage may be unavailable */ }

  // Throttle: if we just redirected within the last 10s, skip. This breaks the
  // page-reload loop that happens when a 401 fires immediately after the user
  // lands back on the page (token refresh race / session not yet hydrated).
  // Without this, the user sees the page constantly "reload".
  try {
    const recent = sessionStorage.getItem(LAST_REDIRECT_KEY);
    if (recent) {
      const ageMs = Date.now() - parseInt(recent, 10);
      if (Number.isFinite(ageMs) && ageMs < 10000) {
        console.warn('[auth] Skipping unauthorized redirect — fired again within 10s. Possible token refresh race.');
        return;
      }
    }
  } catch { /* sessionStorage may be unavailable */ }

  redirecting = true;
  try {
    sessionStorage.setItem(LAST_REDIRECT_KEY, String(Date.now()));
  } catch { /* sessionStorage may be unavailable */ }

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

  // When `?prototype=1` is set, render the new Fin/Inbox prototype inside
  // the same auth-bootstrapped shell so its components can hit the live API
  // (agents, reports, operations, …). Without auth the prototype still
  // renders, but `useApi` calls fall back to empty state.
  if (protoParam === '1') {
    return (
      <PageErrorBoundary page="prototype">
        <PrototypeShell><Prototype /></PrototypeShell>
      </PageErrorBoundary>
    );
  }
  if (protoParam === '2') {
    return (
      <PageErrorBoundary page="prototype">
        <PrototypeShell><InboxPrototype2 /></PrototypeShell>
      </PageErrorBoundary>
    );
  }
  return (
    <PageErrorBoundary page="root">
      <App />
    </PageErrorBoundary>
  );
}

// Pulled out of `renderApp()` so the auth-bootstrapped Root can decide
// whether to render the prototype or the production App.
const protoParam = typeof window !== 'undefined'
  ? new URLSearchParams(window.location.search).get('prototype')
  : null;

function PrototypeShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen w-screen bg-[#f3f3f1] overflow-hidden">
      {children}
    </div>
  );
}

// Always go through Root() so Supabase config + session are bootstrapped
// before either the App or the Prototype renders.
function renderApp() {
  return <Root />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {renderApp()}
  </StrictMode>,
);
