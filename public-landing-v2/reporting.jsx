/* global React, ClainV2 */
(function () {
  const { Pill, MockScreen, LogoStrip, FinalCTA, SectionHeader, PageShell } = ClainV2;

  function ReportingPage() {
    return (
      <PageShell>
        <section className="hero">
          <div className="container">
            <Pill>Reporting</Pill>
            <h1 className="h-display">Get instant insights<br />with AI reporting and analysis</h1>
            <p className="lede">
              Pre-built dashboards, custom reports, and AI-driven insights — so your team always knows what's working and what's broken.
            </p>
            <div className="hero-actions">
              <a href="#" className="btn btn-primary">Explore reports</a>
              <a href="#" className="btn btn-secondary">Talk to sales</a>
            </div>
            <div className="hero-visual hero-frame">
              <MockScreen wide label="Reporting dashboard with AI charts" />
            </div>
          </div>
        </section>

        <LogoStrip label="Reporting that 25,000+ teams trust to run their support ops" />

        {/* ── Pre-built reports, faster insights ──────────────── */}
        <section className="section section-cream">
          <div className="container">
            <SectionHeader
              eyebrow="Out of the box"
              title="Pre-built reports, faster insights, better decisions"
              center
            />
            <div className="grid grid-3">
              {[
                { t: 'Volume', d: 'Conversations, tickets and channels at a glance' },
                { t: 'Performance', d: 'CSAT, FRT, ART, resolution rate per team and per agent' },
                { t: 'AI Agent', d: 'Containment, deflection, escalation, satisfaction' },
              ].map((c) => (
                <div key={c.t} className="card">
                  <h3 className="card-title">{c.t}</h3>
                  <p>{c.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Get insights faster with ready-made reports ──────── */}
        <section className="section">
          <div className="container">
            <div className="feature-split">
              <div>
                <div className="feature-eyebrow">Ready-made</div>
                <h3 className="feature-title">Get insights faster with ready-made reports</h3>
                <p className="feature-body">
                  Dozens of pre-built dashboards covering volume, productivity, customer satisfaction, AI Agent performance and more.
                </p>
              </div>
              <MockScreen wide label="Pre-built dashboards selector" />
            </div>
          </div>
        </section>

        {/* ── Make every report your own ──────────────────────── */}
        <section className="section section-cream">
          <div className="container">
            <div className="feature-split reverse">
              <div>
                <div className="feature-eyebrow">Customization</div>
                <h3 className="feature-title">Make every report your own with deep customization</h3>
                <p className="feature-body">
                  Build custom dashboards with drag-and-drop charts, filters, breakdowns and formulas. Save, share and schedule with your team.
                </p>
                <ul className="bullet-list">
                  <li>Drag-and-drop dashboard builder</li>
                  <li>Custom charts, filters, formulas</li>
                  <li>Schedule delivery to email or Slack</li>
                </ul>
              </div>
              <MockScreen wide label="Dashboard builder" />
            </div>
          </div>
        </section>

        {/* ── See the details behind the data ─────────────────── */}
        <section className="section">
          <div className="container">
            <div className="feature-split">
              <div>
                <div className="feature-eyebrow">Drill-down</div>
                <h3 className="feature-title">See the details behind the data</h3>
                <p className="feature-body">
                  Click any chart to drill into the underlying conversations, customers and timestamps. From metric to a single message in two clicks.
                </p>
              </div>
              <MockScreen wide label="Drill-down detail view" />
            </div>
          </div>
        </section>

        {/* ── Organize, export and control access ─────────────── */}
        <section className="section section-cream">
          <div className="container">
            <div className="feature-split reverse">
              <div>
                <div className="feature-eyebrow">Governance</div>
                <h3 className="feature-title">Organize, export, and control access to all your data</h3>
                <p className="feature-body">
                  Folder-level permissions, scheduled exports, public links with PII redaction, and per-team data scopes — built for the enterprise.
                </p>
              </div>
              <MockScreen wide label="Permissions and exports panel" />
            </div>
          </div>
        </section>

        {/* ── 60+ improvements ────────────────────────────────── */}
        <section className="section">
          <div className="container">
            <SectionHeader
              eyebrow="Constantly improving"
              title="Over 60 improvements to the helpdesk you use everyday"
              center
            />
            <div className="grid grid-4">
              {[
                { t: 'Reporting' }, { t: 'Custom apps' }, { t: 'Data foundation' }, { t: 'And many more' },
              ].map((b) => (
                <div key={b.t} className="card">
                  <h3 className="card-title">{b.t}</h3>
                  <p>New capabilities and refinements every release.</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Spot gaps and refine your support ───────────────── */}
        <section className="section section-cream">
          <div className="container container-narrow">
            <SectionHeader title="Spot gaps and refine your support with smarter reporting" center />
            <div className="quote" style={{ maxWidth: 800, margin: '0 auto' }}>
              "Taking a job knowledge inbox-from-scratch reporting features was like a wave we had to expect inappropriate to come from a support experience will be powerful for arming managers' growth as well as for ranking what's most important to refine."
              <div className="quote-author">
                <div className="quote-author-avatar" />
                <div>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>James Hill</div>
                  <div>Head of Support Ops, Polymarket</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <FinalCTA
          title="Turn insights into action. Get started today."
          subtitle="Try Clain Reporting free for 14 days. No credit card required."
          primary="Start free trial"
          secondary="Book a demo"
          variant="cream"
        />
      </PageShell>
    );
  }

  window.ReportingPage = ReportingPage;
})();
