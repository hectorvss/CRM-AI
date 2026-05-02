/**
 * src/components/billing/Paywall.tsx
 *
 * Forced-choice screen rendered when the workspace has no active subscription.
 * Visually mirrors the landing-page pricing section — same card hierarchy,
 * same typography scale, same dark featured card.
 *
 * Three exits:
 *   1. Activate the one-time 10-day free trial (trial = demo: same access level)
 *   2. Choose a paid plan → Stripe Checkout
 *   3. Talk to sales (Business / custom)
 */

import React, { useState } from 'react';
import { supabase } from '../../api/supabase';

interface PaywallProps {
  reason: 'no_subscription' | 'trial_expired' | 'past_due_grace_ended' | 'canceled' | null;
  status: string;
  trialUsed: boolean;
  canActivateTrial: boolean;
  orgId: string | null;
  onAccessGranted: () => void;
  onSignOut: () => void;
}

interface Plan {
  id: 'starter' | 'growth' | 'scale';
  name: string;
  /** MSRP — always shown strikethrough. */
  original: number;
  /** Discounted monthly billing price. */
  monthly: number;
  /** Bigger discount when billed annually. */
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
    original: 149,
    monthly: 49,
    annual: 42,
    credits: 5_000,
    seats: 3,
    blurb: 'For small teams starting with AI-assisted operations.',
    bullets: [
      '5,000 AI credits / month',
      '3 seats included',
      'Email + chat channels',
      'Core workflows + reporting',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    original: 399,
    monthly: 129,
    annual: 109,
    credits: 20_000,
    seats: 8,
    blurb: 'For teams using AI every day across support and ops.',
    bullets: [
      '20,000 AI credits / month',
      '8 seats included',
      'All channels + API integrations',
      'Priority support',
    ],
    featured: true,
  },
  {
    id: 'scale',
    name: 'Scale',
    original: 899,
    monthly: 299,
    annual: 254,
    credits: 60_000,
    seats: 20,
    blurb: 'For high-volume teams with custom workflows.',
    bullets: [
      '60,000 AI credits / month',
      '20 seats included',
      'Custom workflows + SSO',
      'Dedicated customer success manager',
    ],
  },
];

const REASON_COPY: Record<string, { headline: string; sub: string }> = {
  no_subscription: {
    headline: 'Choose how to get started',
    sub: 'Try Clain free for 10 days — no card required. Or pick a plan and go.',
  },
  trial_expired: {
    headline: 'Your 10-day trial has ended',
    sub: 'Your data is preserved. Pick a plan to keep using Clain.',
  },
  past_due_grace_ended: {
    headline: 'Payment failed',
    sub: 'We could not process your last payment. Update your card to restore access.',
  },
  canceled: {
    headline: 'Subscription canceled',
    sub: 'Pick a plan to reactivate your workspace. Your data is safe.',
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
        throw new Error(body?.error || `Could not activate trial (HTTP ${res.status})`);
      }
      onAccessGranted();
    } catch (e: any) {
      setError(e?.message || 'Could not start your trial. Try again or contact support.');
    } finally {
      setTrialLoading(false);
    }
  };

  const handlePickPlan = async (plan: Plan) => {
    if (!orgId) {
      setError('Workspace not loaded. Reload the page and try again.');
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
      if (!res.ok) throw new Error(body?.error || `Checkout error (HTTP ${res.status})`);
      if (body?.url) window.location.href = body.url;
      else throw new Error('Checkout session URL missing');
    } catch (e: any) {
      setError(e?.message || 'Could not start checkout. Try again.');
      setLoadingPlan(null);
    }
  };

  const handleTalkToSales = () => {
    window.open('mailto:sales@clain.io?subject=Clain Business enquiry', '_blank');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F8F8F6',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '64px 24px 80px',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
      }}
    >
      <div style={{ width: '100%', maxWidth: 1080 }}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 12px', borderRadius: 999,
            background: '#fff', border: '1px solid #E5E5E0',
            fontSize: 11, fontWeight: 600, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: '#6B6B6B',
            marginBottom: 20,
          }}>
            {status === 'trial_expired' ? '⏱ Trial ended' : '✦ Clain'}
          </div>
          <h1 style={{
            fontSize: 'clamp(28px, 5vw, 42px)',
            fontWeight: 600,
            letterSpacing: '-0.025em',
            color: '#0A0A0A',
            lineHeight: 1.15,
            margin: '0 0 14px',
          }}>
            {copy.headline}
          </h1>
          <p style={{
            fontSize: 16,
            color: '#6B6B6B',
            lineHeight: 1.6,
            maxWidth: 520,
            margin: '0 auto 20px',
          }}>
            {copy.sub}
          </p>
          <button
            onClick={onSignOut}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, color: '#A3A3A0', textDecoration: 'underline',
              textDecorationColor: 'transparent',
            }}
            onMouseEnter={e => (e.currentTarget.style.textDecorationColor = '#A3A3A0')}
            onMouseLeave={e => (e.currentTarget.style.textDecorationColor = 'transparent')}
          >
            Sign out
          </button>
        </div>

        {/* ── Free trial banner (shown when trial is available) ────────── */}
        {canActivateTrial && (
          <div style={{
            background: '#fff',
            border: '1.5px solid #0A0A0A',
            borderRadius: 16,
            padding: '28px 36px',
            marginBottom: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 24,
            flexWrap: 'wrap',
          }}>
            <div>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: '#6B6B6B', marginBottom: 8,
                fontFamily: 'inherit',
              }}>
                Recommended · No card required
              </div>
              <div style={{
                fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em',
                color: '#0A0A0A', marginBottom: 4,
              }}>
                Start your 10-day free trial
              </div>
              <div style={{ fontSize: 14, color: '#6B6B6B' }}>
                Full access to Cases, Inbox, Copilot and Reporting — 1,000 AI credits included.
              </div>
            </div>
            <button
              onClick={handleActivateTrial}
              disabled={trialLoading}
              style={{
                background: '#0A0A0A',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                padding: '13px 28px',
                fontSize: 15,
                fontWeight: 600,
                cursor: trialLoading ? 'not-allowed' : 'pointer',
                opacity: trialLoading ? 0.6 : 1,
                transition: 'transform 0.15s',
                whiteSpace: 'nowrap',
                letterSpacing: '-0.01em',
              }}
              onMouseEnter={e => { if (!trialLoading) e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              {trialLoading ? 'Starting trial…' : 'Start trial →'}
            </button>
          </div>
        )}

        {trialUsed && reason === 'trial_expired' && (
          <div style={{
            background: '#FFFBEB', border: '1px solid #FDE68A',
            borderRadius: 12, padding: '12px 20px',
            fontSize: 13, color: '#92400E', marginBottom: 36,
          }}>
            Your 10-day trial has been used. Choose a plan below to continue — your data is preserved.
          </div>
        )}

        {/* ── Billing interval toggle ──────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 32 }}>
          <span style={{
            fontSize: 13, fontWeight: interval === 'month' ? 600 : 400,
            opacity: interval === 'month' ? 1 : 0.45, color: '#0A0A0A', transition: 'opacity .15s',
          }}>
            Monthly
          </span>
          <button
            onClick={() => setInterval(interval === 'month' ? 'year' : 'month')}
            style={{
              position: 'relative', width: 44, height: 24, borderRadius: 999,
              background: interval === 'year' ? '#0A0A0A' : '#D1D5DB',
              border: 'none', cursor: 'pointer', transition: 'background .2s', flexShrink: 0,
            }}
          >
            <span style={{
              position: 'absolute', top: 3, left: interval === 'year' ? 23 : 3,
              width: 18, height: 18, borderRadius: '50%', background: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,.25)', transition: 'left .2s',
              display: 'block',
            }} />
          </button>
          <span style={{
            fontSize: 13, fontWeight: interval === 'year' ? 600 : 400,
            opacity: interval === 'year' ? 1 : 0.45, color: '#0A0A0A', transition: 'opacity .15s',
          }}>
            Annual <span style={{ color: '#16a34a', fontSize: 10, fontWeight: 700, background: '#dcfce7', padding: '2px 6px', borderRadius: 4, letterSpacing: '0.02em', marginLeft: 4 }}>15% OFF</span>
          </span>
        </div>

        {/* ── Pricing cards ────────────────────────────────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
        }}>
          {PLANS.map((plan) => {
            const price = interval === 'year' ? plan.annual : plan.monthly;
            const isFeatured = plan.featured;
            const isLoading = loadingPlan === plan.id;

            return (
              <div
                key={plan.id}
                style={{
                  background: isFeatured ? '#0A0A0A' : '#fff',
                  color: isFeatured ? '#F8F8F6' : '#0A0A0A',
                  border: `1.5px solid ${isFeatured ? '#0A0A0A' : '#E5E5E0'}`,
                  borderRadius: 16,
                  padding: 28,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0,
                  position: 'relative',
                  transition: 'transform 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                {/* Badge */}
                {isFeatured && (
                  <div style={{
                    position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
                    background: '#fff', color: '#0A0A0A',
                    border: '1.5px solid #0A0A0A',
                    borderRadius: 999,
                    padding: '4px 14px',
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                    textTransform: 'uppercase', whiteSpace: 'nowrap',
                  }}>
                    Recommended
                  </div>
                )}

                {/* Plan name */}
                <div style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: isFeatured ? 'rgba(255,255,255,0.55)' : '#6B6B6B',
                  marginBottom: 18,
                }}>
                  {plan.name}
                </div>

                {/* Price — strikethrough MSRP always shown */}
                <div style={{
                  fontSize: 48, fontWeight: 400, letterSpacing: '-0.025em',
                  lineHeight: 1, display: 'flex', alignItems: 'baseline', gap: 6,
                  marginBottom: 6, flexWrap: 'wrap',
                }}>
                  <span style={{
                    fontSize: 18,
                    color: isFeatured ? 'rgba(255,255,255,0.4)' : '#A3A3A0',
                    textDecoration: 'line-through',
                    fontWeight: 400,
                    marginRight: 2,
                  }}>€{plan.original}</span>
                  <sup style={{ fontSize: 18, opacity: 0.6, verticalAlign: 'top', marginTop: 6 }}>€</sup>
                  <span>{price}</span>
                  <span style={{
                    fontSize: 13, fontWeight: 400,
                    color: isFeatured ? 'rgba(255,255,255,0.5)' : '#A3A3A0',
                    letterSpacing: 0, marginLeft: 2,
                  }}>/ mo</span>
                </div>

                {/* Billed note */}
                <div style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: isFeatured ? 'rgba(255,255,255,0.35)' : '#A3A3A0',
                  marginBottom: 14,
                }}>
                  {interval === 'year' ? `Billed annually · €${plan.annual * 12}/yr` : 'Billed monthly'}
                </div>

                {/* Blurb */}
                <div style={{
                  fontSize: 13,
                  color: isFeatured ? 'rgba(255,255,255,0.6)' : '#6B6B6B',
                  lineHeight: 1.5,
                  marginBottom: 20,
                }}>
                  {plan.blurb}
                </div>

                {/* CTA */}
                <button
                  onClick={() => handlePickPlan(plan)}
                  disabled={loadingPlan !== null}
                  style={{
                    background: isFeatured ? '#F8F8F6' : '#0A0A0A',
                    color: isFeatured ? '#0A0A0A' : '#F8F8F6',
                    border: 'none',
                    borderRadius: 10,
                    padding: '11px 0',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: loadingPlan !== null ? 'not-allowed' : 'pointer',
                    opacity: loadingPlan !== null ? 0.6 : 1,
                    width: '100%',
                    letterSpacing: '-0.01em',
                    transition: 'transform 0.12s',
                    marginBottom: 20,
                  }}
                  onMouseEnter={e => { if (!loadingPlan) e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  {isLoading ? 'Loading…' : `Get started →`}
                </button>

                {/* Feature list */}
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
                  {plan.bullets.map((b, i) => (
                    <li key={i} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      fontSize: 13,
                      color: isFeatured ? 'rgba(255,255,255,0.75)' : '#3A3A3A',
                      paddingTop: i > 0 ? 10 : 0,
                      borderTop: i > 0 ? `1px solid ${isFeatured ? 'rgba(255,255,255,0.1)' : '#F0F0EC'}` : 'none',
                    }}>
                      <span style={{
                        color: isFeatured ? 'rgba(255,255,255,0.5)' : '#6B6B6B',
                        fontSize: 13, flexShrink: 0, marginTop: 1,
                      }}>✓</span>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* ── Responsive grid fix (stacks on small screens) */}
        <style>{`
          @media (max-width: 900px) {
            .paywall-grid { grid-template-columns: 1fr !important; }
          }
          @media (max-width: 680px) {
            .paywall-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>

        {/* ── Business / custom row ────────────────────────────────────── */}
        <div style={{
          marginTop: 20,
          background: '#fff',
          border: '1.5px solid #E5E5E0',
          borderRadius: 16,
          padding: '24px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 20,
          flexWrap: 'wrap',
        }}>
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: '#A3A3A0', marginBottom: 6,
            }}>Business</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#0A0A0A', marginBottom: 4 }}>
              Need custom volume, SSO or enterprise compliance?
            </div>
            <div style={{ fontSize: 13, color: '#6B6B6B' }}>
              Tailored credits, seat allocation, SLA guarantees and onboarding.
            </div>
          </div>
          <button
            onClick={handleTalkToSales}
            style={{
              background: 'transparent',
              border: '1.5px solid #0A0A0A',
              borderRadius: 10,
              padding: '11px 24px',
              fontSize: 14,
              fontWeight: 600,
              color: '#0A0A0A',
              cursor: 'pointer',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
              letterSpacing: '-0.01em',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#0A0A0A';
              e.currentTarget.style.color = '#F8F8F6';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#0A0A0A';
            }}
          >
            Talk to sales →
          </button>
        </div>

        {/* ── Error message ────────────────────────────────────────────── */}
        {error && (
          <div style={{
            marginTop: 24,
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: 12,
            padding: '14px 20px',
            fontSize: 13,
            color: '#B91C1C',
          }}>
            {error}
          </div>
        )}

        {/* ── Footer note ──────────────────────────────────────────────── */}
        <p style={{
          textAlign: 'center',
          fontSize: 12,
          color: '#A3A3A0',
          marginTop: 40,
          lineHeight: 1.7,
        }}>
          All plans include the core platform. AI credits reset monthly. Top-up packs available on all plans.<br />
          Questions? <a href="mailto:support@clain.io" style={{ color: '#6B6B6B', textDecoration: 'underline' }}>support@clain.io</a>
        </p>

      </div>
    </div>
  );
}
