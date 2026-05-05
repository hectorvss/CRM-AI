/* global React, ClainV2 */
/*
 * Compare every plan, side-by-side.
 * Reuses the visual primitives of /pricing (FONT, COLOR_TEXT, BORDER_CLAY,
 * Bullet, CornerDots, savePercent helper, plan card layout). Built so that
 * "View all features" / "Buy credit packs" / "Manage seats" anywhere on the
 * site lands here in the right anchor.
 */
(function () {
  const { useState } = React;
  const { PageShell } = ClainV2;

  const FONT = "'Inter', sans-serif";
  const COLOR_TEXT = '#111';
  const COLOR_TEXT_60 = 'rgba(17,17,17,0.6)';
  const COLOR_TEXT_80 = 'rgba(17,17,17,0.8)';
  const BORDER_CLAY = '#d3cec6';
  const BG_OFF_WHITE = '#faf9f6';
  const BG_OFF_WHITE_2 = '#f5f1ea';
  const ACCENT_BLUE = '#0007cb';
  const ACCENT_GREEN = '#11643d';
  const BG_GREEN = '#dff0e3';

  function CornerDots({ color }) {
    const dotColor = color || ACCENT_BLUE;
    return (
      <div className="absolute inset-[16px] pointer-events-none">
        <div className="absolute left-0 top-0 size-[8px]" style={{ background: dotColor }} />
        <div className="absolute right-0 top-0 size-[8px]" style={{ background: dotColor }} />
        <div className="absolute left-0 bottom-0 size-[8px]" style={{ background: dotColor }} />
        <div className="absolute right-0 bottom-0 size-[8px]" style={{ background: dotColor }} />
      </div>
    );
  }

  function Bullet({ children }) {
    return (
      <li className="flex gap-[10px] items-start">
        <span className="size-[4px] mt-[8px] shrink-0" style={{ background: 'rgba(17,17,17,0.3)' }} />
        <span className="text-[13px] leading-[19.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT }}>{children}</span>
      </li>
    );
  }

  function savePercent(originalStr, currentStr) {
    const a = parseFloat(String(originalStr).replace(/[^0-9.]/g, ''));
    const b = parseFloat(String(currentStr).replace(/[^0-9.]/g, ''));
    if (!a || !b || b >= a) return 0;
    return Math.round((1 - b / a) * 100);
  }

  /* ── Plan summary data — mirrors /pricing exactly ─────────────────── */
  const PLAN_SUMMARY = [
    { key: 'starter',  name: 'Starter',  originalPrice: '€149', priceAnnual: '€42',  priceMonthly: '€49',  cta: 'Upgrade to Starter', ctaTo: '/signup', tagline: 'For individuals, startups, and small teams' },
    { key: 'growth',   name: 'Growth',   originalPrice: '€399', priceAnnual: '€109', priceMonthly: '€129', cta: 'Upgrade to Growth',  ctaTo: '/signup', tagline: 'For growing support and ops teams' },
    { key: 'scale',    name: 'Scale',    originalPrice: '€899', priceAnnual: '€254', priceMonthly: '€299', cta: 'Upgrade to Scale',   ctaTo: '/signup', tagline: 'For high-volume, multi-workflow teams' },
    { key: 'business', name: 'Business', originalPrice: null,   priceAnnual: 'Custom', priceMonthly: 'Custom', cta: 'Talk to sales', ctaTo: '/demo', tagline: 'Custom capacity, governance, and security' },
  ];

  /* ── Feature comparison matrix ─────────────────────────────────────
     rows are { label, values: [starter, growth, scale, business] } where
     each value is either:
       - boolean true  → show check
       - boolean false → show "—"
       - string         → show literally
  */
  const FEATURE_GROUPS = [
    {
      title: 'Capacity',
      rows: [
        { label: 'AI credits / month (workspace total)', values: ['5,000', '20,000', '60,000', 'Custom'] },
        { label: 'Seats included',                        values: ['3', '8', '20', 'Custom'] },
        { label: 'Extra seat price',                      values: ['€25 / mo', '€22 / mo', '€19 / mo', 'Custom'] },
        { label: 'Lite collaborator seats (read-only)',   values: ['Unlimited', 'Unlimited', 'Unlimited', 'Unlimited'] },
        { label: 'Top-up credit packs',                   values: [true, true, true, true] },
      ],
    },
    {
      title: 'Clain AI Agent',
      rows: [
        { label: 'Autonomous AI Agent (resolves end-to-end)',  values: [true, true, true, true] },
        { label: 'Multi-step reasoning & workflows',           values: [false, true, true, true] },
        { label: 'Conversation summaries & response drafts',   values: [true, true, true, true] },
        { label: 'AI tagging & classification',                values: [true, true, true, true] },
        { label: 'Custom procedures (deterministic actions)',  values: [false, true, true, true] },
        { label: 'Audience testing & simulations',             values: [false, true, true, true] },
        { label: 'Reporting + AI Insights',                    values: [false, true, true, true] },
        { label: 'CX Score (AI-graded support quality)',       values: [false, true, true, true] },
      ],
    },
    {
      title: 'Models',
      rows: [
        { label: 'Fast tier (GPT-4o mini, Haiku, Flash)',      values: [true, true, true, true] },
        { label: 'Frontier tier (GPT-4o, Sonnet, Pro)',        values: [false, true, true, true] },
        { label: 'Custom fine-tuned models',                   values: [false, false, true, true] },
        { label: 'Bring Your Own Model (BYOM)',                values: [false, false, false, true] },
      ],
    },
    {
      title: 'Inbox & helpdesk',
      rows: [
        { label: 'Inbox with shared views',                    values: [true, true, true, true] },
        { label: 'Knowledge Hub',                              values: [true, true, true, true] },
        { label: 'Tickets & SLA monitoring',                   values: [false, true, true, true] },
        { label: 'Workflow automation builder',                values: [false, true, true, true] },
        { label: 'Round-robin assignment',                     values: [false, true, true, true] },
        { label: 'Multibrand Help Center',                     values: [false, false, true, true] },
        { label: 'Custom branded portal',                      values: [false, false, true, true] },
      ],
    },
    {
      title: 'Channels & integrations',
      rows: [
        { label: 'Live chat, email, in-app — unlimited',       values: [true, true, true, true] },
        { label: 'WhatsApp, SMS, Discord',                     values: [true, true, true, true] },
        { label: 'Phone (voice agent)',                        values: [false, true, true, true] },
        { label: 'Slack as a channel',                         values: [false, true, true, true] },
        { label: 'Standard integrations (Zendesk, HubSpot, …)', values: [true, true, true, true] },
        { label: 'Custom API integrations',                    values: [false, true, true, true] },
      ],
    },
    {
      title: 'Security & compliance',
      rows: [
        { label: 'SOC 2 Type II',                              values: [true, true, true, true] },
        { label: 'ISO 27001',                                  values: [true, true, true, true] },
        { label: 'GDPR / CCPA',                                values: [true, true, true, true] },
        { label: 'SSO (Okta, Azure AD, OneLogin)',             values: [false, false, true, true] },
        { label: '2FA, SCIM, IP restrictions',                 values: [false, false, true, true] },
        { label: 'HIPAA / ISO 42001 / ISO 27701 / AIUC-1',     values: [false, false, true, true] },
        { label: 'Custom DPA, MSA, security review',           values: [false, false, false, true] },
        { label: 'Dedicated tenant / region pinning',          values: [false, false, false, true] },
      ],
    },
    {
      title: 'Support',
      rows: [
        { label: 'Self-serve docs, community, in-app chat',    values: [true, true, true, true] },
        { label: 'Priority email support',                     values: [false, true, true, true] },
        { label: 'Service Level Agreements (SLAs)',            values: [false, false, true, true] },
        { label: 'Dedicated success manager',                  values: [false, false, true, true] },
        { label: 'Tailored onboarding & training',             values: [false, false, false, true] },
        { label: 'Custom uptime guarantees',                   values: [false, false, false, true] },
      ],
    },
  ];

  /* ── Buy-credits packs (mirrors SaaS CreditsTab) ──────────────────── */
  const CREDIT_PACKS = [
    { credits: '5,000',  price: '€79',  popular: false, models: 'Fast tier — GPT-4o mini, Haiku, Flash',           compute: 'Up to ~5M tokens · ~10k automated tasks' },
    { credits: '20,000', price: '€249', popular: true,  models: 'Frontier tier — GPT-4o, Claude 3.5 Sonnet, Gemini Pro', compute: 'Up to ~20M tokens · ~40k automated tasks' },
    { credits: '50,000', price: '€549', popular: false, models: 'All models + Custom fine-tuned',                 compute: 'Up to ~50M tokens · ~100k automated tasks' },
  ];

  /* ── Seat add-on rows ─────────────────────────────────────────────── */
  const SEAT_ROWS = [
    { plan: 'Starter',  included: '3 seats',  extra: '€25 / extra seat / mo' },
    { plan: 'Growth',   included: '8 seats',  extra: '€22 / extra seat / mo' },
    { plan: 'Scale',    included: '20 seats', extra: '€19 / extra seat / mo' },
    { plan: 'Business', included: 'Custom',   extra: 'Negotiated by contract' },
  ];

  /* ── FAQs (subset relevant to this page) ──────────────────────────── */
  const FAQS = [
    { q: 'Are AI credits per seat or per workspace?',
      a: 'Per workspace — every team member shares the same monthly allowance. Adding a seat does not add credits. To extend your allowance, buy a credit pack which is consumed only after your monthly included credits are used.' },
    { q: 'What counts as one AI credit?',
      a: 'One credit covers one unit of AI work — for example a tagged conversation, a generated summary, a response recommendation, or a multi-step reasoning task. Heavier tasks (long context, frontier-tier models) consume more.' },
    { q: 'Can I switch plans or seats anytime?',
      a: 'Yes. Plans and seats are self-serve from Billing → Subscription. Billing prorates automatically. Annual contracts unlock the discounted pricing shown.' },
    { q: 'Do unused credits roll over?',
      a: 'Included monthly credits reset at the end of each cycle. Top-up credits do not — they remain available as long as your subscription is active.' },
    { q: 'Is there a free trial?',
      a: '14-day free trial, full access, no card required. Start any plan from /signup.' },
    { q: 'I am an early-stage startup — is there a discount?',
      a: 'Yes — early-stage companies (under 2 years old, under $5M raised) get 50% off year one through the Clain Early Stage Program. See the dedicated page below.' },
  ];

  /* ── Components ───────────────────────────────────────────────────── */

  function Cell({ value }) {
    if (value === true) {
      return (
        <div className="flex items-center justify-center" style={{ height: 24 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8.5L6.5 12L13 4.5" stroke={COLOR_TEXT} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      );
    }
    if (value === false || value == null) {
      return (
        <div className="flex items-center justify-center" style={{ height: 24, color: COLOR_TEXT_60 }}>
          <span style={{ fontFamily: FONT, fontSize: 14 }}>—</span>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center text-center" style={{ height: 24 }}>
        <span className="text-[13px] leading-[18px]" style={{ fontFamily: FONT, color: COLOR_TEXT }}>{value}</span>
      </div>
    );
  }

  function PlanSummaryHeader({ plan, isAnnual }) {
    const price = isAnnual ? plan.priceAnnual : plan.priceMonthly;
    return (
      <div className="flex flex-col gap-[6px] px-[16px] py-[20px]">
        <span className="text-[14px] leading-[20px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 600 }}>{plan.name}</span>
        <span className="text-[12px] leading-[16px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60 }}>{plan.tagline}</span>
        <div className="mt-[4px]">
          {plan.originalPrice && price !== 'Custom' && (
            <span className="text-[11px] leading-[14px] mr-[6px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60, textDecoration: 'line-through' }}>{plan.originalPrice}</span>
          )}
          <span className="text-[20px] leading-[24px] tracking-[-0.4px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 700 }}>{price}</span>
          {price !== 'Custom' && (
            <span className="text-[11px] leading-[14px] ml-[2px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60 }}> /team/mo</span>
          )}
        </div>
        <button
          onClick={() => ClainV2.navigate(plan.ctaTo)}
          className="mt-[8px] cursor-pointer rounded-[8px] h-[36px] w-full px-[12px] flex items-center justify-center text-[12px] leading-[16px] border-0 transition-opacity hover:opacity-90"
          style={{ fontFamily: FONT, background: COLOR_TEXT, color: 'white', fontWeight: 600 }}
        >
          {plan.cta}
        </button>
      </div>
    );
  }

  function FAQItem({ q, a, isOpen, onToggle }) {
    return (
      <div className="border-t" style={{ borderColor: BORDER_CLAY }}>
        <button onClick={onToggle} className="w-full flex items-center justify-between gap-4 py-[18px] bg-transparent border-0 cursor-pointer text-left">
          <span className="text-[15px] leading-[22px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 500 }}>{q}</span>
          <svg className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} width="12" height="8" viewBox="0 0 12 8" fill="none">
            <path d="M1 1.5L6 6.5L11 1.5" stroke={COLOR_TEXT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {isOpen && (
          <div className="pb-[18px]">
            <p className="m-0 text-[13px] leading-[19.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60 }}>{a}</p>
          </div>
        )}
      </div>
    );
  }

  /* ── Page ─────────────────────────────────────────────────────────── */

  function AllFeaturesPage() {
    const [isAnnual, setIsAnnual]   = useState(true);
    const [openFaq, setOpenFaq]     = useState(0);

    return (
      <PageShell>
        {/* Section 1 — Hero */}
        <div className="relative w-full bg-white">
          <div className="max-w-[1440px] mx-auto px-[16px] pt-[128px] pb-[40px] relative">
            <CornerDots />
            <div className="max-w-[1170px] mx-auto px-[16px]">
              <p className="m-0 text-[10px] uppercase tracking-[0.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60 }}>Pricing · All features</p>
              <h1 className="m-0 mt-[16px] text-[50px] leading-[54px] tracking-[-1.6px] max-w-[896px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 400 }}>
                Compare every plan, side&nbsp;by&nbsp;side
              </h1>
              <p className="m-0 mt-[16px] max-w-[640px] text-[15px] leading-[22px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60 }}>
                Every plan includes the full helpdesk and the autonomous AI Agent. What changes is AI capacity, seat capacity, models, integrations, and security depth. Toggle billing below; everything updates in place.
              </p>

              {/* Toggle */}
              <div className="mt-[40px] inline-flex items-center gap-[10px] px-[6px] py-[6px] bg-white" style={{ border: '1px solid #dedbd6' }}>
                <button onClick={() => setIsAnnual(true)}  className="cursor-pointer border-0 px-[12px] py-[6px] text-[13px] leading-[19.6px] rounded-[4px]" style={{ fontFamily: FONT, color: COLOR_TEXT, background: isAnnual ? '#e7e3db' : 'transparent', fontWeight: isAnnual ? 600 : 400 }}>Billed annually</button>
                <button onClick={() => setIsAnnual(false)} className="cursor-pointer border-0 px-[12px] py-[6px] text-[13px] leading-[19.6px] rounded-[4px]" style={{ fontFamily: FONT, color: COLOR_TEXT, background: !isAnnual ? '#e7e3db' : 'transparent', fontWeight: !isAnnual ? 600 : 400 }}>Billed monthly</button>
              </div>

              {/* Section 2 — Comparison table */}
              <div className="mt-[40px]" style={{ border: `1px solid ${BORDER_CLAY}` }}>
                {/* Table header — sticky 4-plan summary */}
                <div className="grid sticky top-0 z-10" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', background: BG_OFF_WHITE, borderBottom: `1px solid ${BORDER_CLAY}` }}>
                  <div className="px-[24px] py-[20px] flex items-end">
                    <span className="text-[12px] leading-[16px] uppercase tracking-[0.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60, fontWeight: 600 }}>Features</span>
                  </div>
                  {PLAN_SUMMARY.map((p, i) => (
                    <div key={p.key} style={{ borderLeft: `1px solid ${BORDER_CLAY}` }}>
                      <PlanSummaryHeader plan={p} isAnnual={isAnnual} />
                    </div>
                  ))}
                </div>

                {/* Table body — group by category */}
                {FEATURE_GROUPS.map((group, gi) => (
                  <div key={group.title}>
                    <div className="px-[24px] py-[12px]" style={{ background: BG_OFF_WHITE_2, borderBottom: `1px solid ${BORDER_CLAY}`, borderTop: gi > 0 ? `1px solid ${BORDER_CLAY}` : 'none' }}>
                      <span className="text-[11px] uppercase tracking-[0.8px] leading-[14px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 700 }}>{group.title}</span>
                    </div>
                    {group.rows.map((row, ri) => (
                      <div key={ri} className="grid items-center" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', borderBottom: ri < group.rows.length - 1 ? `1px solid ${BORDER_CLAY}` : 'none' }}>
                        <div className="px-[24px] py-[14px]">
                          <span className="text-[13px] leading-[18px]" style={{ fontFamily: FONT, color: COLOR_TEXT }}>{row.label}</span>
                        </div>
                        {row.values.map((v, vi) => (
                          <div key={vi} className="px-[12px] py-[14px]" style={{ borderLeft: `1px solid ${BORDER_CLAY}` }}>
                            <Cell value={v} />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}

                {/* Footer CTAs row */}
                <div className="grid" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', borderTop: `1px solid ${BORDER_CLAY}`, background: BG_OFF_WHITE }}>
                  <div className="px-[24px] py-[20px]">
                    <span className="text-[13px] leading-[18px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60 }}>14-day free trial on every plan. No card required.</span>
                  </div>
                  {PLAN_SUMMARY.map((p, i) => (
                    <div key={p.key} className="px-[12px] py-[16px]" style={{ borderLeft: `1px solid ${BORDER_CLAY}` }}>
                      <button
                        onClick={() => ClainV2.navigate(p.ctaTo)}
                        className="cursor-pointer rounded-[8px] h-[36px] w-full px-[8px] flex items-center justify-center text-[12px] leading-[16px] border-0 transition-opacity hover:opacity-90"
                        style={{ fontFamily: FONT, background: COLOR_TEXT, color: 'white', fontWeight: 600 }}
                      >
                        {p.cta}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Section 3 — AI Credit Packs (anchor target #credits) */}
        <div id="credits" className="relative w-full" style={{ background: BG_OFF_WHITE, scrollMarginTop: 80 }}>
          <div className="max-w-[1440px] mx-auto px-[16px] pt-[80px] pb-[80px] relative">
            <CornerDots color="rgba(17,17,17,0.1)" />
            <div className="max-w-[1170px] mx-auto px-[16px]">
              <p className="m-0 text-[10px] uppercase tracking-[0.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60 }}>Buy more capacity</p>
              <h2 className="m-0 mt-[16px] text-[44px] leading-[48px] tracking-[-1.4px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 400 }}>AI credit packs</h2>
              <p className="m-0 mt-[16px] max-w-[640px] text-[15px] leading-[22px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60 }}>
                Top-up packs are available to any plan and are consumed only after your monthly included credits are used. They remain available as long as your subscription is active. Credits are workspace-wide — adding seats does not add credits.
              </p>

              <div className="grid grid-cols-3 gap-[16px] mt-[32px]" style={{ border: `1px solid ${BORDER_CLAY}` }}>
                {CREDIT_PACKS.map((pack, i) => (
                  <div key={pack.credits} className="flex flex-col p-[24px] relative" style={{ borderLeft: i > 0 ? `1px solid ${BORDER_CLAY}` : 'none', background: pack.popular ? '#fffaf3' : 'white' }}>
                    {pack.popular && (
                      <span className="absolute top-[12px] right-[12px] text-[10px] leading-[14px] uppercase tracking-[0.6px] px-[8px] py-[2px] rounded-[3px]" style={{ fontFamily: FONT, color: ACCENT_GREEN, background: BG_GREEN, fontWeight: 600 }}>Popular</span>
                    )}
                    <span className="text-[12px] leading-[16px] uppercase tracking-[0.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60, fontWeight: 600 }}>One-off pack</span>
                    <div className="mt-[12px] flex items-baseline gap-[6px]">
                      <span className="text-[36px] leading-[40px] tracking-[-0.8px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 700 }}>{pack.credits}</span>
                      <span className="text-[13px] leading-[18px]" style={{ fontFamily: FONT, color: COLOR_TEXT_80 }}>credits</span>
                    </div>
                    <div className="mt-[6px] flex items-baseline gap-[4px]">
                      <span className="text-[28px] leading-[32px] tracking-[-0.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 600 }}>{pack.price}</span>
                      <span className="text-[12px] leading-[16px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60 }}>one-off</span>
                    </div>
                    <p className="m-0 mt-[16px] text-[13px] leading-[19px]" style={{ fontFamily: FONT, color: COLOR_TEXT_80 }}>{pack.compute}</p>
                    <p className="m-0 mt-[4px] text-[12px] leading-[16px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60 }}>{pack.models}</p>
                    <button onClick={() => ClainV2.navigate('/signup')} className="mt-[20px] cursor-pointer rounded-[8px] h-[40px] w-full px-[16px] flex items-center justify-center text-[13px] leading-[20px] border-0 transition-opacity hover:opacity-90" style={{ fontFamily: FONT, background: COLOR_TEXT, color: 'white', fontWeight: 600 }}>Buy {pack.credits} credits</button>
                  </div>
                ))}
              </div>

              <div className="mt-[24px] flex items-start gap-[12px] p-[16px] rounded-[8px]" style={{ background: BG_OFF_WHITE_2 }}>
                <svg className="shrink-0 mt-[2px]" width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7" stroke={COLOR_TEXT_60} strokeWidth="1.2" />
                  <circle cx="8" cy="5" r="0.8" fill={COLOR_TEXT_60} />
                  <path d="M8 7v4.5" stroke={COLOR_TEXT_60} strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <p className="m-0 text-[13px] leading-[19px]" style={{ fontFamily: FONT, color: COLOR_TEXT_80 }}>
                  Heavier tasks (long context, frontier-tier models) consume more credits per call. Track usage live in <a onClick={(e) => { e.preventDefault(); ClainV2.navigate('/upgrade'); }} href="#" className="underline cursor-pointer" style={{ color: COLOR_TEXT }}>Billing → Credits</a>.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Section 4 — Seats (anchor #seats) */}
        <div id="seats" className="relative w-full bg-white" style={{ scrollMarginTop: 80 }}>
          <div className="max-w-[1440px] mx-auto px-[16px] pt-[80px] pb-[80px] relative">
            <CornerDots color="rgba(17,17,17,0.1)" />
            <div className="max-w-[1170px] mx-auto px-[16px]">
              <p className="m-0 text-[10px] uppercase tracking-[0.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60 }}>Grow your team</p>
              <h2 className="m-0 mt-[16px] text-[44px] leading-[48px] tracking-[-1.4px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 400 }}>Seats &amp; team scaling</h2>
              <p className="m-0 mt-[16px] max-w-[640px] text-[15px] leading-[22px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60 }}>
                Each plan ships with a base number of seats. You can add more anytime — billing prorates automatically. Lite collaborator seats (read-only) are unlimited and free on every plan. <strong style={{ color: COLOR_TEXT, fontWeight: 600 }}>Adding a seat does not change your AI credits allowance</strong> — credits remain a workspace-wide pool that any teammate can spend.
              </p>

              <div className="mt-[32px]" style={{ border: `1px solid ${BORDER_CLAY}` }}>
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', background: BG_OFF_WHITE, borderBottom: `1px solid ${BORDER_CLAY}` }}>
                  <div className="px-[24px] py-[14px] text-[12px] leading-[16px] uppercase tracking-[0.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60, fontWeight: 600 }}>Plan</div>
                  <div className="px-[24px] py-[14px] text-[12px] leading-[16px] uppercase tracking-[0.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60, fontWeight: 600, borderLeft: `1px solid ${BORDER_CLAY}` }}>Seats included</div>
                  <div className="px-[24px] py-[14px] text-[12px] leading-[16px] uppercase tracking-[0.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60, fontWeight: 600, borderLeft: `1px solid ${BORDER_CLAY}` }}>Extra seat price</div>
                </div>
                {SEAT_ROWS.map((row, i) => (
                  <div key={row.plan} className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', borderBottom: i < SEAT_ROWS.length - 1 ? `1px solid ${BORDER_CLAY}` : 'none' }}>
                    <div className="px-[24px] py-[16px] text-[14px] leading-[20px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 600 }}>{row.plan}</div>
                    <div className="px-[24px] py-[16px] text-[14px] leading-[20px]" style={{ fontFamily: FONT, color: COLOR_TEXT, borderLeft: `1px solid ${BORDER_CLAY}` }}>{row.included}</div>
                    <div className="px-[24px] py-[16px] text-[14px] leading-[20px]" style={{ fontFamily: FONT, color: COLOR_TEXT, borderLeft: `1px solid ${BORDER_CLAY}` }}>{row.extra}</div>
                  </div>
                ))}
              </div>

              <div className="mt-[24px] flex gap-[12px]">
                <button onClick={() => ClainV2.navigate('/signup')} className="cursor-pointer rounded-[8px] h-[44px] px-[20px] flex items-center justify-center text-[14px] leading-[20px] border-0 transition-opacity hover:opacity-90" style={{ fontFamily: FONT, background: COLOR_TEXT, color: 'white', fontWeight: 600 }}>Start free trial</button>
                <button onClick={() => ClainV2.navigate('/demo')} className="cursor-pointer rounded-[8px] h-[44px] px-[20px] flex items-center justify-center text-[14px] leading-[20px] bg-white transition-opacity hover:opacity-80" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 600, border: `1px solid ${COLOR_TEXT}` }}>Talk to sales</button>
              </div>
            </div>
          </div>
        </div>

        {/* Section 5 — Startups */}
        <div className="relative w-full" style={{ background: BG_OFF_WHITE_2 }}>
          <div className="max-w-[1440px] mx-auto px-[16px] pt-[80px] pb-[80px] relative">
            <CornerDots color="rgba(17,17,17,0.1)" />
            <div className="max-w-[1170px] mx-auto px-[16px]">
              <div className="grid grid-cols-2 gap-[40px] items-center">
                <div>
                  <p className="m-0 text-[10px] uppercase tracking-[0.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60 }}>For startups</p>
                  <h2 className="m-0 mt-[16px] text-[44px] leading-[48px] tracking-[-1.4px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 400 }}>Early Stage Program</h2>
                  <p className="m-0 mt-[16px] text-[15px] leading-[22px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60 }}>
                    Eligible companies — under 2 years old, fewer than 25 employees, raised under $5M — get <strong style={{ color: COLOR_TEXT, fontWeight: 600 }}>50% off year one</strong> on any plan, plus access to exclusive deals on startup tools, the Early Stage Academy, and our community of founders building with Clain.
                  </p>
                  <ul className="list-none p-0 m-0 mt-[24px] flex flex-col gap-[8px]">
                    <Bullet>50% off the first year on Starter, Growth or Scale</Bullet>
                    <Bullet>$100K worth of deals on Stripe, Notion and partner tools</Bullet>
                    <Bullet>Early Stage Academy — courses with Clain experts</Bullet>
                    <Bullet>Direct line to the Clain founders' community</Bullet>
                  </ul>
                  <div className="mt-[24px] flex gap-[12px]">
                    <button onClick={() => ClainV2.navigate('/startups')} className="cursor-pointer rounded-[8px] h-[44px] px-[20px] flex items-center justify-center text-[14px] leading-[20px] border-0 transition-opacity hover:opacity-90" style={{ fontFamily: FONT, background: COLOR_TEXT, color: 'white', fontWeight: 600 }}>Learn more</button>
                    <button onClick={() => ClainV2.navigate('/signup')} className="cursor-pointer rounded-[8px] h-[44px] px-[20px] flex items-center justify-center text-[14px] leading-[20px] bg-white transition-opacity hover:opacity-80" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 600, border: `1px solid ${COLOR_TEXT}` }}>Apply</button>
                  </div>
                </div>
                <div className="relative" style={{ border: `1px solid ${BORDER_CLAY}`, background: 'white' }}>
                  <div className="px-[24px] py-[10px]" style={{ background: BG_OFF_WHITE, borderBottom: `1px solid ${BORDER_CLAY}` }}>
                    <span className="text-[13px] leading-[19.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT }}>Who qualifies</span>
                  </div>
                  <div className="p-[24px] flex flex-col gap-[16px]">
                    <div className="flex items-baseline justify-between" style={{ borderBottom: `1px solid ${BORDER_CLAY}`, paddingBottom: 12 }}>
                      <span className="text-[13px] leading-[19px]" style={{ fontFamily: FONT, color: COLOR_TEXT_80 }}>Company age</span>
                      <span className="text-[14px] leading-[20px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 600 }}>Under 2 years</span>
                    </div>
                    <div className="flex items-baseline justify-between" style={{ borderBottom: `1px solid ${BORDER_CLAY}`, paddingBottom: 12 }}>
                      <span className="text-[13px] leading-[19px]" style={{ fontFamily: FONT, color: COLOR_TEXT_80 }}>Headcount</span>
                      <span className="text-[14px] leading-[20px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 600 }}>Under 25 employees</span>
                    </div>
                    <div className="flex items-baseline justify-between" style={{ borderBottom: `1px solid ${BORDER_CLAY}`, paddingBottom: 12 }}>
                      <span className="text-[13px] leading-[19px]" style={{ fontFamily: FONT, color: COLOR_TEXT_80 }}>Total funding raised</span>
                      <span className="text-[14px] leading-[20px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 600 }}>Under $5M</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[13px] leading-[19px]" style={{ fontFamily: FONT, color: COLOR_TEXT_80 }}>Discount</span>
                      <span className="text-[14px] leading-[20px]" style={{ fontFamily: FONT, color: ACCENT_GREEN, fontWeight: 700 }}>50% off year one</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 6 — FAQ */}
        <FaqSection faqs={FAQS} openFaq={openFaq} setOpenFaq={setOpenFaq} />

        {/* Section 7 — Final CTA */}
        <div className="relative w-full" style={{ background: BG_OFF_WHITE }}>
          <div className="max-w-[1440px] mx-auto px-[16px] pt-[120px] pb-[120px] relative">
            <CornerDots color="rgba(17,17,17,0.15)" />
            <div className="max-w-[1170px] mx-auto px-[16px] flex flex-col items-center text-center">
              <h2 className="m-0 text-[64px] leading-[68px] tracking-[-2px] max-w-[820px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 400 }}>Ready to ship better support?</h2>
              <p className="m-0 mt-[16px] max-w-[600px] text-[15px] leading-[22px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60 }}>14-day free trial on every plan. No card required. Switch or cancel anytime.</p>
              <div className="mt-[32px] flex gap-[12px]">
                <button onClick={() => ClainV2.navigate('/signup')} className="cursor-pointer border-0 rounded-[8px] h-[48px] px-[28px] text-[14px] leading-[20px] transition-opacity hover:opacity-90" style={{ fontFamily: FONT, background: COLOR_TEXT, color: 'white', fontWeight: 600 }}>Start free trial</button>
                <button onClick={() => ClainV2.navigate('/pricing')} className="cursor-pointer rounded-[8px] h-[48px] px-[28px] text-[14px] leading-[20px] bg-white transition-opacity hover:opacity-80" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 600, border: `1px solid ${COLOR_TEXT}` }}>Back to pricing</button>
              </div>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  function FaqSection({ faqs, openFaq, setOpenFaq }) {
    return (
      <div className="relative w-full bg-white">
        <div className="max-w-[1440px] mx-auto px-[16px] pt-[80px] pb-[80px] relative">
          <CornerDots color="rgba(17,17,17,0.1)" />
          <div className="max-w-[896px] mx-auto px-[16px]">
            <h2 className="m-0 text-[44px] leading-[48px] tracking-[-1.4px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 400 }}>Frequently asked questions</h2>
            <div className="mt-[32px]">
              {faqs.map((f, i) => (
                <FAQItem key={i} q={f.q} a={f.a} isOpen={openFaq === i} onToggle={() => setOpenFaq(openFaq === i ? null : i)} />
              ))}
              <div className="border-t" style={{ borderColor: BORDER_CLAY }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  window.AllFeaturesPage = AllFeaturesPage;
})();
