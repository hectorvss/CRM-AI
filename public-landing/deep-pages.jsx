/* global React */
/* =============================================================================
   deep-pages.jsx
   Three deep-dive pages built with the existing landing components + tokens.
   All copy is original. Common SaaS landing patterns are used (hero with
   metrics, feature blocks, persona tabs, before/after, FAQ, final CTA).

   - SuperAgentPage  → /super-agent  (NEW dedicated page)
   - HelpdeskExtras  → injected into /product
   - InboxExtras     → injected into /omnichannel
   ============================================================================= */

const { useState: useStateD, useEffect: useEffectD } = React;

/* ---------- shared building blocks ---------------------------------------- */

function MetricRow({ items }) {
  return (
    <div className="dp-metrics reveal-children">
      {items.map((m, i) => (
        <div key={i} className="dp-metric">
          <div className="dp-metric-num">{m.n}</div>
          <div className="dp-metric-lab">{m.l}</div>
          {m.s && <div className="dp-metric-sub">{m.s}</div>}
        </div>
      ))}
    </div>
  );
}

function Feature3({ title, lede, items }) {
  const renderTitleParts = window.renderTitleParts;
  return (
    <section className="section">
      <div className="wrap">
        <div className="reveal" style={{display:'grid', gap: 18, maxWidth: 760, marginBottom: 56}}>
          <h2 className="h-section">{renderTitleParts(title)}</h2>
          {lede && <p className="lede">{lede}</p>}
        </div>
        <div className="dp-feat3 reveal-children">
          {items.map((f, i) => (
            <div key={i} className="dp-feat-card">
              <div className="dp-feat-mark">{String(i + 1).padStart(2, '0')}</div>
              <h4>{f.t}</h4>
              <p>{f.d}</p>
              {f.bullets && (
                <ul className="dp-feat-bullets">
                  {f.bullets.map((b, j) => <li key={j}>{b}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PersonaTabs({ title, lede, personas }) {
  const renderTitleParts = window.renderTitleParts;
  const [active, setActive] = useStateD(0);
  const cur = personas[active];
  return (
    <section className="section">
      <div className="wrap">
        <div className="reveal" style={{display:'grid', gap: 18, maxWidth: 760, marginBottom: 40}}>
          <span className="eyebrow">For your team</span>
          <h2 className="h-section">{renderTitleParts(title)}</h2>
          {lede && <p className="lede">{lede}</p>}
        </div>
        <div className="dp-persona-tabs">
          {personas.map((p, i) => (
            <button
              key={i}
              className={`dp-persona-tab ${i === active ? 'active' : ''}`}
              onClick={() => setActive(i)}
            >
              <span className="dp-persona-mark">{p.mark}</span>
              <span>{p.name}</span>
            </button>
          ))}
        </div>
        <div className="dp-persona-body reveal" key={active}>
          <div className="dp-persona-side">
            <h3>{cur.headline}</h3>
            <p>{cur.body}</p>
            <ul>
              {cur.points.map((pt, i) => <li key={i}>{pt}</li>)}
            </ul>
          </div>
          <div className="dp-persona-stats">
            {cur.stats.map((s, i) => (
              <div key={i} className="dp-persona-stat">
                <div className="dp-persona-stat-num">{s.n}</div>
                <div className="dp-persona-stat-lab">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function BeforeAfter({ title, lede, before, after }) {
  const renderTitleParts = window.renderTitleParts;
  return (
    <section className="section">
      <div className="wrap">
        <div className="reveal" style={{display:'grid', gap: 18, maxWidth: 760, marginBottom: 40}}>
          <span className="eyebrow">Before · After</span>
          <h2 className="h-section">{renderTitleParts(title)}</h2>
          {lede && <p className="lede">{lede}</p>}
        </div>
        <div className="dp-ba reveal-children">
          <div className="dp-ba-col dp-ba-before">
            <div className="dp-ba-tag">Before Clain</div>
            <ul>{before.map((b, i) => <li key={i}>{b}</li>)}</ul>
          </div>
          <div className="dp-ba-col dp-ba-after">
            <div className="dp-ba-tag">With Clain</div>
            <ul>{after.map((b, i) => <li key={i}>{b}</li>)}</ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function DeepFAQ({ title, items }) {
  const renderTitleParts = window.renderTitleParts;
  const [open, setOpen] = useStateD(-1);
  return (
    <section className="section">
      <div className="wrap">
        <div className="reveal" style={{display:'grid', gap: 18, maxWidth: 760, marginBottom: 24}}>
          <span className="eyebrow">FAQ</span>
          <h2 className="h-section">{renderTitleParts(title)}</h2>
        </div>
        <div className="dp-faq reveal-children">
          {items.map((it, i) => (
            <div key={i} className={`dp-faq-item ${open === i ? 'open' : ''}`}>
              <button className="dp-faq-q" onClick={() => setOpen(open === i ? -1 : i)}>
                <span>{it.q}</span>
                <span className="dp-faq-mark">{open === i ? '−' : '+'}</span>
              </button>
              {open === i && <div className="dp-faq-a">{it.a}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Quote({ q, who, role, brand }) {
  return (
    <section className="section">
      <div className="wrap">
        <div className="dp-quote reveal">
          <div className="dp-quote-mark">"</div>
          <p className="dp-quote-text">{q}</p>
          <div className="dp-quote-meta">
            <strong>{who}</strong>
            <span>· {role}</span>
            {brand && <span>· {brand}</span>}
          </div>
        </div>
      </div>
    </section>
  );
}

/* =============================================================================
   1. SUPER AGENT PAGE  (autonomous AI resolution agent)
   ============================================================================= */

const SUPER_COPY = {
  eyebrow: "Super Agent",
  hero: {
    title: ["The agent that ", { em: "resolves cases" }, " the way your best operator would."],
    lede: "Clain's Super Agent investigates before it answers. It pulls the order, the payment, the carrier event, the policy and the customer history — then proposes the next-best action with the evidence stapled to it. Your team approves; it executes.",
  },
  metrics: [
    { n: "67%", l: "cases resolved without human edit", s: "measured on production tenants" },
    { n: "4.1s", l: "median draft latency", s: "p95 under 11s, end-to-end" },
    { n: "100%", l: "actions auditable", s: "every step signed and replayable" },
  ],
  pillars: {
    title: ["Built like an analyst,", { em: " not a chatbot" }, "."],
    lede: "Most agents pattern-match the message and guess. Super Agent runs the same investigation a senior operator would — only faster, and with the receipts.",
    items: [
      {
        t: "Reads the message in context",
        d: "Detects intent, urgency, sentiment and the implicit entity. Resolves order/customer/carrier even when the customer mentions none of them by ID.",
        bullets: ["Multi-language out of the box", "Quote-of-the-quote handling", "Forwarded-email lineage preserved"],
      },
      {
        t: "Investigates before drafting",
        d: "Queries your live systems — orders, payments, refunds, returns, fulfilment, knowledge base — and collects evidence. Conflicts (promise vs reality) are surfaced as flags, not buried.",
        bullets: ["Live joins across Shopify · Stripe · carriers", "Per-claim citation with source link", "Conflicts flagged with severity"],
      },
      {
        t: "Plans the action, not just the reply",
        d: "Proposes a chain: refund X · re-ship Y · note Z. Each step shows the policy it falls under, the side effects, and a confidence score. You approve or edit.",
        bullets: ["Multi-step plans with dependencies", "Per-step rollback baked in", "Cost preview before execution"],
      },
      {
        t: "Executes safely with guards",
        d: "Runs each step under your policies and approval rules. High-impact actions require human sign-off; routine ones don't. Everything is signed and replayable.",
        bullets: ["Policy-as-code with dry-run", "Granular per-action permissions", "Cryptographic audit log"],
      },
    ],
  },
  ba: {
    title: ["A real refund-dispute case,", { em: " minute by minute" }, "."],
    lede: "Same case, same data, different operator.",
    before: [
      "Agent opens 4 tabs (helpdesk, Shopify, Stripe, carrier)",
      "Reads back through 11 prior messages to find the SKU",
      "Manually checks if the second parcel ever shipped",
      "Pings #ops on Slack to verify the refund window",
      "Drafts a reply, copies the order ID, hopes for the best",
      "Escalates because the policy isn't clear · 17 minutes elapsed",
    ],
    after: [
      "Super Agent ingests the message, links ORD-7281 automatically",
      "Cross-checks Stripe charge, GLS tracking and refund policy v3.2",
      "Surfaces conflict: parcel 2/2 still in transit, refund not yet eligible",
      "Drafts a holding reply with carrier ETA, schedules a follow-up at 14:00",
      "Plans a conditional refund if tracking ≠ delivered by then",
      "Operator approves the plan in 1 click · 47 seconds elapsed",
    ],
  },
  personas: {
    title: ["Day-1 value for ", { em: "every role" }, "."],
    lede: "A single agent surface, three different jobs done.",
    items: [
      {
        mark: "01",
        name: "Support agents",
        headline: "Your best work, on auto-pilot.",
        body: "Stop re-typing the same investigations. Super Agent gives you a draft reply with citations, so you spend your time on judgement — not data assembly.",
        points: [
          "Draft pre-filled with order, customer and policy context",
          "Inline confidence indicator on every claim",
          "One-click execute on simple cases · approval queue for the rest",
        ],
        stats: [
          { n: "6×", l: "cases per agent / day" },
          { n: "−71%", l: "time gathering context" },
          { n: "+44%", l: "first-contact resolution" },
        ],
      },
      {
        mark: "02",
        name: "Ops & finance",
        headline: "A reviewer, not a typist.",
        body: "Refunds, replacements and goodwill credits run under your policies. You approve exceptions, not the routine. Auditable trace from intake to ledger.",
        points: [
          "Bulk approval with per-case justification",
          "Spend cap and per-customer guards built in",
          "Stripe, ledger and warehouse synced in real time",
        ],
        stats: [
          { n: "−85%", l: "ad-hoc exceptions" },
          { n: "100%", l: "actions reconciled to ledger" },
          { n: "0", l: "double refunds since launch" },
        ],
      },
      {
        mark: "03",
        name: "Heads of CX",
        headline: "Predictability you can plan against.",
        body: "Per-policy success rates, deflection by case type, and quality drift detection. The agent gets better — and you get the data to prove it.",
        points: [
          "Quality scoring on every resolved case",
          "Drift detection on policy compliance",
          "Cohort dashboards for new policies and templates",
        ],
        stats: [
          { n: "−54%", l: "first-response time" },
          { n: "+23pt", l: "CSAT (rolling 90d)" },
          { n: "1/wk", l: "policy iterations · safely" },
        ],
      },
    ],
  },
  feat: {
    title: ["A model-agnostic agent,", { em: " hardened for production" }, "."],
    lede: "Clain runs a tier-aware router across Gemini, Claude and GPT — picks the cheapest model that meets the task's quality bar, falls back when one is degraded, and never sends raw PII to a frontier model without redaction.",
    items: [
      {
        t: "Multi-provider router",
        d: "Routes Fast / Balanced / Heavy tiers across Gemini Flash & Pro, Claude Haiku & Sonnet & Opus, GPT-4o-mini & GPT-4o. Per-task quality bars, automatic fallback on rate limits or outages.",
      },
      {
        t: "PII redaction · in-line",
        d: "Names, addresses, payment data and IDs are tokenised before reaching the model. The drafted reply is re-hydrated client-side. No PII leaves your perimeter unredacted.",
      },
      {
        t: "Deterministic replay",
        d: "Every agent run captures: prompt, retrieved context, model, output, tool calls. Replay any decision after the fact, on the exact data the agent saw.",
      },
      {
        t: "Hallucination guards",
        d: "Citations are required. Numbers without a verifiable source are blocked at the policy layer. Confidence below threshold escalates instead of guessing.",
      },
      {
        t: "Cost telemetry per case",
        d: "Token spend, model used and credit cost are attached to every case. Forecast, budget and chargeback by team or brand.",
      },
      {
        t: "Bring-your-own model",
        d: "On enterprise plans, route specific case types to your fine-tuned model on Bedrock, Vertex or a private endpoint. Same router, same guards.",
      },
    ],
  },
  faq: {
    title: ["Things teams ask before turning it on.", { em: " " }],
    items: [
      { q: "How is this different from a generic AI helpdesk feature?",
        a: "Generic features answer the message. Super Agent investigates the case — reads your live data, runs the policy, plans the action, and only then writes. The work product is a plan with evidence, not a guess." },
      { q: "Will it act without human approval?",
        a: "Only on actions you've explicitly enabled for autonomous execution, under guards (policy, spend cap, customer risk). Every other action queues for human approval and ships with a brief." },
      { q: "What happens if the model is wrong?",
        a: "Hallucinations are blocked by design — claims need citations. If confidence is below the threshold the case escalates with the partial work product. Wrong actions are reversible via the compensate step we attach to every plan." },
      { q: "How long does onboarding take?",
        a: "Two days for a working POC, two weeks for production with policies and audit. We don't replace your helpdesk — we sit on top of it. Your data stays where it is." },
      { q: "Can we use our own LLM?",
        a: "Yes, on Business plans. Route by case type or brand to your fine-tuned model on Vertex, Bedrock or a private endpoint. The router, guards and audit are unchanged." },
      { q: "Where is the data stored?",
        a: "EU by default. Optional residency in US or APAC. Frontier-model calls are PII-redacted before egress. Per-tenant encryption keys on Business." },
    ],
  },
};

function SuperAgentPage({ t, lang }) {
  const c = SUPER_COPY;
  const renderTitleParts = window.renderTitleParts;
  const FinalCTA = window.FinalCTA;
  const FeaturePlaceholder = window.FeaturePlaceholder;
  return (
    <main>
      {/* Hero */}
      <section className="hero wrap reveal" style={{paddingBottom: 32}}>
        <div className="hero-eyebrow-row">
          <span className="eyebrow">{c.eyebrow}</span>
        </div>
        <h1 className="h-display">{renderTitleParts(c.hero.title)}</h1>
        <p className="lede" style={{marginTop: 32, maxWidth: 760, fontSize: 19}}>{c.hero.lede}</p>
      </section>

      {/* Hero metrics */}
      <section className="section" style={{paddingTop: 0}}>
        <div className="wrap">
          <MetricRow items={c.metrics} />
        </div>
      </section>

      {/* Big agent demo placeholder */}
      <section className="section">
        <div className="wrap reveal">
          <div className="dp-demo-card">
            <div className="dp-demo-card-head">
              <span className="dp-demo-tag">Live agent · CASE-4129</span>
              <span className="dp-demo-mono">model: claude-sonnet-4 · cost: 12 credits</span>
            </div>
            <div className="dp-demo-card-body">
              <div className="dp-demo-step">
                <span className="dp-demo-step-mark">01</span>
                <div>
                  <strong>Intake.</strong> Customer says "my second parcel never arrived". No order ID.
                  <span className="dp-demo-aux">↳ resolved ORD-7281 from email + customer profile</span>
                </div>
              </div>
              <div className="dp-demo-step">
                <span className="dp-demo-step-mark">02</span>
                <div>
                  <strong>Investigate.</strong> Pulled Shopify fulfilment, GLS tracking, Stripe charge, refund policy v3.2.
                  <span className="dp-demo-aux">⚠ conflict: parcel 2/2 still in transit, ETA tomorrow 14:00</span>
                </div>
              </div>
              <div className="dp-demo-step">
                <span className="dp-demo-step-mark">03</span>
                <div>
                  <strong>Plan.</strong> Send holding reply with ETA · schedule check at 14:01 · conditional refund of €38.40 if tracking ≠ delivered.
                  <span className="dp-demo-aux">all 3 steps within policy · est. cost €0 if delivered, €38.40 worst case</span>
                </div>
              </div>
              <div className="dp-demo-step">
                <span className="dp-demo-step-mark">04</span>
                <div>
                  <strong>Approve & execute.</strong> Operator approves in 1 click. Reply sent, follow-up scheduled, refund queued.
                  <span className="dp-demo-aux">case closed · 47s end-to-end · audit trail signed</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <Feature3 title={c.pillars.title} lede={c.pillars.lede} items={c.pillars.items} />

      {/* Before/After */}
      <BeforeAfter title={c.ba.title} lede={c.ba.lede} before={c.ba.before} after={c.ba.after} />

      {/* Personas */}
      <PersonaTabs title={c.personas.title} lede={c.personas.lede} personas={c.personas.items} />

      {/* Production-grade features */}
      <Feature3 title={c.feat.title} lede={c.feat.lede} items={c.feat.items} />

      {/* Quote */}
      <Quote
        q="We tried two other agent products before this. Both wrote nice replies. Clain is the first one that actually does the work behind the reply — and shows you what it did."
        who="Sara Kovács"
        role="Head of CX Operations"
        brand="Atlàntica"
      />

      {/* FAQ */}
      <DeepFAQ title={c.faq.title} items={c.faq.items} />

      {FinalCTA && <FinalCTA t={t} />}
    </main>
  );
}

window.SuperAgentPage = SuperAgentPage;

/* =============================================================================
   2. HELPDESK / "HOW CLAIN WORKS" extras  (rendered inside /product)
   ============================================================================= */

const HELPDESK_EXTRAS = {
  hero_metrics: [
    { n: "−54%", l: "first-response time", s: "rolling 90-day average" },
    { n: "+38%", l: "deflected without escalation", s: "across all channels" },
    { n: "1.0", l: "thread per case", s: "down from 2.7 before Clain" },
    { n: "9", l: "native channels", s: "no fragile connectors" },
  ],
  flow: {
    title: ["From inbound to closed,", { em: " in five clean stages" }, "."],
    lede: "Every case in Clain follows the same shape. Predictable inputs, predictable outputs, predictable economics.",
    items: [
      { t: "Capture", d: "Inbound from any channel — email, chat, WhatsApp, voice, forms, webhooks. Lands in the unified inbox with intent and entity already detected." },
      { t: "Enrich", d: "Auto-link to customer, order, payment, fulfilment, return and policy. The case opens with full context, no manual stitching." },
      { t: "Decide", d: "Super Agent proposes the next-best action with evidence. Confidence shown per claim. You see what it would do before it does it." },
      { t: "Execute", d: "Approve, edit or reject. Approved actions run under your policies. Multi-step plans handle dependencies and rollback automatically." },
      { t: "Audit", d: "Every step is signed, replayable and exportable. Build dashboards on top — quality, drift, cost, deflection — in your own warehouse." },
    ],
  },
  personas: {
    title: ["Designed for the ", { em: "whole CX org" }, "."],
    lede: "Same product, three different jobs done. Pick the role you actually have.",
    items: [
      {
        mark: "Agent",
        name: "Front-line agents",
        headline: "Less typing, more deciding.",
        body: "Walk into your shift to a triaged inbox where every case opens with context, a draft reply, and a plan. Your job is judgement — the system handles assembly.",
        points: [
          "Drafts pre-filled with citations",
          "One-click execute on simple cases",
          "Inline policy hints on every action",
        ],
        stats: [
          { n: "6×", l: "cases / agent / day" },
          { n: "−71%", l: "context-gathering time" },
          { n: "+22pt", l: "agent CSAT" },
        ],
      },
      {
        mark: "Lead",
        name: "Team leads",
        headline: "Visibility without micromanagement.",
        body: "Live SLA board, drift detection, per-template performance and a coaching feed built from real cases. Spot patterns, not just incidents.",
        points: [
          "Live SLA board with smart thresholds",
          "Coaching feed with anonymised excerpts",
          "Quality scoring on every resolved case",
        ],
        stats: [
          { n: "−83%", l: "SLA breaches" },
          { n: "+11pt", l: "team-level CSAT" },
          { n: "1/wk", l: "policy iterations" },
        ],
      },
      {
        mark: "Admin",
        name: "Admins & ops",
        headline: "Policies that don't break in production.",
        body: "Write policies in plain English, dry-run them against the last 30 days of cases, then ship. Permissions by role, brand, region, amount and risk.",
        points: [
          "Plain-English → YAML compilation",
          "Dry-run sandbox with historical replay",
          "Per-role · per-brand permissions",
        ],
        stats: [
          { n: "1 day", l: "first policy live" },
          { n: "100%", l: "actions under guard" },
          { n: "0", l: "config rollbacks since launch" },
        ],
      },
    ],
  },
  ba: {
    title: ["What changes in week one.", { em: " " }],
    lede: "Numbers from real tenants on a 30-day rolling window after Clain went live.",
    before: [
      "8 windows open: helpdesk, Shopify, Stripe, carrier, Slack, Notion, Sheets, email",
      "Macros that nobody trusts and everyone edits",
      "Refund logic split between a wiki, an agent's head and a backlog of Linear tickets",
      "SLA breaches found at end-of-day, after the fact",
      "Two weeks of training before a new hire is productive",
    ],
    after: [
      "One workspace, one inbox, one case view with everything attached",
      "Drafts written by an agent that read the same data you would",
      "Policies in version control, dry-runnable against history",
      "SLA breaches predicted, not discovered",
      "New hires productive in two days · same product as the senior team",
    ],
  },
};

function HelpdeskExtras() {
  return (
    <>
      <section className="section" style={{paddingTop: 0}}>
        <div className="wrap">
          <MetricRow items={HELPDESK_EXTRAS.hero_metrics} />
        </div>
      </section>
      <Feature3 title={HELPDESK_EXTRAS.flow.title} lede={HELPDESK_EXTRAS.flow.lede} items={HELPDESK_EXTRAS.flow.items} />
      <BeforeAfter title={HELPDESK_EXTRAS.ba.title} lede={HELPDESK_EXTRAS.ba.lede} before={HELPDESK_EXTRAS.ba.before} after={HELPDESK_EXTRAS.ba.after} />
      <PersonaTabs title={HELPDESK_EXTRAS.personas.title} lede={HELPDESK_EXTRAS.personas.lede} personas={HELPDESK_EXTRAS.personas.items} />
    </>
  );
}

window.HelpdeskExtras = HelpdeskExtras;

/* =============================================================================
   3. INBOX extras  (rendered inside /omnichannel)
   ============================================================================= */

const INBOX_EXTRAS = {
  metrics: [
    { n: "9", l: "channels in one view" },
    { n: "1.0", l: "thread per case (was 2.7)" },
    { n: "−54%", l: "first-response time" },
    { n: "0", l: "duplicates · auto-merged on identity" },
  ],
  feat: {
    title: ["An inbox that ", { em: "does the boring work" }, "."],
    lede: "Triaging, deduping, threading and prioritising — all done before you open the case. You walk into the work, not the housekeeping.",
    items: [
      {
        t: "Identity stitching",
        d: "Same person on email, WhatsApp and chat? Same thread. Identity merges on email, phone, customer ID and signed cookies. Zero duplicate cases.",
      },
      {
        t: "Smart prioritisation",
        d: "Reorders the queue every minute on SLA remaining, customer value, risk and channel SLA. The next case you open is the one most worth opening.",
      },
      {
        t: "Bulk actions that actually scale",
        d: "Refund 142 customers affected by a carrier outage in one move. Each action runs under policy with per-case justification and full audit.",
      },
      {
        t: "Macros that learn",
        d: "Suggests templates from how your senior agents close similar cases. Pre-fills the variables. You hit send.",
      },
      {
        t: "Channel-aware composer",
        d: "Same composer, different rules. WhatsApp templates, voice transcripts, email signatures, chat shortcuts — handled automatically.",
      },
      {
        t: "Permissions that follow the case",
        d: "Brand · region · case type · amount. The right people see the right cases. Sensitive data is masked from the rest.",
      },
    ],
  },
  ba: {
    title: ["The day the channel stopped driving.", { em: " " }],
    lede: "Same volume, different shape.",
    before: [
      "Email queue at 11am: 230 cases · WhatsApp: 84 · chat: 41 · all separate",
      "Customer escalates by switching channel, agent re-asks the same questions",
      "Reports broken down by channel — useful to nobody",
      "Agents know one channel well, fumble the others",
      "Macros maintained per channel, drift between them is permanent",
    ],
    after: [
      "One queue at 11am: 308 cases, sorted by what's actually urgent",
      "Channel-switch is invisible · agent picks up where the last touch left off",
      "Reports by case type, customer value, policy outcome — what you can act on",
      "Same composer, channel-aware. New hires learn one tool, not five.",
      "Macros versioned in one place, dry-runnable, channel-aware on output",
    ],
  },
  faq: {
    title: ["Inbox questions, answered.", { em: " " }],
    items: [
      { q: "Do we have to migrate off Zendesk / Front / Gorgias?",
        a: "No. Clain sits on top via two-way sync. You keep your existing helpdesk as the system of record if you want — Clain becomes the working surface and the brain." },
      { q: "What about voice — does it really work in the same inbox?",
        a: "Calls land as cases with transcript, recording, and key-moment markers. Outbound dial from the case opens via Aircall / Twilio. The audio is not the case — the conversation context is." },
      { q: "How does WhatsApp Business work?",
        a: "Native WABA integration. Approved templates, opt-in management, and 24-hour window awareness handled automatically. Outbound campaigns are policy-gated." },
      { q: "Can different brands or regions have different rules?",
        a: "Yes. Brand · region · case type · amount are first-class dimensions. Permissions, policies, templates and SLAs can all branch on them." },
      { q: "What happens if a channel goes down?",
        a: "Cases keep flowing on the others. The down channel is marked degraded in the inbox header. When it comes back, queued events replay in order." },
    ],
  },
};

function InboxExtras() {
  return (
    <>
      <section className="section" style={{paddingTop: 0}}>
        <div className="wrap">
          <MetricRow items={INBOX_EXTRAS.metrics} />
        </div>
      </section>
      <Feature3 title={INBOX_EXTRAS.feat.title} lede={INBOX_EXTRAS.feat.lede} items={INBOX_EXTRAS.feat.items} />
      <BeforeAfter title={INBOX_EXTRAS.ba.title} lede={INBOX_EXTRAS.ba.lede} before={INBOX_EXTRAS.ba.before} after={INBOX_EXTRAS.ba.after} />
      <DeepFAQ title={INBOX_EXTRAS.faq.title} items={INBOX_EXTRAS.faq.items} />
    </>
  );
}

window.InboxExtras = InboxExtras;
