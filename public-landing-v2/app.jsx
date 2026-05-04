/* global React, ReactDOM, ClainV2,
   HomePage, AiAgentPage, AiAgentSlackPage, InboxPage, OmnichannelPage,
   HowItWorksPage, TicketsPage, ReportingPage, StartupsPage,
   KnowledgePage, PricingPage, CopilotPage, AgentCustomerPage,
   AgentTrustPage, HowAgentWorksPage, TechnologyPage,
   SigninPage, SignupPage, ResetPasswordPage, DemoPage, PaywallPage */
(function () {
  const { useState, useEffect } = React;
  const PAGE_COMPONENTS = {
    HomePage:           typeof HomePage           !== 'undefined' ? HomePage           : null,
    AiAgentPage:        typeof AiAgentPage        !== 'undefined' ? AiAgentPage        : null,
    AiAgentSlackPage:   typeof AiAgentSlackPage   !== 'undefined' ? AiAgentSlackPage   : null,
    InboxPage:          typeof InboxPage          !== 'undefined' ? InboxPage          : null,
    OmnichannelPage:    typeof OmnichannelPage    !== 'undefined' ? OmnichannelPage    : null,
    HowItWorksPage:     typeof HowItWorksPage     !== 'undefined' ? HowItWorksPage     : null,
    TicketsPage:        typeof TicketsPage        !== 'undefined' ? TicketsPage        : null,
    ReportingPage:      typeof ReportingPage      !== 'undefined' ? ReportingPage      : null,
    StartupsPage:       typeof StartupsPage       !== 'undefined' ? StartupsPage       : null,
    KnowledgePage:      typeof KnowledgePage      !== 'undefined' ? KnowledgePage      : null,
    PricingPage:        typeof PricingPage        !== 'undefined' ? PricingPage        : null,
    CopilotPage:        typeof CopilotPage        !== 'undefined' ? CopilotPage        : null,
    AgentCustomerPage:  typeof AgentCustomerPage  !== 'undefined' ? AgentCustomerPage  : null,
    AgentTrustPage:     typeof AgentTrustPage     !== 'undefined' ? AgentTrustPage     : null,
    HowAgentWorksPage:  typeof HowAgentWorksPage  !== 'undefined' ? HowAgentWorksPage  : null,
    TechnologyPage:     typeof TechnologyPage     !== 'undefined' ? TechnologyPage     : null,
    SigninPage:         typeof SigninPage         !== 'undefined' ? SigninPage         : null,
    SignupPage:         typeof SignupPage         !== 'undefined' ? SignupPage         : null,
    ResetPasswordPage:  typeof ResetPasswordPage  !== 'undefined' ? ResetPasswordPage  : null,
    DemoPage:           typeof DemoPage           !== 'undefined' ? DemoPage           : null,
    PaywallPage:        typeof PaywallPage        !== 'undefined' ? PaywallPage        : null,
  };

  function findRoute(path) {
    // Strip the local dev `/v2` prefix (vercel.json rewrites strip this in
    // production; locally the server mounts the landing under `/v2/`).
    let p = path.replace(/^\/v2(\/|$)/, '/') || '/';
    if (p !== '/') p = p.replace(/\/+$/, '');
    return ClainV2.ROUTES.find((r) => r.path === p) || null;
  }

  function NotFound() {
    return (
      <section className="section">
        <div className="container" style={{ textAlign: 'center', padding: '120px 20px' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 96, fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1 }}>404</div>
          <h2 className="h-section mt-4">This page doesn't exist</h2>
          <p className="lede mt-2" style={{ margin: '16px auto 32px' }}>
            The page you're looking for might have moved or never existed in the first place.
          </p>
          <a data-spa href="/" className="btn btn-primary">Back to home</a>
        </div>
      </section>
    );
  }

  function App() {
    const [path, setPath] = useState(window.location.pathname || '/');

    useEffect(() => {
      function onPop() { setPath(window.location.pathname || '/'); }
      window.addEventListener('popstate', onPop);
      return () => window.removeEventListener('popstate', onPop);
    }, []);

    useEffect(() => {
      const route = findRoute(path);
      document.title = route ? `Clain — ${route.title}` : 'Clain — Page not found';
    }, [path]);

    const route = findRoute(path);
    let Page;
    if (!route) {
      Page = NotFound;
    } else {
      Page = PAGE_COMPONENTS[route.component] || NotFound;
    }

    return (
      <ClainV2.AppShell>
        <Page key={path} />
      </ClainV2.AppShell>
    );
  }

  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(<App />);
})();
