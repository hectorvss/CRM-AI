/**
 * PrototypeApp — Production shell for the Clain prototype UI.
 *
 * Applies the same auth-gate chain as App.tsx (session check → login screen →
 * membership check → org setup → billing paywall) and then renders the
 * full Prototype UI instead of the legacy component-library App.
 *
 * This is the entry point rendered in production when the user navigates to
 * /app without ?app=1 (the legacy UI escape-hatch).
 */

import { useEffect, useState, type FormEvent } from 'react';
import { PermissionsProvider } from '../contexts/PermissionsContext';
import Login from '../components/auth/Login';
import Paywall from '../components/billing/Paywall';
import { supabase, supabaseAuthEnabled, ensureSupabaseClient } from '../api/supabase';
import { usePlanIntentRedirect } from '../hooks/usePlanIntentRedirect';
import Prototype from './Prototype';

// ── Login screen styled to match the Prototype brand ──────────────────────────

function ClainLoginScreen({ onLogin }: { onLogin: () => void }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: '#f3f3f1', fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <div className="w-full max-w-[400px]">
        {/* Logo / wordmark */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-10 h-10 rounded-[10px] flex items-center justify-center mb-3"
            style={{ background: '#3b59f6' }}
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
            </svg>
          </div>
          <h1 className="text-[22px] font-bold text-[#1a1a1a]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
            Clain
          </h1>
          <p className="text-[13px] text-[#646462] mt-1">Inicia sesión en tu workspace</p>
        </div>

        {/* Card */}
        <div
          className="bg-white rounded-[16px] p-8 shadow-sm"
          style={{ border: '1px solid #e9eae6' }}
        >
          <Login
            onLogin={() => {
              try {
                sessionStorage.removeItem('crmai.appUnauthRedirectAt');
                sessionStorage.removeItem('crmai.lastUnauthRedirect');
                sessionStorage.removeItem('crmai.unauthRedirectCount');
                sessionStorage.removeItem('crmai.unauthRedirectCountAt');
              } catch { /* ignore */ }
              onLogin();
            }}
          />
        </div>

        <p className="text-center text-[12px] text-[#9a9a96] mt-6">
          © {new Date().getFullYear()} Clain · Todos los derechos reservados
        </p>
      </div>
    </div>
  );
}

// ── Org-setup screen ───────────────────────────────────────────────────────────

function OrgSetupScreen({
  onSetupComplete,
}: {
  onSetupComplete: () => void;
}) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('El nombre de la organización es obligatorio'); return; }
    setLoading(true);
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Not authenticated');
      const res = await fetch('/api/onboarding/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orgName: name.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as any;
        throw new Error(body?.message ?? `Setup failed (${res.status})`);
      }
      try { await supabase.auth.refreshSession(); } catch { /* ignore */ }
      onSetupComplete();
    } catch (err: any) {
      setError(err.message || 'Error al configurar la organización');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: '#f3f3f1', fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <div className="w-full max-w-[400px] bg-white rounded-[16px] p-8 shadow-sm" style={{ border: '1px solid #e9eae6' }}>
        <h2 className="text-[20px] font-bold text-[#1a1a1a] mb-1">Configura tu organización</h2>
        <p className="text-[13px] text-[#646462] mb-6">
          Estás a un paso. Pon nombre a tu organización para crear tu workspace.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="Nombre de la organización"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full rounded-[8px] border border-[#e9eae6] px-3 py-2 text-[13px] outline-none focus:border-[#3b59f6] transition-colors"
          />
          {error && (
            <div className="text-[12px] text-red-600 bg-red-50 px-3 py-2 rounded-[8px]">{error}</div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full py-2.5 text-[13px] font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ background: '#3b59f6' }}
          >
            {loading ? 'Configurando…' : 'Crear workspace'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Loading spinner ────────────────────────────────────────────────────────────

function LoadingScreen({ message }: { message?: string }) {
  return (
    <div
      className="h-screen flex flex-col items-center justify-center gap-3"
      style={{ background: '#f3f3f1' }}
    >
      <div
        className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: '#3b59f6', borderTopColor: 'transparent' }}
      />
      {message && <p className="text-[13px] text-[#646462]">{message}</p>}
    </div>
  );
}

// ── Main exported component ────────────────────────────────────────────────────

export default function PrototypeApp() {
  // ── Graceful image fallback for Figma CDN / localhost:3845 assets ─────────
  // In production these decorative images 404. We catch the error at the
  // document level (capture phase) and hide the broken <img> element so the
  // UI degrades cleanly rather than showing browser broken-image icons.
  useEffect(() => {
    function handleImgError(e: Event) {
      const target = e.target as HTMLElement;
      if (target.tagName === 'IMG') {
        const img = target as HTMLImageElement;
        const src = img.src ?? '';
        if (src.includes('localhost:3845') || src.includes('figma.com/api/mcp/asset')) {
          img.style.display = 'none';
        }
      }
    }
    document.addEventListener('error', handleImgError, true);
    return () => document.removeEventListener('error', handleImgError, true);
  }, []);

  // ── Auth state ────────────────────────────────────────────────────────────
  const [authReady, setAuthReady] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  // ── Membership gate ───────────────────────────────────────────────────────
  const [hasMembership, setHasMembership] = useState<boolean | null>(null);
  const [orgIdForBilling, setOrgIdForBilling] = useState<string | null>(null);

  // ── Billing gate ──────────────────────────────────────────────────────────
  const [accessSnapshot, setAccessSnapshot] = useState<{
    canUseApp: boolean;
    reason: 'no_subscription' | 'trial_expired' | 'past_due_grace_ended' | 'canceled' | null;
    status: string;
    trialUsed: boolean;
    canActivateTrial: boolean;
  } | null>(null);
  const [accessReloadKey, setAccessReloadKey] = useState(0);

  // Plan-intent redirect (signup → Stripe Checkout bridge)
  const planIntentRedirect = usePlanIntentRedirect(
    Boolean(authenticated) && hasMembership === true,
  );

  // ── 1. Session bootstrap ──────────────────────────────────────────────────
  useEffect(() => {
    let sub: { unsubscribe: () => void } | null = null;
    (async () => {
      await ensureSupabaseClient();
      const { data } = await supabase.auth.getSession();
      setAuthenticated(!!data.session);
      setAuthReady(true);

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setAuthenticated(!!session);
        if (!session) setHasMembership(null);
      });
      sub = subscription;
    })();
    return () => { sub?.unsubscribe(); };
  }, []);

  // ── 2. Membership check ───────────────────────────────────────────────────
  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const user  = data.session?.user;
        if (!token || !user) return;

        // Fast-path: tenant_id baked into JWT claims
        const claimTenant =
          (user.app_metadata as any)?.tenant_id ||
          (user.user_metadata as any)?.tenant_id;
        if (claimTenant) {
          if (!cancelled) setHasMembership(true);
          return;
        }

        const res = await fetch('/api/iam/me', {
          headers: {
            'Content-Type':  'application/json',
            Authorization:   `Bearer ${token}`,
            'x-user-id':     user.id,
          },
        });
        if (cancelled) return;

        if (res.status === 404 || res.status === 401 || res.status === 403) {
          setHasMembership(false);
          return;
        }
        if (!res.ok) { setHasMembership(true); return; }

        const body = await res.json().catch(() => null) as any;
        const tenantId = body?.context?.tenant_id || body?.memberships?.[0]?.tenant_id;
        setHasMembership(Boolean(tenantId));
        if (tenantId) setOrgIdForBilling(tenantId);
      } catch {
        if (!cancelled) setHasMembership(true);
      }
    })();
    return () => { cancelled = true; };
  }, [authenticated]);

  // ── 3. Billing access check ───────────────────────────────────────────────
  useEffect(() => {
    if (!authenticated || hasMembership !== true) { setAccessSnapshot(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const res = await fetch('/api/billing/access', {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (!res.ok) {
          // Fail open — don't block users when billing is misconfigured
          setAccessSnapshot({ canUseApp: true, reason: null, status: 'unknown', trialUsed: false, canActivateTrial: false });
          return;
        }
        const body = await res.json();
        setAccessSnapshot({
          canUseApp:         !!body.canUseApp,
          reason:            body.reason ?? null,
          status:            body.status ?? 'unknown',
          trialUsed:         !!body.trialUsed,
          canActivateTrial:  !!body.canActivateTrial,
        });
      } catch {
        if (!cancelled)
          setAccessSnapshot({ canUseApp: true, reason: null, status: 'unknown', trialUsed: false, canActivateTrial: false });
      }
    })();
    return () => { cancelled = true; };
  }, [authenticated, hasMembership, accessReloadKey]);

  const hasSupabaseAuth = supabaseAuthEnabled;

  // ── Gate chain ────────────────────────────────────────────────────────────

  // Auth bootstrapping
  if (!authReady || authenticated === null) {
    return <LoadingScreen />;
  }

  // Unauthenticated → show branded login screen
  if (hasSupabaseAuth && !authenticated) {
    return (
      <ClainLoginScreen onLogin={() => setAuthenticated(true)} />
    );
  }

  // Checking membership…
  if (hasSupabaseAuth && authenticated && hasMembership === null) {
    return <LoadingScreen />;
  }

  // No membership yet → org setup
  if (hasSupabaseAuth && authenticated && hasMembership === false) {
    return <OrgSetupScreen onSetupComplete={() => setHasMembership(true)} />;
  }

  // Post-signup Stripe Checkout redirect
  if (hasSupabaseAuth && authenticated && hasMembership === true && planIntentRedirect.redirecting) {
    return <LoadingScreen message="Redirigiendo a la pasarela de pago…" />;
  }

  // Loading billing access
  if (hasSupabaseAuth && authenticated && hasMembership === true && accessSnapshot === null) {
    return <LoadingScreen />;
  }

  // Paywall
  if (hasSupabaseAuth && authenticated && hasMembership === true && accessSnapshot && !accessSnapshot.canUseApp) {
    return (
      <Paywall
        reason={accessSnapshot.reason}
        status={accessSnapshot.status}
        trialUsed={accessSnapshot.trialUsed}
        canActivateTrial={accessSnapshot.canActivateTrial}
        orgId={orgIdForBilling}
        onAccessGranted={() => setAccessReloadKey(k => k + 1)}
        onSignOut={async () => {
          await supabase.auth.signOut();
          window.location.href = '/';
        }}
      />
    );
  }

  // ── All gates passed → render the Prototype UI ────────────────────────────
  return (
    <PermissionsProvider>
      <div className="h-screen w-screen overflow-hidden" style={{ background: '#f3f3f1' }}>
        <Prototype />
      </div>
    </PermissionsProvider>
  );
}
