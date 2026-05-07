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
// CHANGED: the auto-redirect-on-401 was creating an unbreakable cross-reload
// loop with /#/signin (which auto-redirects back when it detects a Supabase
// session). We now NEVER auto-redirect from this handler. Instead, we show a
// sticky banner the user can click to manually re-authenticate. This
// guarantees the user can always reach the app even if iamApi.me 401s
// sporadically.
let bannerShown = false;
function showSessionExpiredBanner() {
  if (bannerShown) return;
  bannerShown = true;

  try { localStorage.removeItem(MEMBERSHIP_CACHE_KEY); } catch { /* storage may be disabled */ }

  if (typeof document === 'undefined') return;
  const ensure = () => {
    if (!document.body) { setTimeout(ensure, 50); return; }
    if (document.getElementById('crmai-session-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'crmai-session-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#fef3c7;color:#92400e;padding:8px 12px;text-align:center;z-index:99999;font-family:system-ui,-apple-system,sans-serif;font-size:13px;border-bottom:1px solid #fcd34d;';
    banner.innerHTML = 'Tu sesión ha expirado. <button id="crmai-resignin" style="background:#92400e;color:#fff;border:none;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:600;margin-left:8px;cursor:pointer">Iniciar sesión</button> <button id="crmai-banner-dismiss" style="background:transparent;color:#92400e;border:none;padding:4px 8px;font-size:12px;cursor:pointer;margin-left:4px">Descartar</button>';
    document.body.appendChild(banner);

    const resignin = document.getElementById('crmai-resignin');
    if (resignin) {
      resignin.addEventListener('click', async () => {
        try {
          if (isSupabaseConfigured()) await supabase.auth.signOut();
        } catch { /* ignore */ }
        const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.location.href = `/#/signin?return=${encodeURIComponent(here)}`;
      });
    }
    const dismiss = document.getElementById('crmai-banner-dismiss');
    if (dismiss) {
      dismiss.addEventListener('click', () => { banner.remove(); });
    }
  };
  ensure();
}

async function handleUnauthorized() {
  // No more auto-redirect. The previous behaviour created an unbreakable
  // signin↔app cross-reload loop. Instead surface a banner and let the user
  // re-authenticate deliberately when they choose to.
  console.warn('[auth] 401 received — auto-redirect disabled. Showing session banner.');
  showSessionExpiredBanner();
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
