/* global React, ClainV2 */
/* Public paywall / upgrade page — mirrors src/components/billing/Paywall.tsx
   but adapted for unauthenticated visitors on the landing.
   Three exits:
     1. Start free trial → /signup (no plan param → trial)
     2. Pick a paid plan → /signup?plan=X&interval=Y
     3. Talk to sales    → /demo                          */
(function () {
  const { useState } = React;
  const { PageShell, navigate } = ClainV2;

  const PLANS = [
    {
      id: 'starter',
      name: 'Starter',
      original: 149, monthly: 49, annual: 42,
      meta: 'For small teams getting started with AI-assisted support.',
      bullets: [
        '5,000 AI credits / month',
        '3 seats included (€25 / extra seat)',
        'Core support workflows',
        'Email + chat integrations',
        'Basic reporting & analytics',
      ],
      cta: 'Get Starter',
    },
    {
      id: 'growth',
      name: 'Growth',
      original: 399, monthly: 129, annual: 109,
      meta: 'For teams using AI every day across support and ops.',
      bullets: [
        '20,000 AI credits / month',
        '8 seats included (€22 / extra seat)',
        'Advanced multi-step workflows',
        'Custom API integrations',
        'Priority email support',
      ],
      cta: 'Upgrade to Growth',
      featured: true,
      badge: 'Recommended',
    },
    {
      id: 'scale',
      name: 'Scale',
      original: 899, monthly: 299, annual: 254,
      meta: 'For high-volume teams with custom workflows.',
      bullets: [
        '60,000 AI credits / month',
        '20 seats included (€19 / extra seat)',
        'Unlimited custom workflows',
        'Dedicated customer success manager',
        'Custom reporting dashboards',
      ],
      cta: 'Upgrade to Scale',
    },
  ];

  function PlanCard({ plan, interval }) {
    const price = interval === 'year' ? plan.annual : plan.monthly;

    function onPick() {
      navigate(`/signup?plan=${plan.id}&interval=${interval}`);
    }

    return (
      <div className={`pw-card ${plan.featured ? 'featured' : ''}`}>
        {plan.badge && <span className="pw-badge">{plan.badge}</span>}
        <div className="pw-card-name">{plan.name}</div>

        <div className="pw-card-amount">
          <span className="pw-was">€{plan.original}</span>
          <sup>€</sup>{price}
          <span className="per">/ mo</span>
        </div>
        <div className="pw-card-billed">
          {interval === 'year'
            ? `Billed annually · €${plan.annual * 12}/yr`
            : 'Billed monthly'}
        </div>

        <div className="pw-card-meta">{plan.meta}</div>

        <ul className="pw-card-list">
          {plan.bullets.map((b, i) => (
            <li key={i} className="pw-card-li">{b}</li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onPick}
          className={`pw-btn ${plan.featured ? 'pw-btn-primary' : 'pw-btn-ghost'}`}
        >
          {plan.cta} <span className="pw-arrow">→</span>
        </button>
      </div>
    );
  }

  function PaywallPage() {
    const [interval, setInterval] = useState('year');

    return (
      <PageShell navVariant="light">
        <main style={{ background: 'var(--cream, #FAFAF7)', minHeight: '100vh' }}>
          <div className="pw-wrap">

            {/* ── Header ──────────────────────────────────────────── */}
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <span className="pw-eyebrow">Plans &amp; Pricing</span>
              <h1 className="pw-headline">
                Choose how to <span className="em">get started.</span>
              </h1>
              <p className="pw-sub">
                Try Clain free for 14 days — no card required. Or pick a plan and go live today.
              </p>
            </div>

            {/* ── Trial banner ─────────────────────────────────────── */}
            <div className="pw-trial-banner">
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div className="pw-trial-mark">Recommended · No card required</div>
                <div className="pw-trial-title">
                  Start your <span style={{ fontStyle: 'italic' }}>14-day free trial</span>
                </div>
                <div className="pw-trial-meta">
                  Full access to Inbox, Copilot, Reporting and integrations — 1,000 AI credits, real countdown.
                </div>
              </div>
              <button
                type="button"
                className="pw-btn pw-btn-primary"
                style={{ position: 'relative', zIndex: 1 }}
                onClick={() => navigate('/signup')}
              >
                Start free trial <span className="pw-arrow">→</span>
              </button>
            </div>

            {/* ── Billing toggle ───────────────────────────────────── */}
            <div className="pw-toggle-row">
              <span
                className="pw-toggle-label"
                style={{ fontWeight: interval === 'month' ? 600 : 400, opacity: interval === 'month' ? 1 : 0.5 }}
              >
                Monthly
              </span>
              <button
                type="button"
                className="pw-toggle-btn"
                data-on={String(interval === 'year')}
                onClick={() => setInterval(interval === 'month' ? 'year' : 'month')}
                aria-label="Toggle billing interval"
              >
                <span />
              </button>
              <span
                className="pw-toggle-label"
                style={{ fontWeight: interval === 'year' ? 600 : 400, opacity: interval === 'year' ? 1 : 0.5 }}
              >
                Annual <span className="pw-save-pill">20% OFF</span>
              </span>
            </div>

            {/* ── Plan cards ───────────────────────────────────────── */}
            <div className="pw-grid">
              {PLANS.map((p) => (
                <PlanCard key={p.id} plan={p} interval={interval} />
              ))}
            </div>

            {/* ── Business row ─────────────────────────────────────── */}
            <div className="pw-business">
              <div>
                <div className="pw-business-name">Business</div>
                <div className="pw-business-title">
                  Need custom volume, SSO or enterprise compliance?
                </div>
                <div className="pw-business-sub">
                  Tailored credits, seat allocation, SLA guarantees and onboarding.
                </div>
              </div>
              <button
                type="button"
                className="pw-btn pw-btn-ghost"
                onClick={() => navigate('/demo')}
              >
                Talk to sales <span className="pw-arrow">→</span>
              </button>
            </div>

            {/* ── Need setup? ──────────────────────────────────────── */}
            <div className="pw-need-setup">
              <span>Need help with onboarding, migration or technical setup?</span>
              <button
                type="button"
                onClick={() => navigate('/demo')}
                style={{ background: 'none', border: 'none', color: 'var(--fg, #0A0A0A)', fontWeight: 500, textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}
              >
                Book a setup call →
              </button>
            </div>

            {/* ── Footer note ──────────────────────────────────────── */}
            <p className="pw-foot">
              All plans include the core platform. AI credits reset monthly. Top-up packs available on all plans.<br />
              Questions? <a href="mailto:support@clain.io">support@clain.io</a>
            </p>

          </div>
        </main>
      </PageShell>
    );
  }

  window.PaywallPage = PaywallPage;
})();
