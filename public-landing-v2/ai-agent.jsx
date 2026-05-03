/* global React, ClainV2 */
(function () {
  const { Pill, MockScreen, LogoStrip, FinalCTA, SectionHeader, PageShell } = ClainV2;

  function AiAgentPage() {
    return (
      <PageShell navVariant="dark">
        <section className="section section-dark" style={{ paddingTop: 80, paddingBottom: 64 }}>
          <div className="container" style={{ textAlign: 'center' }}>
            <Pill>The #1 AI Agent</Pill>
            <h1 className="h-display" style={{ color: '#fff' }}>
              The #1 AI Agent for<br />all your customer service
            </h1>
            <p className="lede" style={{ color: 'var(--text-on-dark-2)', margin: '20px auto 32px' }}>
              The autonomous AI Agent that resolves the most complex customer queries on every channel.
            </p>
            <div className="hero-actions">
              <a href="/signup" className="btn btn-primary">Try AI Agent</a>
              <a href="/demo" className="btn btn-secondary">See it in action</a>
            </div>
          </div>
        </section>
        <LogoStrip label="Trusted by 25,000+ teams worldwide" />
        <FinalCTA
          title="Get started with the #1 AI Agent today"
          subtitle="Join thousands of teams resolving customer queries instantly with Clain."
          primary="Try AI Agent"
          secondary="Book a demo"
          variant="dark"
        />
      </PageShell>
    );
  }

  window.AiAgentPage = AiAgentPage;
})();
