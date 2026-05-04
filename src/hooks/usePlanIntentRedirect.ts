/**
 * usePlanIntentRedirect
 * --------------------
 * Bridges the landing-page signup flow with Stripe Checkout.
 *
 * The landing CTAs (`/signup?plan=starter|growth|scale|topup`) stash the
 * selection in `user_metadata.plan_intent` at signup time
 * (see `public-landing/auth.jsx:537`). After email confirmation the user
 * lands at `/app` — but the SPA never read that intent, so the funnel
 * silently dropped users into the dashboard instead of taking them to
 * Stripe Checkout. This hook closes the loop:
 *
 *   1. On first authenticated render, read `user_metadata.plan_intent`.
 *   2. If it's a recognized plan, ensure org/workspace exist
 *      (`POST /api/onboarding/setup`, idempotent), then create a checkout
 *      session and redirect.
 *   3. If it's `topup`, redirect through the topup-checkout endpoint
 *      with a default pack.
 *   4. Clear the metadata so it does not fire on subsequent loads.
 *
 * Runs once per browser session (sessionStorage guard) so a refresh while
 * Stripe is loading does not retrigger.
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../api/supabase';

type PlanIntent = 'starter' | 'growth' | 'scale' | 'topup';

const VALID_PLANS: ReadonlySet<PlanIntent> = new Set(['starter', 'growth', 'scale', 'topup']);
const SESSION_GUARD_KEY = 'crmai.planIntentRedirect.fired';
const DEFAULT_TOPUP_PACK = '5k' as const;

function isPlanIntent(value: unknown): value is PlanIntent {
  return typeof value === 'string' && VALID_PLANS.has(value as PlanIntent);
}

export interface PlanIntentRedirectState {
  /** True while we are calling onboarding/setup + checkout-session. */
  redirecting: boolean;
  /** Last error from the redirect attempt, if any. */
  error: string | null;
}

/**
 * Drives the post-signup → Stripe Checkout redirect.
 *
 * @param enabled  Pass `true` only once the user is authenticated AND the
 *                 membership check is complete. Calling it earlier is a
 *                 no-op.
 */
export function usePlanIntentRedirect(enabled: boolean): PlanIntentRedirectState {
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (firedRef.current) return;

    // sessionStorage guard survives in-tab re-renders + StrictMode double-mount
    // but lets a brand-new tab retry if the previous attempt hard-failed.
    try {
      if (typeof window !== 'undefined' && window.sessionStorage.getItem(SESSION_GUARD_KEY) === '1') {
        firedRef.current = true;
        return;
      }
    } catch {
      /* sessionStorage may be disabled — fall through to ref guard. */
    }

    let cancelled = false;

    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData.session;
        if (!session?.access_token || !session.user) return;

        const planIntentRaw = (session.user.user_metadata as Record<string, unknown> | null)?.plan_intent;
        if (!isPlanIntent(planIntentRaw)) return;
        const planIntent = planIntentRaw;

        // Mark fired BEFORE the network calls so a refresh-during-redirect
        // does not double-trigger.
        firedRef.current = true;
        try {
          window.sessionStorage.setItem(SESSION_GUARD_KEY, '1');
        } catch {
          /* ignore */
        }

        if (cancelled) return;
        setRedirecting(true);

        // 1. Ensure org/workspace exist. The endpoint is idempotent — if the
        //    user already has a tenant it returns the existing IDs.
        const setupRes = await fetch('/api/onboarding/setup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ orgName: 'My Workspace' }),
        });
        if (!setupRes.ok) {
          throw new Error(`onboarding/setup failed (${setupRes.status})`);
        }
        const setupBody = (await setupRes.json().catch(() => ({}))) as {
          orgId?: string;
          org_id?: string;
          tenantId?: string;
          tenant_id?: string;
          workspaceId?: string;
          workspace_id?: string;
        };
        const orgId = setupBody.orgId ?? setupBody.org_id;
        if (!orgId) throw new Error('No org returned from onboarding/setup');

        const tenantId = setupBody.tenantId ?? setupBody.tenant_id ?? orgId;
        const workspaceId = setupBody.workspaceId ?? setupBody.workspace_id ?? '';

        // 2. Create the checkout session for the right product.
        // The landing v2 pricing page lets the visitor pick monthly or
        // annual; we stash the choice in `user_metadata.plan_interval` at
        // signup time. Default to 'month' for backward compatibility.
        const planIntervalRaw = (session.user.user_metadata as Record<string, unknown> | null)?.plan_interval;
        const planInterval: 'month' | 'year' =
          planIntervalRaw === 'year' ? 'year' : 'month';

        const isTopup = planIntent === 'topup';
        const endpoint = isTopup
          ? `/api/billing/${orgId}/topup-checkout`
          : `/api/billing/${orgId}/checkout-session`;
        const body = isTopup
          ? { pack: DEFAULT_TOPUP_PACK }
          : { plan: planIntent, interval: planInterval };

        const checkoutRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            'x-tenant-id': tenantId,
            'x-workspace-id': workspaceId,
            'x-user-id': session.user.id,
          },
          body: JSON.stringify(body),
        });
        const checkoutBody = (await checkoutRes.json().catch(() => ({}))) as {
          url?: string;
          error?: { message?: string };
        };
        if (!checkoutRes.ok || !checkoutBody.url) {
          throw new Error(checkoutBody.error?.message ?? `checkout failed (${checkoutRes.status})`);
        }

        // 3. Clear the plan_intent so a returning user (e.g. after cancelling
        //    the Stripe page and signing back in) does not get redirected
        //    again. Best-effort — failure here is non-fatal.
        try {
          await supabase.auth.updateUser({ data: { plan_intent: null } });
        } catch (clearErr) {
          // eslint-disable-next-line no-console
          console.warn('[planIntent] failed to clear plan_intent', clearErr);
        }

        if (cancelled) return;
        window.location.href = checkoutBody.url;
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error('[planIntent] redirect failed', err);
        setError(err instanceof Error ? err.message : 'Checkout redirect failed');
        setRedirecting(false);
        // Allow a manual retry by clearing the session flag.
        try {
          window.sessionStorage.removeItem(SESSION_GUARD_KEY);
        } catch {
          /* ignore */
        }
        firedRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { redirecting, error };
}
