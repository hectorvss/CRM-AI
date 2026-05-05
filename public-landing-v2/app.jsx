/* global React, ReactDOM, ClainV2 */
/*
 * Landing-v2 router with route-level code splitting.
 *
 * Only shared.js + app.js are loaded eagerly (≈40 KB combined). When the
 * current route resolves, app.js dynamically inserts the matching page
 * script (<script src="/v2/<page>.js">) once. Re-renders happen when the
 * component constructor appears on `window`.
 *
 * For /signin (and the other auth routes) this means the user pays
 * for shared + app + auth ≈ 80 KB instead of ≈1.9 MB across 20 files.
 */
(function () {
  const { useState, useEffect } = React;

  // Map component name → bundle URL. Multiple components can share a bundle
  // (auth.js exports SigninPage, SignupPage, ResetPasswordPage, DemoPage).
  const PAGE_BUNDLES = {
    HomePage:           '/v2/home.js',
    AiAgentPage:        '/v2/ai-agent.js',
    AiAgentSlackPage:   '/v2/ai-agent-slack.js',
    InboxPage:          '/v2/inbox.js',
    OmnichannelPage:    '/v2/omnichannel.js',
    HowItWorksPage:     '/v2/how-it-works.js',
    TicketsPage:        '/v2/tickets.js',
    ReportingPage:      '/v2/reporting.js',
    StartupsPage:       '/v2/startups.js',
    KnowledgePage:      '/v2/knowledge.js',
    PricingPage:        '/v2/pricing.js',
    AllFeaturesPage:    '/v2/all-features.js',
    CopilotPage:        '/v2/copilot.js',
    AgentCustomerPage:  '/v2/agent-customer.js',
    AgentTrustPage:     '/v2/agent-trust.js',
    HowAgentWorksPage:  '/v2/how-agent-works.js',
    TechnologyPage:     '/v2/technology.js',
    SigninPage:         '/v2/auth.js',
    SignupPage:         '/v2/auth.js',
    ResetPasswordPage:  '/v2/auth.js',
    DemoPage:           '/v2/auth.js',
    PaywallPage:        '/v2/paywall.js',
  };

  // Track in-flight loads so we don't insert the same script twice.
  const _bundleLoads = Object.create(null);

  function loadBundle(url) {
    if (_bundleLoads[url]) return _bundleLoads[url];
    _bundleLoads[url] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('failed to load ' + url));
      document.head.appendChild(s);
    });
    return _bundleLoads[url];
  }

  function ensurePageComponent(componentName) {
    if (!componentName) return Promise.resolve(null);
    if (window[componentName]) return Promise.resolve(window[componentName]);
    const url = PAGE_BUNDLES[componentName];
    if (!url) return Promise.resolve(null);
    return loadBundle(url).then(() => window[componentName] || null);
  }

  function findRoute(path) {
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

  function PageLoading() {
    // Stays empty so we don't paint a flash of placeholder UI before the
    // real component arrives. Real bundle loads complete in <200 ms typically.
    return null;
  }

  function App() {
    const [path, setPath]     = useState(window.location.pathname || '/');
    const [Page, setPage]     = useState(() => PageLoading);
    const [, forceTick]       = useState(0);

    // Listen for SPA navigations.
    useEffect(() => {
      function onPop() { setPath(window.location.pathname || '/'); }
      window.addEventListener('popstate', onPop);
      return () => window.removeEventListener('popstate', onPop);
    }, []);

    // Update document title when the path changes.
    useEffect(() => {
      const route = findRoute(path);
      document.title = route ? `Clain — ${route.title}` : 'Clain — Page not found';
    }, [path]);

    // Resolve and lazy-load the page component for the current route.
    useEffect(() => {
      const route = findRoute(path);
      if (!route) { setPage(() => NotFound); return; }
      let cancelled = false;
      // If already on window (warm cache or pre-loaded by hover-prefetch), render immediately.
      const existing = window[route.component];
      if (existing) { setPage(() => existing); return; }
      setPage(() => PageLoading);
      ensurePageComponent(route.component).then((Comp) => {
        if (cancelled) return;
        setPage(() => (Comp || NotFound));
        forceTick((n) => n + 1);
      }).catch(() => {
        if (cancelled) return;
        setPage(() => NotFound);
      });
      return () => { cancelled = true; };
    }, [path]);

    return (
      <ClainV2.AppShell>
        <Page key={path} />
      </ClainV2.AppShell>
    );
  }

  // Optional: prefetch likely-next bundles on idle (signin from home, etc.).
  // Uses requestIdleCallback so it never competes with first paint.
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => {
      const here = window.location.pathname || '/';
      if (here === '/' || here === '/v2/' || here === '/v2') {
        // Most-visited next pages from home.
        ['HomePage'].forEach((n) => {
          const u = PAGE_BUNDLES[n];
          if (u && !window[n]) loadBundle(u).catch(() => {});
        });
      }
    }, { timeout: 2000 });
  }

  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(<App />);
})();
