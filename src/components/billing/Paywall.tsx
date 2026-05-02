/**
 * src/components/billing/Paywall.tsx
 *
 * Forced-choice screen rendered when the workspace has no active subscription
 * (status = 'pending_subscription' | 'trial_expired' | 'canceled' | etc.).
 *
 * Three exits:
 *   1. Activate the one-time 10-day trial (POST /api/billing/activate-trial)
 *   2. Choose a paid plan (POST /api/billing/:org/checkout-session → Stripe)
 *   3. Request a demo from sales (POST /api/billing/request-demo)
 *
 * On success of (1) or (2), the parent re-fetches /api/billing/access and
 * unmounts the paywall when canUseApp=true.
 */

import React, { useState } from 'react';
import { supabase } from '../../api/supabase';

interface PaywallProps {
  /** Snapshot returned by GET /api/billing/access. */
  reason: 'no_subscription' | 'trial_expired' | 'past_due_grace_ended' | 'canceled' | null;
  status: string;
  trialUsed: boolean;
  canActivateTrial: boolean;
  orgId: string | null;
  /** Called after a successful trial activation or paid checkout completion. */
  onAccessGranted: () => void;
  onSignOut: () => void;
}

interface Plan {
  id: 'starter' | 'growth' | 'scale';
  name: string;
  monthly: number;
  annual: number;
  credits: number;
  seats: number;
  blurb: string;
  bullets: string[];
  featured?: boolean;
}

const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    monthly: 149,
    annual: 42,
    credits: 5_000,
    seats: 3,
    blurb: 'For small teams starting with AI-assisted operations.',
    bullets: ['5,000 AI credits / month', '3 seats included', 'Email + chat channels', 'Basic reporting'],
  },
  {
    id: 'growth',
    name: 'Growth',
    monthly: 399,
    annual: 109,
    credits: 20_000,
    seats: 8,
    blurb: 'For teams using AI every day across operations.',
    bullets: ['20,000 AI credits / month', '8 seats included', 'All channels + API integrations', 'Priority support'],
    featured: true,
  },
  {
    id: 'scale',
    name: 'Scale',
    monthly: 899,
    annual: 254,
    credits: 60_000,
    seats: 20,
    blurb: 'For high-volume teams with custom workflows.',
    bullets: ['60,000 AI credits / month', '20 seats included', 'Custom workflows + SSO', 'Dedicated CSM'],
  },
];

const REASON_COPY: Record<string, { title: string; body: string }> = {
  no_subscription: {
    title: 'One last step to enter your workspace',
    body: 'Pick how you want to get started. You can try Clain free for 10 days, choose a plan, or talk to our team.',
  },
  trial_expired: {
    title: 'Your trial has ended',
    body: 'Your 10-day trial is over. Pick a plan to keep using Clain — your data is preserved.',
  },
  past_due_grace_ended: {
    title: 'Payment failed',
    body: 'We could not charge your card. Update your payment method to restore access.',
  },
  canceled: {
    title: 'Subscription canceled',
    body: 'Your subscription was canceled. Pick a plan to reactivate the workspace.',
  },
};

export default function Paywall({
  reason,
  status,
  trialUsed,
  canActivateTrial,
  orgId,
  onAccessGranted,
  onSignOut,
}: PaywallProps) {
  const [interval, setInterval] = useState<'month' | 'year'>('year');
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [trialLoading, setTrialLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);

  const copy = REASON_COPY[reason ?? 'no_subscription'] ?? REASON_COPY.no_subscription;

  const authedFetch = async (path: string, init?: RequestInit) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  };

  const handleActivateTrial = async () => {
    setError(null);
    setTrialLoading(true);
    try {
      const res = await authedFetch('/api/billing/activate-trial', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Activation failed (HTTP ${res.status})`);
      }
      onAccessGranted();
    } catch (e: any) {
      setError(e?.message || 'Could not activate trial.');
    } finally {
      setTrialLoading(false);
    }
  };

  const handlePickPlan = async (plan: Plan) => {
    if (!orgId) {
      setError('Workspace context not loaded yet. Reload the page.');
      return;
    }
    setError(null);
    setLoadingPlan(plan.id);
    try {
      const res = await authedFetch(`/api/billing/${orgId}/checkout-session`, {
        method: 'POST',
        body: JSON.stringify({ plan: plan.id, interval }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Checkout failed (HTTP ${res.status})`);
      if (body?.url) {
        window.location.href = body.url;
      } else {
        throw new Error('Checkout session URL missing');
      }
    } catch (e: any) {
      setError(e?.message || 'Could not start checkout.');
      setLoadingPlan(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-medium mb-6">
            <span className="material-symbols-outlined text-sm">lock</span>
            {status === 'trial_expired' ? 'Trial ended' : 'Subscription required'}
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold text-gray-900 dark:text-white tracking-tight">
            {copy.title}
          </h1>
          <p className="mt-3 text-base text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            {copy.body}
          </p>
          <button
            onClick={onSignOut}
            className="mt-4 text-sm text-gray-500 dark:text-gray-400 underline hover:text-gray-700 dark:hover:text-gray-200"
          >
            Sign out
          </button>
        </div>

        {/* Trial CTA */}
        {canActivateTrial && (
          <div className="mb-10 bg-white dark:bg-gray-900 border-2 border-indigo-500 rounded-2xl p-6 sm:p-8 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 justify-between">
              <div>
                <div className="inline-flex items-center gap-2 px-2.5 py-0.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-medium mb-2">
                  Recommended
                </div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Start a 10-day free trial
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Full access to Cases, Inbox, Copilot, Reporting and 1,000 AI credits. No card required.
                </p>
              </div>
              <button
                onClick={handleActivateTrial}
                disabled={trialLoading}
                className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-lg shadow-sm transition-colors"
              >
                {trialLoading ? 'Activating…' : 'Start trial →'}
              </button>
            </div>
          </div>
        )}

        {trialUsed && reason === 'trial_expired' && (
          <div className="mb-10 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-800 dark:text-amber-200">
            Your 10-day trial has been used. Pick a plan below to continue.
          </div>
        )}

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <span className={`text-sm ${interval === 'month' ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-500'}`}>Monthly</span>
          <button
            onClick={() => setInterval(interval === 'month' ? 'year' : 'month')}
            className="relative w-12 h-6 bg-gray-200 dark:bg-gray-700 rounded-full transition-colors"
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                interval === 'year' ? 'translate-x-6' : ''
              }`}
            />
          </button>
          <span className={`text-sm ${interval === 'year' ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-500'}`}>
            Annual <span className="text-emerald-600 dark:text-emerald-400">(save ~70%)</span>
          </span>
        </div>

        {/* Plans grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {PLANS.map((plan) => {
            const price = interval === 'year' ? plan.annual : plan.monthly;
            return (
              <div
                key={plan.id}
                className={`relative bg-white dark:bg-gray-900 rounded-2xl p-6 border ${
                  plan.featured
                    ? 'border-indigo-500 shadow-lg ring-1 ring-indigo-500'
                    : 'border-gray-200 dark:border-gray-800'
                }`}
              >
                {plan.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-indigo-600 text-white text-xs font-medium rounded-full">
                    Most popular
                  </div>
                )}
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{plan.name}</h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 min-h-[2.5rem]">{plan.blurb}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold text-gray-900 dark:text-white">€{price}</span>
                  <span className="text-sm text-gray-500">/ month</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {interval === 'year' ? `Billed annually (€${plan.annual * 12}/yr)` : 'Billed monthly'}
                </p>
                <button
                  onClick={() => handlePickPlan(plan)}
                  disabled={loadingPlan !== null}
                  className={`mt-5 w-full py-2.5 rounded-lg font-medium transition-colors ${
                    plan.featured
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                      : 'bg-gray-900 hover:bg-gray-800 text-white dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100'
                  } disabled:opacity-50`}
                >
                  {loadingPlan === plan.id ? 'Loading…' : `Choose ${plan.name}`}
                </button>
                <ul className="mt-5 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  {plan.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-base text-emerald-500 mt-0.5">check</span>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Demo + Business plan */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Need more? Talk to us.</h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Volume pricing, custom workflows, or a guided demo for your team.
              </p>
            </div>
            <button
              onClick={() => setDemoOpen(true)}
              className="px-5 py-2.5 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg text-sm font-medium text-gray-900 dark:text-white"
            >
              Request a demo
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-6 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 text-sm text-red-800 dark:text-red-200">
            {error}
          </div>
        )}

        {demoOpen && <DemoModal orgId={orgId} authedFetch={authedFetch} onClose={() => setDemoOpen(false)} />}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────── */

function DemoModal({
  orgId,
  authedFetch,
  onClose,
}: {
  orgId: string | null;
  authedFetch: (path: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [volume, setVolume] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/billing/request-demo', {
        method: 'POST',
        body: JSON.stringify({ name, email, company, volume, note }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Request failed');
      }
      setDone(true);
    } catch (e: any) {
      setErr(e?.message || 'Could not submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Thanks — we'll be in touch.</h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Our team will reach out within 24 hours to schedule the demo and extend your workspace access.
            </p>
            <button
              onClick={onClose}
              className="mt-5 w-full py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-medium"
            >
              Close
            </button>
          </>
        ) : (
          <form onSubmit={submit}>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Request a demo</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Tell us about your team. We'll set up a 30-min call.
            </p>
            <div className="mt-4 space-y-3">
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Work email" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
              <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
              <input value={volume} onChange={(e) => setVolume(e.target.value)} placeholder="Monthly cases / orders" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything else?" rows={3} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
            </div>
            {err && <div className="mt-3 text-sm text-red-600 dark:text-red-400">{err}</div>}
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium">Cancel</button>
              <button type="submit" disabled={submitting} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
