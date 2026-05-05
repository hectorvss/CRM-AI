import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { PermissionsProvider } from './contexts/PermissionsContext';
import Sidebar from './components/Sidebar';
import Inbox from './components/Inbox';
import Home from './components/Home';
import AIStudio from './components/AIStudio';
import Workflows from './components/Workflows';
import Approvals from './components/Approvals';
import Knowledge from './components/Knowledge';
import Customers from './components/Customers';
import ToolsIntegrations from './components/ToolsIntegrations';
import Reports from './components/Reports';
import Settings from './components/Settings';
import Upgrade from './components/Upgrade';
import Profile from './components/Profile';
import Orders from './components/Orders';
import Returns from './components/Returns';
import Payments from './components/Payments';
import CaseGraph from './components/CaseGraph';
import PageErrorBoundary from './components/PageErrorBoundary';
import SuperAgent from './components/SuperAgent';
import GlobalSearch from './components/GlobalSearch';
import Login from './components/auth/Login';
import Signup from './components/auth/Signup';
import Paywall from './components/billing/Paywall';
import { supabase, supabaseAuthEnabled, ensureSupabaseClient } from './api/supabase';
import { usePlanIntentRedirect } from './hooks/usePlanIntentRedirect';
import { NavigateInput, NavigationTarget, Page } from './types';

const DEFAULT_TARGET: NavigationTarget = {
  page: 'inbox',
  entityType: 'case',
  entityId: null,
  section: null,
  sourceContext: null,
  runId: null,
  draftPrompt: null,
  draftLabel: null,
};

function entityTypeFromPage(page: Page): NavigationTarget['entityType'] {
  switch (page) {
    case 'inbox':
    case 'case_graph':
      return 'case';
    case 'orders':
      return 'order';
    case 'payments':
      return 'payment';
    case 'returns':
      return 'return';
    case 'approvals':
      return 'approval';
    case 'customers':
      return 'customer';
    case 'workflows':
      return 'workflow';
    case 'knowledge':
      return 'knowledge';
    case 'reports':
      return 'report';
    case 'settings':
      return 'setting';
    default:
      return 'workspace';
  }
}

function normalizeNavigationTarget(target: NavigateInput, entityId?: string | null): NavigationTarget {
  if (typeof target === 'string') {
    return {
      page: target,
      entityType: entityTypeFromPage(target),
      entityId: entityId ?? null,
      section: null,
      sourceContext: null,
      runId: null,
      draftPrompt: null,
      draftLabel: null,
    };
  }

  return {
    page: target.page,
    entityType: target.entityType ?? entityTypeFromPage(target.page),
    entityId: target.entityId ?? null,
    section: target.section ?? null,
    sourceContext: target.sourceContext ?? null,
    runId: target.runId ?? null,
    draftPrompt: target.draftPrompt ?? null,
    draftLabel: target.draftLabel ?? null,
  };
}

function isValidPage(value: string | null): value is Page {
  return [
    'inbox',
    'super_agent',
    'home',
    'ai_studio',
    'workflows',
    'approvals',
    'knowledge',
    'customers',
    'tools_integrations',
    'reports',
    'settings',
    'orders',
    'returns',
    'payments',
    'case_graph',
    'upgrade',
    'profile',
  ].includes(String(value));
}

function parseNavigationTargetFromUrl(): NavigationTarget {
  if (typeof window === 'undefined') {
    return DEFAULT_TARGET;
  }

  const params = new URLSearchParams(window.location.search);
  const page = params.get('view');

  if (!isValidPage(page)) {
    return DEFAULT_TARGET;
  }

  return {
    page,
    entityType: (params.get('entityType') as NavigationTarget['entityType']) || entityTypeFromPage(page),
    entityId: params.get('entityId'),
    section: params.get('section'),
    sourceContext: params.get('source'),
    runId: params.get('runId'),
  };
}

function serializeNavigationTarget(target: NavigationTarget) {
  const params = new URLSearchParams();
  params.set('view', target.page);
  if (target.entityType) params.set('entityType', target.entityType);
  if (target.entityId) params.set('entityId', target.entityId);
  if (target.section) params.set('section', target.section);
  if (target.sourceContext) params.set('source', target.sourceContext);
  if (target.runId) params.set('runId', target.runId);
  return `?${params.toString()}`;
}

export default function App() {
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [navigationTarget, setNavigationTarget] = useState<NavigationTarget>(
    typeof window !== 'undefined' ? parseNavigationTargetFromUrl() : DEFAULT_TARGET,
  );
  // Auth state — null = loading, false = unauthenticated, true = authenticated
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [showSignup, setShowSignup] = useState(false);
  // Post-auth onboarding gate: null = unknown, true = has membership, false = needs org setup
  const [hasMembership, setHasMembership] = useState<boolean | null>(null);
  const [orgSetupName, setOrgSetupName] = useState('');
  const [orgSetupLoading, setOrgSetupLoading] = useState(false);
  const [orgSetupError, setOrgSetupError] = useState('');
  // Billing gate: null = loading, snapshot otherwise. Drives Paywall vs app.
  const [accessSnapshot, setAccessSnapshot] = useState<{
    canUseApp: boolean;
    reason: 'no_subscription' | 'trial_expired' | 'past_due_grace_ended' | 'canceled' | null;
    status: string;
    trialUsed: boolean;
    canActivateTrial: boolean;
  } | null>(null);
  const [orgIdForBilling, setOrgIdForBilling] = useState<string | null>(null);
  const [accessReloadKey, setAccessReloadKey] = useState(0);

  const currentPage = navigationTarget.page;

  // Bridge for the landing → pricing → checkout funnel: if the user signed
  // up via /signup?plan=… we stashed `plan_intent` in user_metadata. Honour
  // it once they reach /app by sending them to Stripe Checkout. Gated on
  // membership so /api/onboarding/setup runs against a fully-bootstrapped
  // user record.
  const planIntentRedirect = usePlanIntentRedirect(
    Boolean(authenticated) && hasMembership === true,
  );

  const navigate = useCallback((target: NavigateInput, entityId?: string | null) => {
    setNavigationTarget(normalizeNavigationTarget(target, entityId));
  }, []);

  // Auth: ensure Supabase client is ready (may need runtime config fetch),
  // then check session + subscribe to auth state changes.
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let sub: { unsubscribe: () => void } | null = null;

    (async () => {
      // If VITE_SUPABASE_ANON_KEY was missing at build time, try fetching it
      // from /api/public/config so the SPA still works on Vercel.
      await ensureSupabaseClient();

      // Now supabase singleton is guaranteed to be the real (or demo) client.
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

  // Membership check: once authenticated, verify the user has an active
  // membership. If not (e.g. first login after email confirmation), gate the
  // app on a minimal "name your organization" step that calls /onboarding/setup.
  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const user = data.session?.user;
        if (!token || !user) return;

        const claimTenant = (user.app_metadata as any)?.tenant_id || (user.user_metadata as any)?.tenant_id;
        if (claimTenant) {
          if (!cancelled) setHasMembership(true);
          return;
        }

        const res = await fetch('/api/iam/me', {
          headers: {
            'Content-Type': 'application/json',
            Authorization:  `Bearer ${token}`,
            'x-user-id':    user.id,
          },
        });

        if (cancelled) return;

        // 404 = user record missing, 401/403 = no permission/membership →
        // both indicate the onboarding scaffold has not run yet.
        if (res.status === 404 || res.status === 401 || res.status === 403) {
          setHasMembership(false);
          return;
        }

        if (!res.ok) {
          // Other errors: don't block — let downstream calls surface them.
          setHasMembership(true);
          return;
        }

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

  // Billing access check: runs after membership is confirmed.
  // The result decides whether to render the Paywall or the app.
  useEffect(() => {
    if (!authenticated || hasMembership !== true) {
      setAccessSnapshot(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const res = await fetch('/api/billing/access', {
          headers: {
            'Content-Type': 'application/json',
            Authorization:  `Bearer ${token}`,
          },
        });
        if (cancelled) return;
        if (!res.ok) {
          // Fail open in dev / when billing is misconfigured — but log loudly.
          console.warn('[billing.access] fetch failed', res.status);
          setAccessSnapshot({
            canUseApp: true,
            reason: null,
            status: 'unknown',
            trialUsed: false,
            canActivateTrial: false,
          });
          return;
        }
        const body = await res.json();
        setAccessSnapshot({
          canUseApp: !!body.canUseApp,
          reason: body.reason ?? null,
          status: body.status ?? 'unknown',
          trialUsed: !!body.trialUsed,
          canActivateTrial: !!body.canActivateTrial,
        });
      } catch (e) {
        if (!cancelled) {
          // Fail open on transient errors.
          setAccessSnapshot({
            canUseApp: true, reason: null, status: 'unknown',
            trialUsed: false, canActivateTrial: false,
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [authenticated, hasMembership, accessReloadKey]);

  const submitOrgSetup = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgSetupName.trim()) {
      setOrgSetupError('Organisation name is required');
      return;
    }
    setOrgSetupLoading(true);
    setOrgSetupError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Not authenticated');
      const res = await fetch('/api/onboarding/setup', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          Authorization:   `Bearer ${token}`,
        },
        body: JSON.stringify({ orgName: orgSetupName.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as any;
        throw new Error(body?.message ?? `Setup failed (${res.status})`);
      }
      // Refresh the Supabase session so the new app_metadata claims are loaded.
      try { await supabase.auth.refreshSession(); } catch { /* ignore */ }
      setHasMembership(true);
    } catch (err: any) {
      setOrgSetupError(err.message || 'Organisation setup failed');
    } finally {
      setOrgSetupLoading(false);
    }
  }, [orgSetupName]);

  // Global Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handlePopState = () => {
      setNavigationTarget(parseNavigationTargetFromUrl());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nextUrl = `${window.location.pathname}${serializeNavigationTarget(navigationTarget)}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState({}, '', nextUrl);
    }
  }, [navigationTarget]);

  const pageFocus = useMemo(
    () => ({
      caseId: navigationTarget.entityType === 'case' ? navigationTarget.entityId : null,
      orderId: navigationTarget.entityType === 'order' ? navigationTarget.entityId : null,
      paymentId: navigationTarget.entityType === 'payment' ? navigationTarget.entityId : null,
      returnId: navigationTarget.entityType === 'return' ? navigationTarget.entityId : null,
      approvalId: navigationTarget.entityType === 'approval' ? navigationTarget.entityId : null,
      customerId: navigationTarget.entityType === 'customer' ? navigationTarget.entityId : null,
      workflowId: navigationTarget.entityType === 'workflow' ? navigationTarget.entityId : null,
    }),
    [navigationTarget],
  );

  // Loading auth state (includes runtime config fetch on first load)
  if (!authReady || authenticated === null) {
    return (
      <div className="bg-background-light dark:bg-background-dark h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Unauthenticated — redirect back to the landing if auth is enabled.
  // supabaseAuthEnabled is updated at runtime after ensureSupabaseClient().
  const hasSupabaseAuth = supabaseAuthEnabled;
  if (hasSupabaseAuth && !authenticated) {
    // If we're at /app and not logged in, send them to the landing signin
    window.location.href = '/#/signin';
    return (
      <div className="bg-background-light dark:bg-background-dark h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // (Login/Signup inline forms removed — auth now lives on the landing page.
  //  The SPA redirects unauthenticated users to /#/signin above.)

  // Authenticated but no membership yet → gate on org setup (covers first
  // login after email confirmation, where signUp didn't run /onboarding/setup).
  if (hasSupabaseAuth && authenticated && hasMembership === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-6 bg-white p-8 rounded-lg shadow-md">
          <h2 className="text-center text-2xl font-bold text-gray-900">
            Configura tu organización
          </h2>
          <p className="text-center text-sm text-gray-500">
            Estás a un paso. Pon nombre a tu organización para crear tu workspace.
          </p>
          <form className="space-y-4" onSubmit={submitOrgSetup}>
            <input
              type="text"
              placeholder="Organisation name"
              required
              value={orgSetupName}
              onChange={(e) => setOrgSetupName(e.target.value)}
              className="block w-full rounded-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6 px-3"
            />
            {orgSetupError && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{orgSetupError}</div>
            )}
            <button
              type="submit"
              disabled={orgSetupLoading}
              className="w-full rounded-md bg-blue-600 py-2 px-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {orgSetupLoading ? 'Setting up...' : 'Create workspace'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // While we're checking membership, show the same loading spinner.
  if (hasSupabaseAuth && authenticated && hasMembership === null) {
    return (
      <div className="bg-background-light dark:bg-background-dark h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Post-signup checkout bridge: while we're forwarding the user to Stripe,
  // suppress the Paywall (which would otherwise fight for the same slot for
  // users who just signed up and have no subscription yet).
  if (hasSupabaseAuth && authenticated && hasMembership === true && planIntentRedirect.redirecting) {
    return (
      <div className="bg-background-light dark:bg-background-dark h-screen flex flex-col items-center justify-center gap-4">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Redirecting to checkout…
        </p>
      </div>
    );
  }

  // Loading billing access state.
  if (hasSupabaseAuth && authenticated && hasMembership === true && accessSnapshot === null) {
    return (
      <div className="bg-background-light dark:bg-background-dark h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Paywall: forced choice between trial, paid plan, or demo request.
  if (hasSupabaseAuth && authenticated && hasMembership === true && accessSnapshot && !accessSnapshot.canUseApp) {
    return (
      <Paywall
        reason={accessSnapshot.reason}
        status={accessSnapshot.status}
        trialUsed={accessSnapshot.trialUsed}
        canActivateTrial={accessSnapshot.canActivateTrial}
        orgId={orgIdForBilling}
        onAccessGranted={() => setAccessReloadKey((k) => k + 1)}
        onSignOut={async () => {
          await supabase.auth.signOut();
          window.location.href = '/';
        }}
      />
    );
  }

  return (
    <PermissionsProvider>
    <div className="bg-background-light dark:bg-background-dark text-gray-800 dark:text-gray-200 font-sans h-screen flex overflow-hidden selection:bg-purple-200 dark:selection:bg-purple-900">
      <Sidebar
        currentPage={currentPage}
        currentSection={navigationTarget.section}
        onPageChange={navigate}
        isOpen={isLeftSidebarOpen}
        onToggle={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
        onSearchOpen={() => setSearchOpen(true)}
      />
      <main className="flex-1 flex flex-col h-full min-w-0 relative">
        <PageErrorBoundary page={currentPage}>
          {currentPage === 'inbox' && <Inbox focusCaseId={pageFocus.caseId} />}
          {currentPage === 'super_agent' && <SuperAgent onNavigate={navigate} activeTarget={navigationTarget} />}
          {currentPage === 'home' && <Home onNavigate={navigate} />}
          {currentPage === 'ai_studio' && <AIStudio />}
          {currentPage === 'workflows' && <Workflows onNavigate={navigate} focusWorkflowId={pageFocus.workflowId} />}
          {currentPage === 'approvals' && <Approvals onNavigate={navigate} focusApprovalId={pageFocus.approvalId} />}
          {currentPage === 'knowledge' && <Knowledge />}
          {currentPage === 'customers' && <Customers onNavigate={navigate} focusCustomerId={pageFocus.customerId} />}
          {currentPage === 'tools_integrations' && <ToolsIntegrations />}
          {currentPage === 'reports' && <Reports />}
          {currentPage === 'settings' && <Settings onNavigate={navigate} initialSection={navigationTarget.section} />}
          {currentPage === 'upgrade' && <Upgrade />}
          {currentPage === 'profile' && <Profile onNavigate={navigate} initialSection={navigationTarget.section} />}
          {currentPage === 'orders' && <Orders onNavigate={navigate} focusEntityId={pageFocus.orderId} focusSection={navigationTarget.section} />}
          {currentPage === 'returns' && <Returns onNavigate={navigate} focusEntityId={pageFocus.returnId} focusSection={navigationTarget.section} />}
          {currentPage === 'payments' && <Payments onNavigate={navigate} focusEntityId={pageFocus.paymentId} focusSection={navigationTarget.section} />}
          {currentPage === 'case_graph' && <CaseGraph onPageChange={(target) => {
            if (typeof target === 'string') {
              navigate(target, target === 'case_graph' ? pageFocus.caseId : null);
            } else {
              navigate(target);
            }
          }} focusCaseId={pageFocus.caseId} />}
        </PageErrorBoundary>
      </main>

      {/* Global Search modal — rendered outside main so it overlays everything */}
      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={navigate}
      />
    </div>
    </PermissionsProvider>
  );
}
