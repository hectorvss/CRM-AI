/* global React, ReactDOM, ClainV2,
   HomePage, AiAgentPage, AiAgentSlackPage, InboxPage, OmnichannelPage,
   HowItWorksPage, TicketsPage, ReportingPage, StartupsPage */
(function () {
  const { useState, useEffect } = React;
  const PAGE_COMPONENTS = {
    HomePage,
    AiAgentPage,
    AiAgentSlackPage,
    InboxPage,
    OmnichannelPage,
    HowItWorksPage,
    TicketsPage,
    ReportingPage,
    StartupsPage,
  };

  function findRoute(path) {
    // Strip trailing slash except root
    const p = path === '/' ? path : path.replace(/\/+$/, '');
    return ClainV2.ROUTES.find((r) => r.path === p) || null;
  }

  function NotFound() {
    return (
      <ClainV2.PageShell>
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
      </ClainV2.PageShell>
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
    if (!route) return <NotFound />;
    const Component = PAGE_COMPONENTS[route.component];
    if (!Component) return <NotFound />;
    return <Component />;
  }

  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(<App />);
})();
