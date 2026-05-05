/* global React, ClainV2 */
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

  /* ── Components ─────────────────────────────────────── */

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

  function InfoIcon() {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="inline-block shrink-0">
        <circle cx="6" cy="6" r="5.5" stroke={COLOR_TEXT_60} />
        <circle cx="6" cy="3.5" r="0.6" fill={COLOR_TEXT_60} />
        <path d="M6 5.5v3.5" stroke={COLOR_TEXT_60} strokeLinecap="round" />
      </svg>
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

  // Compute "Save XX%" — both args are euro strings ("€149", "€42").
  function savePercent(originalStr, currentStr) {
    const a = parseFloat(String(originalStr).replace(/[^0-9.]/g, ''));
    const b = parseFloat(String(currentStr).replace(/[^0-9.]/g, ''));
    if (!a || !b || b >= a) return 0;
    return Math.round((1 - b / a) * 100);
  }

  function PlanColumn({ plan, isAnnual, width, showDemoBtn }) {
    const price = isAnnual ? plan.priceAnnual : plan.priceMonthly;
    return (
      <div className="flex flex-col p-[24px] h-full" style={{ width, minHeight: 608 }}>
        {/* TOP: title, subtitle, description, price — fixed-height block so all columns align */}
        <div className="flex flex-col" style={{ height: 270 }}>
          <h3 className="m-0 text-[22px] tracking-[-0.48px] leading-[24px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 500 }}>{plan.name}</h3>
          <p className="m-0 mt-[10px] text-[13px] leading-[19.6px] min-h-[20px]" style={{ fontFamily: FONT, color: COLOR_TEXT }}>{plan.subtitle || ' '}</p>
          <p className="m-0 mt-[16px] text-[13px] leading-[19.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60 }}>{plan.description}</p>
          {/* price block — single horizontal row: strikethrough MSRP on the left, current price on the right */}
          <div className="mt-auto" style={{ height: 60 }}>
            {plan.seatPrice && (
              <div className="flex flex-col gap-[4px]">
                <div className="flex items-baseline justify-between">
                  {plan.originalPrice ? (
                    <span className="text-[14px] leading-[20px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60, textDecoration: 'line-through' }}>{plan.originalPrice}/mo</span>
                  ) : <span />}
                  <div className="flex items-baseline gap-[4px]">
                    <span className="text-[12px] leading-[16px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60 }}>From</span>
                    <span className="text-[26px] leading-[28px] tracking-[-0.5px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 700 }}>{price}</span>
                  </div>
                </div>
                <div className="flex justify-end">
                  <span className="text-[12px] leading-[16px]" style={{ fontFamily: FONT, color: COLOR_TEXT_80 }}>{plan.seatLabel}</span>
                </div>
              </div>
            )}
            {plan.isBusiness && (
              <div className="flex flex-col gap-[4px]">
                <div className="flex items-baseline justify-end">
                  <span className="text-[26px] leading-[28px] tracking-[-0.5px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 700 }}>Custom</span>
                </div>
                <div className="flex justify-end">
                  <span className="text-[12px] leading-[16px]" style={{ fontFamily: FONT, color: COLOR_TEXT_80 }}>Volume-based pricing</span>
                </div>
              </div>
            )}
            {plan.noSeats && !plan.isBusiness && (
              <div className="flex flex-col gap-[2px]">
                <p className="m-0 text-[13px] leading-[18px]" style={{ fontFamily: FONT, color: COLOR_TEXT_80 }}>Pay as you go</p>
                <p className="m-0 text-[13px] leading-[18px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60 }}>No seats required</p>
              </div>
            )}
          </div>
        </div>
        {/* CTA: full-width subscribe-style button — sits below the fixed top block so all CTAs line up horizontally */}
        <div className="mt-[16px]">
          <button
            onClick={() => ClainV2.navigate(plan.ctaTarget || '/signup')}
            className="cursor-pointer rounded-[8px] h-[44px] w-full px-[16px] flex items-center justify-center text-[14px] leading-[20px] border-0 transition-opacity hover:opacity-90"
            style={{ fontFamily: FONT, background: COLOR_TEXT, color: 'white', fontWeight: 600 }}
          >
            {plan.cta || `Get ${plan.name}`}
          </button>
        </div>

        {/* SPACER */}
        <div style={{ height: 32 }} />

        {/* FEATURES */}
        <div className="flex flex-col flex-1">
          <p className="m-0 text-[10px] uppercase tracking-[0.6px] leading-[10px]" style={{ fontFamily: FONT, color: COLOR_TEXT }}>{plan.featuresLabel}</p>
          <ul className="list-none p-0 m-0 mt-[26px] flex flex-col gap-[16px]">
            {plan.features.map((f, i) => <Bullet key={i}>{f}</Bullet>)}
          </ul>
          <button onClick={() => ClainV2.navigate('/all-features')} className="mt-auto pt-[26px] self-start bg-transparent border-0 p-0 cursor-pointer text-[13px] leading-[19.6px] underline" style={{ fontFamily: FONT, color: COLOR_TEXT }}>View all features</button>
        </div>
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

  /* ── Page ──────────────────────────────────────────── */

  function PricingPage() {
    const [isAnnual, setIsAnnual] = useState(true);
    const [openFaq, setOpenFaq] = useState(0);
    const [activeTestimonial, setActiveTestimonial] = useState(0);

    // MSRP shown as strikethrough next to the discounted price — same numbers
    // as the SaaS Plans tab (originalPrice). Discount applies to both billing
    // cycles; credit allowances are workspace-wide, not per seat.
    const platformPlans = [
      {
        name: 'Starter',
        subtitle: 'Includes Clain AI Agent',
        description: 'The customer support plan for individuals, startups, and small businesses.',
        originalPrice: '€149',
        priceAnnual: '€42',
        priceMonthly: '€49',
        seatPrice: true,
        seatLabel: 'per team/mo',
        cta: 'Upgrade to Starter',
        featuresLabel: 'KEY FEATURES INCLUDE',
        features: [
          'Clain AI Agent (autonomous)',
          '5,000 AI credits/month — workspace total',
          'Inbox with shared views',
          'Knowledge Hub',
          '3 seats included',
        ],
      },
      {
        name: 'Growth',
        subtitle: 'Includes Clain AI Agent',
        description: 'Powerful automation tools and AI features for growing support teams.',
        originalPrice: '€399',
        priceAnnual: '€109',
        priceMonthly: '€129',
        seatPrice: true,
        seatLabel: 'per team/mo',
        cta: 'Upgrade to Growth',
        featuresLabel: 'EVERY STARTER FEATURE, PLUS',
        features: [
          '20,000 AI credits/month — workspace total',
          'Tickets & SLA monitoring',
          'Workflow automation builder',
          'Round robin assignment',
          'Reporting + AI Insights',
          '8 seats included',
        ],
      },
      {
        name: 'Scale',
        subtitle: 'Includes Clain AI Agent',
        description: 'Collaboration, security, and multibrand features for large support teams.',
        originalPrice: '€899',
        priceAnnual: '€254',
        priceMonthly: '€299',
        seatPrice: true,
        seatLabel: 'per team/mo',
        cta: 'Upgrade to Scale',
        featuresLabel: 'EVERY GROWTH FEATURE, PLUS',
        features: [
          '60,000 AI credits/month — workspace total',
          'SSO & identity management',
          'HIPAA support',
          'Service level agreements (SLAs)',
          'Multibrand Help Center',
          '20 seats included',
        ],
      },
    ];

    // Business / Enterprise plan — matches the SaaS Plans tab "Business" row.
    // No fixed price; bespoke contract negotiated with sales.
    const standalonePlan = {
      name: 'Business',
      subtitle: 'Custom plan, talk to sales',
      description: 'For organisations with custom capacity, governance, security, and compliance needs.',
      isBusiness: true,
      cta: 'Talk to sales',
      ctaTarget: '/demo',
      featuresLabel: 'EVERYTHING IN SCALE, PLUS',
      features: [
        'Custom AI credit allocation',
        'Custom seat allocation',
        'Enterprise-grade security & compliance',
        'Bring Your Own Model (BYOM)',
        'Custom SLA & uptime guarantees',
        'Tailored onboarding & dedicated success manager',
      ],
    };

    const addons = [
      { name: 'Pro', price: '€99/mo', desc: 'AI features for visibility and control across every conversation. Includes CX Score, Topics, Recommendations, Monitors, and Custom Scorecards.', extra: 'Includes analysis of 1,000 conversations/mo' },
      { name: 'Copilot', price: '€29/agent/mo', desc: 'Increase agent efficiency with a personal AI assistant in the inbox. Free to use in 10 Copilot and 10 AI Auto-translation conversations per agent/mo.', extra: 'Unlimited usage' },
      { name: 'Proactive Support Plus', price: '€99/mo', desc: 'Advanced in-app and outbound support features including Posts, Checklists, Product Tours, Surveys, and Series campaign builder.', extra: 'Includes 500 messages sent/mo' },
    ];

    const testimonials = [
      { tab: 'LINKTREE', logo: 'Linktree', quote: '"Within six days, Clain is successfully resolving 42% of conversations. It’s truly surpassed my expectations."', author: 'Dane Burgess', role: 'Customer Support Director at Linktree' },
      { tab: 'ROBIN', logo: 'Robin', quote: '"Clain’s agent handles the repetitive queries our team used to dread. We redirected 20 hours a week."', author: 'Camila Vives', role: 'Lead CX at Robin' },
      { tab: 'SYNTHESIA', logo: 'Synthesia', quote: '"We plugged Clain into our existing stack and the AI started resolving tickets on day one."', author: 'Marco Ribeiro', role: 'Head of Support at Synthesia' },
    ];

    const faqs = [
      { q: 'How does Clain pricing work?', a: 'Clain pricing has two components — Seats: you pay per teammate based on your plan (Starter, Growth, Scale). Usage: you pay for what you use (e.g. Clain outcomes, messaging channels). All plans include access to Clain’s helpdesk and Clain AI Agent.' },
      { q: 'How is Clain AI Agent priced?', a: 'Clain AI Agent is included in every plan with a monthly credit allowance. One credit = one resolved interaction. Flexible usage at €0.012 per outcome.' },
      { q: 'Can I use Clain with my existing helpdesk?', a: 'Yes. Clain integrates with Zendesk, HubSpot, Salesforce, Freshdesk and others via API.' },
      { q: 'What plans does Clain offer?', a: 'Starter, Growth, Scale self-serve + Business enterprise. All include AI agent and unlimited integrations.' },
      { q: 'What is a seat (Full vs Lite)?', a: 'A Full seat is a human teammate with full login access. Lite seats are read-only collaborators included free with each plan.' },
      { q: 'Are there additional usage charges?', a: 'Only if you exceed monthly credit allowance with flexible usage enabled.' },
      { q: 'What is Proactive Support Plus?', a: 'Add-on (€99/mo) for outbound AI nudges — onboarding, cart-recovery, renewals.' },
      { q: 'Do I need a contract?', a: 'No. Self-serve monthly/annual, no commitment. Business uses MSA + DPA.' },
      { q: 'What’s the minimum to get started?', a: 'Free 14-day trial, no card required.' },
      { q: 'Is there a free trial?', a: 'Yes — 14 days, full access, no card.' },
      { q: 'How do I change my plan or seats?', a: 'Self-service in Billing → Subscription.' },
      { q: 'Are there discounts available?', a: '20% off annual. Startups under 2 years get 50% off year one.' },
    ];

    return (
      <PageShell>
        {/* ═══════ Section 1 — Hero + Plan Cards ═══════ */}
        <div className="relative w-full bg-white">
          <div className="max-w-[1440px] mx-auto px-[16px] pt-[128px] pb-[40px] relative">
            <CornerDots />

            <div className="max-w-[1170px] mx-auto px-[16px]">
              {/* Hero heading */}
              <h1 className="m-0 text-[50px] leading-[54px] tracking-[-1.6px] max-w-[896px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 400 }}>
                Get Clain AI Agent and the full platform for a single, integrated experience
              </h1>

              {/* Toggle + special-promotion banner */}
              <div className="mt-[40px] flex items-center gap-[16px] flex-wrap">
                <div className="inline-flex items-center gap-[10px] px-[6px] py-[6px] bg-white" style={{ border: '1px solid #dedbd6' }}>
                  <button onClick={() => setIsAnnual(true)} className="cursor-pointer border-0 px-[12px] py-[6px] text-[13px] leading-[19.6px] rounded-[4px]" style={{ fontFamily: FONT, color: COLOR_TEXT, background: isAnnual ? '#e7e3db' : 'transparent', fontWeight: isAnnual ? 600 : 400 }}>Billed annually</button>
                  <button onClick={() => setIsAnnual(false)} className="cursor-pointer border-0 px-[12px] py-[6px] text-[13px] leading-[19.6px] rounded-[4px]" style={{ fontFamily: FONT, color: COLOR_TEXT, background: !isAnnual ? '#e7e3db' : 'transparent', fontWeight: !isAnnual ? 600 : 400 }}>Billed monthly</button>
                </div>
                {/* Special promotion banner — anchors the savings story away from the per-card price */}
                <div className="inline-flex items-center gap-[10px] px-[14px] py-[10px] rounded-[8px]" style={{ background: '#dff0e3', border: '1px solid #b9dfc3' }}>
                  <span className="text-[10px] uppercase tracking-[0.6px]" style={{ fontFamily: FONT, color: '#11643d', fontWeight: 700 }}>Special promotion</span>
                  <span className="size-[3px] rounded-full" style={{ background: '#11643d' }} />
                  <span className="text-[13px] leading-[18px]" style={{ fontFamily: FONT, color: '#11643d', fontWeight: 600 }}>Save up to 73% on every plan</span>
                </div>
              </div>

              {/* Plans row */}
              <div className="flex gap-[24px] items-stretch mt-[40px]">
                {/* LEFT — 3 plan columns inside one bordered container */}
                <div className="flex flex-col flex-1" style={{ border: `1px solid ${BORDER_CLAY}` }}>
                  <div className="px-[24px] py-[10px]" style={{ background: BG_OFF_WHITE, borderBottom: `1px solid ${BORDER_CLAY}` }}>
                    <span className="text-[13px] leading-[19.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT }}>Our Clain AI Agent + platform plans</span>
                  </div>
                  <div className="flex">
                    {platformPlans.map((plan, i) => (
                      <div key={plan.name} className="flex-1" style={{ borderLeft: i > 0 ? `1px solid ${BORDER_CLAY}` : 'none' }}>
                        <PlanColumn plan={plan} isAnnual={isAnnual} showDemoBtn={i > 0} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* RIGHT — Business / contact-sales card (mirrors SaaS Business plan) */}
                <div className="flex flex-col" style={{ width: 288, border: `1px solid ${BORDER_CLAY}` }}>
                  <div className="px-[24px] py-[10px]" style={{ background: BG_OFF_WHITE, borderBottom: `1px solid ${BORDER_CLAY}` }}>
                    <span className="text-[13px] leading-[19.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT }}>Need more? Talk to sales</span>
                  </div>
                  <PlanColumn plan={standalonePlan} isAnnual={isAnnual} showDemoBtn={true} />
                </div>
              </div>

              {/* Footer note */}
              <div className="mt-[40px] max-w-[600px] text-[13px] leading-[19.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT }}>
                <p className="m-0">All plans include free, unlimited live chat, support email, in-app chats, banners, and tooltips. Pay-as-you-go for email campaigns, SMS, WhatsApp, and Phone. <a onClick={(e) => { e.preventDefault(); ClainV2.navigate('/pricing/channels'); }} href="#" className="underline" style={{ color: COLOR_TEXT }}>View channel pricing</a></p>
              </div>

              {/* ── How credits & seats work — same card UI as plans above, both columns flex so CTAs sit at the same baseline ── */}
              <div className="mt-[40px]" style={{ border: `1px solid ${BORDER_CLAY}` }}>
                <div className="px-[24px] py-[10px]" style={{ background: BG_OFF_WHITE, borderBottom: `1px solid ${BORDER_CLAY}` }}>
                  <span className="text-[13px] leading-[19.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT }}>How credits and seats work</span>
                </div>
                <div className="flex items-stretch">
                  {/* Credits column */}
                  <div className="flex-1 p-[24px] flex flex-col" style={{ borderRight: `1px solid ${BORDER_CLAY}` }}>
                    <h3 className="m-0 text-[22px] tracking-[-0.48px] leading-[24px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 500 }}>AI Credits</h3>
                    <p className="m-0 mt-[10px] text-[13px] leading-[19.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT }}>The intelligence powering your workspace</p>
                    <p className="m-0 mt-[16px] text-[13px] leading-[19.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60 }}>
                      Each plan includes a monthly allowance of AI credits — <strong style={{ color: COLOR_TEXT, fontWeight: 600 }}>shared across your entire team</strong>, not per seat. One credit covers a unit of AI work: a tagged conversation, a generated summary, or a multi-step reasoning task. Adding more seats <strong style={{ color: COLOR_TEXT, fontWeight: 600 }}>does not add credits</strong>; to extend your team's allowance, buy credit packs separately.
                    </p>
                    <p className="mt-[24px] m-0 text-[10px] uppercase tracking-[0.6px] leading-[10px]" style={{ fontFamily: FONT, color: COLOR_TEXT }}>MONTHLY ALLOWANCE PER PLAN</p>
                    <ul className="list-none p-0 m-0 mt-[16px] flex flex-col gap-[12px]">
                      <Bullet>Starter — 5,000 credits / month</Bullet>
                      <Bullet>Growth — 20,000 credits / month</Bullet>
                      <Bullet>Scale — 60,000 credits / month</Bullet>
                      <Bullet>Top-ups available; consumed after monthly allowance</Bullet>
                    </ul>
                    <button onClick={() => ClainV2.navigate('/all-features#credits')} className="mt-auto pt-[40px] self-start cursor-pointer transition-opacity hover:opacity-90" style={{ fontFamily: FONT, background: 'transparent', color: COLOR_TEXT, fontWeight: 600, border: 'none', padding: 0 }}>
                      <span className="rounded-[8px] inline-flex items-center justify-center text-[13px] leading-[20px] h-[40px] px-[16px]" style={{ background: COLOR_TEXT, color: 'white', fontWeight: 600 }}>Buy credit packs</span>
                    </button>
                  </div>
                  {/* Seats column */}
                  <div className="flex-1 p-[24px] flex flex-col">
                    <h3 className="m-0 text-[22px] tracking-[-0.48px] leading-[24px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 500 }}>Seats</h3>
                    <p className="m-0 mt-[10px] text-[13px] leading-[19.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT }}>One seat per teammate with full access</p>
                    <p className="m-0 mt-[16px] text-[13px] leading-[19.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60 }}>
                      Each plan includes a base number of seats. Add more anytime as your team grows — billing prorates automatically. <strong style={{ color: COLOR_TEXT, fontWeight: 600 }}>Adding a seat does not increase your AI credits allowance</strong> — credits remain shared by the workspace and are billed separately. Lite seats for view-only collaborators are included free with every plan.
                    </p>
                    <p className="mt-[24px] m-0 text-[10px] uppercase tracking-[0.6px] leading-[10px]" style={{ fontFamily: FONT, color: COLOR_TEXT }}>SEATS INCLUDED PER PLAN</p>
                    <ul className="list-none p-0 m-0 mt-[16px] flex flex-col gap-[12px]">
                      <Bullet>Starter — 3 seats included (€25 / extra seat)</Bullet>
                      <Bullet>Growth — 8 seats included (€22 / extra seat)</Bullet>
                      <Bullet>Scale — 20 seats included (€19 / extra seat)</Bullet>
                      <Bullet>Lite collaborators — unlimited, free</Bullet>
                    </ul>
                    <button onClick={() => ClainV2.navigate('/all-features#seats')} className="mt-auto pt-[24px] self-start cursor-pointer transition-opacity hover:opacity-90" style={{ fontFamily: FONT, background: 'transparent', color: COLOR_TEXT, fontWeight: 600, border: 'none', padding: 0 }}>
                      <span className="rounded-[8px] inline-flex items-center justify-center text-[13px] leading-[20px] h-[40px] px-[16px]" style={{ background: COLOR_TEXT, color: 'white', fontWeight: 600 }}>Manage seats</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════ Section 2 — Add-ons ═══════ */}
        <div className="relative w-full" style={{ background: BG_OFF_WHITE }}>
          <div className="max-w-[1440px] mx-auto px-[16px] pt-[80px] pb-[80px] relative">
            <CornerDots color="rgba(17,17,17,0.1)" />
            <div className="max-w-[1170px] mx-auto px-[16px]">
              <h2 className="m-0 text-[50px] leading-[54px] tracking-[-1.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 400 }}>Add-ons</h2>
              <p className="m-0 mt-[8px] text-[13px] leading-[19.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60 }}>Included in your free trial. Add or remove anytime.</p>
              <div className="grid grid-cols-3 gap-[24px] mt-[40px]">
                {addons.map((addon) => (
                  <div key={addon.name} className="relative p-[40px]" style={{ background: BG_OFF_WHITE_2 }}>
                    <CornerDots color="rgba(17,17,17,0.15)" />
                    <h3 className="m-0 text-[19px] leading-[24px] tracking-[-0.2px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 500 }}>{addon.name}</h3>
                    <p className="m-0 mt-[16px] text-[13px] leading-[19.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60 }}>{addon.desc}</p>
                    <div className="mt-[16px] flex items-baseline gap-[4px]">
                      <span className="text-[19px] leading-[19px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 500 }}>{addon.price.split('/')[0]}</span>
                      <span className="text-[13px] leading-[19.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT_80 }}>/{addon.price.split('/').slice(1).join('/')}</span>
                    </div>
                    <p className="m-0 mt-[8px] text-[13px] leading-[19.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT_80 }}>{addon.extra}</p>
                    <div className="mt-[24px]">
                      <button onClick={() => ClainV2.navigate('/demo')} className="cursor-pointer border-0 rounded-[4px] h-[40px] px-[14px] text-[13px] leading-[20px]" style={{ fontFamily: FONT, background: COLOR_TEXT, color: 'white' }}>Learn more</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ═══════ Section 3 — Get an estimate ═══════ */}
        <div className="relative w-full bg-white">
          <div className="max-w-[1440px] mx-auto px-[16px] pt-[80px] pb-[80px] relative">
            <CornerDots color="rgba(17,17,17,0.1)" />
            <div className="max-w-[1170px] mx-auto px-[16px]">
              <h2 className="m-0 text-[50px] leading-[54px] tracking-[-1.6px] max-w-[700px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 400 }}>
                <span style={{ color: COLOR_TEXT_60 }}>Get an estimate </span>based on your needs
              </h2>
              <div className="grid grid-cols-2 gap-[24px] mt-[40px]">
                {[
                  { title: 'Find the right plan for your team', desc: 'Get an estimated cost for Clain’s AI-first customer service platform — based on your team size, expected Clain outcomes, and more.', cta: 'Estimate cost', link: '/pricing/estimate' },
                  { title: 'See the ROI impact Clain could have on your business', desc: 'Estimate how much time and money Clain could save your team — based on your current and future support volume.', cta: 'See ROI', link: '/pricing/roi' },
                ].map((card) => (
                  <div key={card.title} className="relative p-[40px]" style={{ background: BG_OFF_WHITE_2 }}>
                    <CornerDots color="rgba(17,17,17,0.15)" />
                    <h3 className="m-0 text-[28px] leading-[32px] tracking-[-0.6px] max-w-[280px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 500 }}>{card.title}</h3>
                    <p className="m-0 mt-[16px] text-[13px] leading-[19.6px] max-w-[380px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60 }}>{card.desc}</p>
                    <div className="mt-[24px]">
                      <button onClick={() => ClainV2.navigate(card.link)} className="cursor-pointer border-0 rounded-[4px] h-[40px] px-[14px] text-[13px] leading-[20px]" style={{ fontFamily: FONT, background: COLOR_TEXT, color: 'white' }}>{card.cta}</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ═══════ Section 4 — Startups get 90% off ═══════ */}
        <div className="relative w-full" style={{ background: BG_OFF_WHITE }}>
          <div className="max-w-[1440px] mx-auto px-[16px] pt-[80px] pb-[80px] relative">
            <CornerDots color="rgba(17,17,17,0.1)" />
            <div className="max-w-[1170px] mx-auto px-[16px] flex flex-col items-center text-center">
              <h2 className="m-0 text-[50px] leading-[54px] tracking-[-1.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 400 }}>Startups get 90% off</h2>
              <div className="relative mt-[40px] w-full max-w-[700px] p-[60px] flex flex-col items-center" style={{ background: BG_OFF_WHITE_2 }}>
                <CornerDots color="rgba(17,17,17,0.15)" />
                <p className="m-0 text-[13px] leading-[19.6px] text-center" style={{ fontFamily: FONT, color: COLOR_TEXT }}>Get a direct line to your customers with</p>
                <p className="m-0 text-[13px] leading-[19.6px] text-center" style={{ fontFamily: FONT, color: COLOR_TEXT }}>best-in-class support.</p>
                <button onClick={() => ClainV2.navigate('/startups')} className="mt-[24px] cursor-pointer border-0 rounded-[4px] h-[40px] px-[14px] text-[13px] leading-[20px]" style={{ fontFamily: FONT, background: COLOR_TEXT, color: 'white' }}>Apply now</button>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════ Section 5 — Testimonials ═══════ */}
        <div className="relative w-full bg-white">
          <div className="max-w-[1440px] mx-auto px-[16px] pt-[80px] pb-[80px] relative">
            <CornerDots color="rgba(17,17,17,0.1)" />
            <div className="max-w-[1170px] mx-auto px-[16px]">
              <h2 className="m-0 text-[50px] leading-[54px] tracking-[-1.6px] max-w-[800px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 400 }}>
                <span>Thousands of businesses </span>
                <span style={{ color: COLOR_TEXT_60 }}>have already seen transformational results</span>
              </h2>
              {/* Tabs */}
              <div className="mt-[40px] flex" style={{ borderBottom: `1px solid ${BORDER_CLAY}` }}>
                {testimonials.map((t, i) => (
                  <button key={t.tab} onClick={() => setActiveTestimonial(i)} className="flex-1 cursor-pointer border-0 bg-transparent px-[24px] py-[12px] text-left text-[12px] uppercase tracking-[0.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT, background: i === activeTestimonial ? BG_OFF_WHITE : 'transparent' }}>{t.tab}</button>
                ))}
              </div>
              {/* Active testimonial */}
              <div className="relative p-[60px]" style={{ background: BG_OFF_WHITE }}>
                <CornerDots color={ACCENT_BLUE} />
                <p className="m-0 text-[28px] leading-[36px] tracking-[-0.4px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60, fontWeight: 500 }}>
                  <span style={{ color: COLOR_TEXT }}>{testimonials[activeTestimonial].quote}</span>
                </p>
                <div className="mt-[60px]">
                  <p className="m-0 text-[13px] leading-[19.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 600 }}>{testimonials[activeTestimonial].author}</p>
                  <p className="m-0 text-[13px] leading-[19.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT_60 }}>{testimonials[activeTestimonial].role}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════ Section 6 — FAQs ═══════ */}
        <div className="relative w-full bg-white">
          <div className="max-w-[1440px] mx-auto px-[16px] pt-[80px] pb-[80px] relative">
            <CornerDots color="rgba(17,17,17,0.1)" />
            <div className="max-w-[1170px] mx-auto px-[16px] grid grid-cols-[1fr_2fr] gap-[80px]">
              <h2 className="m-0 text-[50px] leading-[54px] tracking-[-1.6px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 400 }}>FAQs</h2>
              <div className="flex flex-col">
                {faqs.map((faq, i) => (
                  <FAQItem key={i} q={faq.q} a={faq.a} isOpen={openFaq === i} onToggle={() => setOpenFaq(openFaq === i ? null : i)} />
                ))}
                <div style={{ borderBottom: `1px solid ${BORDER_CLAY}` }} />
              </div>
            </div>
          </div>
        </div>

        {/* ═══════ Section 7 — Final CTA ═══════ */}
        <div className="relative w-full" style={{ background: BG_OFF_WHITE }}>
          <div className="max-w-[1440px] mx-auto px-[16px] pt-[120px] pb-[120px] relative">
            <CornerDots color="rgba(17,17,17,0.15)" />
            <div className="max-w-[1170px] mx-auto px-[16px] flex flex-col items-center text-center">
              <h2 className="m-0 text-[64px] leading-[68px] tracking-[-2px] max-w-[820px]" style={{ fontFamily: FONT, color: COLOR_TEXT, fontWeight: 400 }}>Perfect customer experiences, powered by Clain</h2>
              <div className="mt-[32px]">
                <button onClick={() => ClainV2.navigate('/signup')} className="cursor-pointer border-0 rounded-[8px] h-[48px] px-[28px] text-[14px] leading-[20px] transition-opacity hover:opacity-90" style={{ fontFamily: FONT, background: COLOR_TEXT, color: 'white', fontWeight: 600 }}>Get started with Clain</button>
              </div>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  window.PricingPage = PricingPage;
})();
