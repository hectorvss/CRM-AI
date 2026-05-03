/* global React, ClainV2 */
(function () {
  const { Pill, MockScreen, LogoStrip, FinalCTA, SectionHeader, FAQ, PageShell } = ClainV2;

  function StartupsPage() {
    return (
      <PageShell>
        {/* ── Hero with offer ─────────────────────────────────── */}
        <section style={{ paddingTop: 80, paddingBottom: 48, background: 'linear-gradient(180deg, #BFD9F0 0%, #DCE9F4 60%, var(--bg-cream-warm) 100%)' }}>
          <div className="container">
            <div className="feature-split">
              <div>
                <Pill>Early Stage Program</Pill>
                <h1 className="h-display" style={{ marginBottom: 20 }}>
                  Startups get <span className="hl-yellow">90% off</span> Clain<br />+ 1 year of Fin free
                </h1>
                <p className="lede">
                  Startups get 90% off the only complete platform for perfect customer service — Fin AI Agent and Clain Helpdesk. Includes 300 free Fin resolutions per month, so you can deliver exceptional customer experiences at a reasonable cost.
                </p>
                <div className="hero-actions" style={{ marginBottom: 0 }}>
                  <a href="#" className="btn btn-primary">Apply now</a>
                </div>
              </div>
              <div>
                <MockScreen wide label="Fin in action — chat resolution" />
              </div>
            </div>
          </div>
        </section>

        <LogoStrip label="Join 10,000+ fast-growing startups using Clain" />

        {/* ── Save year on year ───────────────────────────────── */}
        <section className="section">
          <div className="container">
            <SectionHeader title="Save year on year" center />
            <div className="grid grid-3">
              {[
                { y: 'Year 1', d: '93% discount', body: 'For the 1st year with 300 free Fin resolutions per month and 15 free Fin qualifications per month. Phone, SMS and WhatsApp are charged at list rates.' },
                { y: 'Year 2', d: '50% discount', body: 'For the 2nd year with 100 free Fin resolutions per month and 5 free Fin qualifications per month. Phone, SMS and WhatsApp are charged at list rates.' },
                { y: 'Year 3', d: '25% discount', body: 'For the 3rd year — with 75 free Fin resolutions per month and 5 Fin qualifications per month. Phone, SMS and WhatsApp are charged at list rates.' },
              ].map((y) => (
                <div key={y.y} className="card">
                  <div className="label" style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>{y.y}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 600, letterSpacing: '-0.025em', margin: '8px 0' }}>
                    <span className="hl-yellow">{y.d}</span>
                  </div>
                  <p>{y.body}</p>
                  <a href="#" className="feature-link" style={{ marginTop: 8 }}>View pricing →</a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Highest performing AI Agent ─────────────────────── */}
        <section className="section section-cream">
          <div className="container">
            <SectionHeader
              eyebrow="The advantage"
              title="The highest-performing AI Agent natively integrated with the Clain Helpdesk"
              center
            />
            <div className="feature-split">
              <MockScreen tall label="AI Agent on a phone" />
              <div>
                <h3 className="feature-title">Fin AI Agent</h3>
                <p className="feature-body">
                  Fin resolves everything from simple queries to complex, across all your channels. Fin handles complex cases at all levels, making routine improvements possible in minutes, and watches performance metrics improve.
                </p>
                <h3 className="feature-title" style={{ marginTop: 32 }}>Helpdesk</h3>
                <p className="feature-body">
                  An advanced helpdesk for your team with the bottom-line winning capabilities of agents to work on, an inbox visibility across our experience, with native conversations across all teams and apps in the same workplace.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Eligibility requirements ────────────────────────── */}
        <section className="section">
          <div className="container">
            <SectionHeader title="Eligibility requirements" center />
            <div className="grid grid-3">
              <div className="card">
                <div className="label" style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 12 }}>Early stage</div>
                <h3 className="card-title">Up to <span className="hl-yellow">$10M</span> in funding</h3>
              </div>
              <div className="card">
                <div className="label" style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 12 }}>Small team</div>
                <h3 className="card-title">Fewer than <span className="hl-yellow">15 employees</span></h3>
              </div>
              <div className="card">
                <div className="label" style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 12 }}>New customer</div>
                <h3 className="card-title">Not currently a <span className="hl-yellow">Clain</span> customer</h3>
              </div>
            </div>
          </div>
        </section>

        {/* ── Customer testimonial purple block ───────────────── */}
        <section className="section section-cream">
          <div className="container container-narrow">
            <div className="quote quote-purple" style={{ maxWidth: 880, margin: '0 auto', textAlign: 'center' }}>
              "My perception of what Clain could do completely changed. It went from being just another bot to something we could trust — smart enough to learn fast, pick up nuance, and deliver accurate answers."
              <div className="quote-author" style={{ justifyContent: 'center' }}>
                <div className="quote-author-avatar" />
                <div>
                  <div style={{ color: '#fff', fontWeight: 600 }}>Hilary Dudek</div>
                  <div>Head of Customer Experience, Gamma</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── It's official: Fin is the best AI agent ─────────── */}
        <section className="section">
          <div className="container">
            <div className="card" style={{ padding: 48, background: 'var(--bg-white)' }}>
              <div className="feature-split">
                <div>
                  <h3 className="feature-title">It's official: Fin is the best AI agent on the market</h3>
                  <p className="feature-body">
                    In G2's most recent User Satisfaction Ratings for Customer Service, Clain ranked highest across the board, based on 19,800+ reviews from real customers.
                  </p>
                  <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                    <a href="#" className="btn btn-primary">Read the G2 report</a>
                    <a href="#" className="btn btn-secondary">Read 5,000+ reviews</a>
                  </div>
                </div>
                <div>
                  {[
                    { brand: 'Fin by Clain', score: 89, highlight: true },
                    { brand: 'Zendesk AI Agent', score: 59 },
                    { brand: 'Decagon', score: 54 },
                    { brand: 'Forethought', score: 40 },
                    { brand: 'Ada', score: 33 },
                  ].map((row) => (
                    <div key={row.brand} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 48px', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                      <strong style={{ fontSize: 14 }}>{row.brand}</strong>
                      <div style={{ background: 'var(--bg-cream-soft)', borderRadius: 999, height: 12, overflow: 'hidden' }}>
                        <div style={{ width: `${row.score}%`, height: '100%', background: row.highlight ? 'var(--accent-blue)' : 'var(--border-soft)', borderRadius: 999 }} />
                      </div>
                      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 14 }}>{row.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQs (dark background) ──────────────────────────── */}
        <section className="section section-dark">
          <div className="container">
            <SectionHeader title="FAQs" eyebrow="Questions" center dark />
            <div style={{ maxWidth: 800, margin: '0 auto' }}>
              <FAQ items={[
                { q: 'What does the Clain Early Stage Program cover?', a: 'Welcome to the best AI-first Helpdesk! Save 90% off for your first year, 50% off in your second year, and 25% off in your third year. Your Early Stage plan includes the following: AI Agent (300 free resolutions/month), 6 free seats, 18 free seats (Pro and above subscription), and Pro-level support (Pro: 300 messages per month).' },
                { q: 'How much does Fin AI Agent cost?', a: '$0.99 per resolution, paid only for conversations the AI Agent actually closes. No commitment.' },
                { q: 'What happens after the first year?', a: 'You move to Year 2 pricing — 50% off — automatically. No renewal action required from you.' },
                { q: 'What if we hire more than 15 employees?', a: 'You stay on the program through your full 3-year term. The 15-employee cap only applies at the time of application.' },
                { q: 'How can I become a partner and offer this discount to my portfolio companies?', a: 'Partner programs are available for VCs and accelerators. Reach out to our partner team to learn more.' },
              ]} />
            </div>
          </div>
        </section>

        {/* ── Other helpful resources ─────────────────────────── */}
        <section className="section">
          <div className="container">
            <SectionHeader title="Other helpful resources" center />
            <div className="grid grid-4">
              {[
                { n: '01', t: 'Exclusive deals on startup tools', d: 'Hand-picked perks from our network of partners.' },
                { n: '02', t: 'Early Stage Academy', d: 'Curated guides for the founder-CX-led journey.' },
                { n: '03', t: 'Inside the Clain Blog', d: 'Real founder stories and operator playbooks.' },
                { n: '04', t: 'Clain Community', d: 'Join the conversation with founders and operators.' },
              ].map((r) => (
                <div key={r.n} className="card">
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em' }}>{r.n}</div>
                  <h3 className="card-title">{r.t}</h3>
                  <p>{r.d}</p>
                  <a href="#" className="feature-link">Learn more →</a>
                </div>
              ))}
            </div>
          </div>
        </section>

        <FinalCTA
          title="Get started with our Early Stage Program today"
          subtitle="Apply now — most startups are approved within 24 hours."
          primary="Apply now"
          secondary="Talk to sales"
          variant="cream"
        />
      </PageShell>
    );
  }

  window.StartupsPage = StartupsPage;
})();
