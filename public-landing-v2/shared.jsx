/* global React */
/* ─────────────────────────────────────────────────────────────────────
   Shared primitives for the v2 landing.
   Exposes globals on window.ClainV2 so each page module can import them.
   ───────────────────────────────────────────────────────────────────── */

(function () {
  const { useState, useEffect } = React;

  // ── Routes catalogue ─────────────────────────────────────────────
  const ROUTES = [
    { path: '/',                title: 'Home',           component: 'HomePage' },
    { path: '/ai-agent',        title: 'AI Agent',       component: 'AiAgentPage' },
    { path: '/ai-agent/slack',  title: 'AI Agent · Slack', component: 'AiAgentSlackPage' },
    { path: '/inbox',           title: 'Inbox',          component: 'InboxPage' },
    { path: '/omnichannel',     title: 'Omnichannel',    component: 'OmnichannelPage' },
    { path: '/how-it-works',    title: 'How Clain works', component: 'HowItWorksPage' },
    { path: '/tickets',         title: 'Tickets',        component: 'TicketsPage' },
    { path: '/reporting',       title: 'Reporting',      component: 'ReportingPage' },
    { path: '/startups',        title: 'Startups',       component: 'StartupsPage' },
  ];

  function navigate(path) {
    if (window.location.pathname === path) return;
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  // Intercept anchor clicks to use SPA navigation for internal routes
  function useSpaLinks() {
    useEffect(() => {
      function onClick(e) {
        const a = e.target.closest && e.target.closest('a[data-spa]');
        if (!a) return;
        const href = a.getAttribute('href');
        if (!href || href.startsWith('http') || href.startsWith('mailto:')) return;
        e.preventDefault();
        navigate(href);
      }
      document.addEventListener('click', onClick);
      return () => document.removeEventListener('click', onClick);
    }, []);
  }

  // ── Logo ─────────────────────────────────────────────────────────
  function Logo() {
    return (
      <a data-spa href="/" className="nav-logo">
        <span className="nav-logo-dot" />
        Clain
      </a>
    );
  }

  // ── Nav ──────────────────────────────────────────────────────────
  // Single source of truth: which pages are actually built and live.
  // Only these slugs are linkable from the nav.
  const BUILT_PAGES = new Set([
    '/',              // home
    '/inbox',
    '/omnichannel',
    '/how-it-works',
    '/ai-agent',
    '/ai-agent/slack',
    // Will be added as extraction completes:
    // '/tickets', '/reporting', '/startups',
  ]);

  function ifBuilt(slug, fallback = null) {
    return BUILT_PAGES.has(slug) ? slug : fallback;
  }

  const PRODUCT_MENU_ALL = {
    about: [
      { slug: '/how-it-works', icon: '◧', name: 'How Clain works',          desc: 'A modern, AI-native helpdesk' },
      { slug: '/ai-agent',     icon: '✦', name: 'Includes Fin AI Agent',    desc: '#1 AI Agent for customer service' },
      { slug: '/omnichannel',  icon: '▥', name: 'Works with all channels',  desc: 'Phone, email, and live chat' },
    ],
    featured: [
      { slug: '/inbox',           name: 'Inbox' },
      { slug: '/tickets',         name: 'Tickets' },
      { slug: '/reporting',       name: 'Reporting' },
      { slug: '/ai-agent/slack',  name: 'AI Agent for Slack' },
    ],
  };

  // Filter to only show pages we have
  const PRODUCT_MENU = {
    about:    PRODUCT_MENU_ALL.about.filter(i => BUILT_PAGES.has(i.slug)),
    featured: PRODUCT_MENU_ALL.featured.filter(i => BUILT_PAGES.has(i.slug)),
  };

  function NavDropdownProduct({ open }) {
    if (!open) return null;
    return (
      <div className="nav-dd">
        <div className="nav-dd-grid">
          <div className="nav-dd-col">
            <div className="nav-dd-eyebrow">About Clain</div>
            <ul className="nav-dd-list nav-dd-list-icons">
              {PRODUCT_MENU.about.map((item) => (
                <li key={item.slug}>
                  <a data-spa href={item.slug} className="nav-dd-item-icon">
                    <span className="nav-dd-icon">{item.icon}</span>
                    <span>
                      <strong>{item.name}</strong>
                      <em>{item.desc}</em>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div className="nav-dd-col">
            <div className="nav-dd-eyebrow">Featured capabilities</div>
            <ul className="nav-dd-list">
              {PRODUCT_MENU.featured.map((item) => (
                <li key={item.slug}>
                  <a data-spa href={item.slug} className="nav-dd-item">{item.name}</a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  function NavDropdownResources({ open }) {
    if (!open) return null;
    return (
      <div className="nav-dd">
        <div className="nav-dd-grid nav-dd-grid-1">
          <div className="nav-dd-col">
            <div className="nav-dd-eyebrow">Resources</div>
            <ul className="nav-dd-list nav-dd-list-icons">
              {RESOURCES_MENU.map((item) => (
                <li key={item.slug}>
                  <a href={item.slug} className="nav-dd-item-icon">
                    <span className="nav-dd-icon">◇</span>
                    <span>
                      <strong>{item.name}</strong>
                      <em>{item.desc}</em>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  function Nav({ variant = 'light', cta = 'Start free trial', secondary = 'Contact sales' }) {
    const [scrolled, setScrolled] = useState(false);
    const [openMenu, setOpenMenu] = useState(null); // 'product' | 'resources' | null

    useEffect(() => {
      function onScroll() { setScrolled(window.scrollY > 8); }
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
      return () => window.removeEventListener('scroll', onScroll);
    }, []);

    useEffect(() => {
      function onClickOutside(e) {
        if (!e.target.closest('.nav-shell')) setOpenMenu(null);
      }
      function onEsc(e) { if (e.key === 'Escape') setOpenMenu(null); }
      document.addEventListener('mousedown', onClickOutside);
      document.addEventListener('keydown', onEsc);
      return () => {
        document.removeEventListener('mousedown', onClickOutside);
        document.removeEventListener('keydown', onEsc);
      };
    }, []);

    const isDark = variant === 'dark';
    const toggle = (name) => setOpenMenu(openMenu === name ? null : name);

    return (
      <header className={`nav-shell${scrolled ? ' is-scrolled' : ''}${isDark ? ' dark' : ''}${openMenu ? ' has-open-menu' : ''}`}>
        <div className="nav-inner">
          <Logo />
          <nav>
            <ul className="nav-links hide-mobile">
              <li className={`nav-link-wrap${openMenu === 'product' ? ' is-open' : ''}`}>
                <button type="button" className="nav-link nav-link-trigger" onClick={() => toggle('product')}>
                  Product <span className="nav-caret">▾</span>
                </button>
                <NavDropdownProduct open={openMenu === 'product'} />
              </li>
              <li><a href="#pricing" className="nav-link">Pricing</a></li>
            </ul>
          </nav>
          <div className="nav-actions">
            <a href="/signin" className="nav-link hide-mobile">Log in</a>
            <a href="/demo" className="nav-link hide-mobile">{secondary}</a>
            <a href="/signup" className="btn btn-primary">{cta}</a>
            <a data-spa href="/ai-agent" className="btn btn-secondary hide-mobile nav-cta-arrow">Fin AI Agent <span aria-hidden="true">→</span></a>
          </div>
        </div>
      </header>
    );
  }

  // ── Footer ───────────────────────────────────────────────────────
  function Footer() {
    const cols = [
      {
        title: 'Product',
        links: ['AI Agent', 'Inbox', 'Tickets', 'Omnichannel', 'Reporting', 'How it works'],
      },
      {
        title: 'Plans',
        links: ['Pricing', 'Startups program', 'Enterprise', 'For agencies'],
      },
      {
        title: 'Resources',
        links: ['Help center', 'Academy', 'Blog', 'Community', 'API reference'],
      },
      {
        title: 'Company',
        links: ['About', 'Careers', 'Customers', 'Contact', 'Trust & security'],
      },
    ];
    return (
      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-col">
              <Logo />
              <p className="text-secondary mt-2" style={{ fontSize: 14, lineHeight: 1.55, maxWidth: 280 }}>
                The only helpdesk designed for the AI Agent era. Build customer experiences that actually scale.
              </p>
            </div>
            {cols.map((c) => (
              <div className="footer-col" key={c.title}>
                <h5>{c.title}</h5>
                <ul>
                  {c.links.map((l) => <li key={l}><a href="#">{l}</a></li>)}
                </ul>
              </div>
            ))}
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} Clain. All rights reserved.</span>
            <span>Made for the AI agent era</span>
          </div>
        </div>
      </footer>
    );
  }

  // ── Logo strip (customer logos) ──────────────────────────────────
  function LogoStrip({ label = 'Used by ambitious teams shipping faster customer service' }) {
    const logos = ['Lovable', 'Synthesia', 'ChatPRD', 'Gamma', 'Polymarket', 'Chess.com'];
    return (
      <section className="logo-strip">
        <div className="container">
          <div className="logo-strip-label">{label}</div>
          <div className="logo-strip-row">
            {logos.map(l => <span key={l}>{l}</span>)}
          </div>
        </div>
      </section>
    );
  }

  // ── Pill badge ───────────────────────────────────────────────────
  function Pill({ children, dot = true }) {
    return (
      <span className="pill">
        {dot && <span className="pill-dot" />}
        {children}
      </span>
    );
  }

  // ── Mock screen (placeholder for product UI) ─────────────────────
  function MockScreen({ children, label = 'Product UI', tall = false, square = false, wide = false, style }) {
    const cls = ['mock'];
    if (tall) cls.push('mock-tall');
    if (square) cls.push('mock-square');
    if (wide) cls.push('mock-wide');
    return (
      <div className={cls.join(' ')} style={style}>
        <div className="mock-bar" style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          <span className="mock-dot" />
          <span className="mock-dot" />
          <span className="mock-dot" />
        </div>
        <div style={{ marginTop: 32, padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          {children || label}
        </div>
      </div>
    );
  }

  // ── Mock inbox preview (used in hero of multiple pages) ──────────
  function MockInbox() {
    return (
      <div className="mock" style={{ aspectRatio: '16 / 9', padding: 0 }}>
        <div className="mock-bar">
          <span className="mock-dot" />
          <span className="mock-dot" />
          <span className="mock-dot" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 280px', height: 'calc(100% - 32px)', textAlign: 'left' }}>
          <div style={{ borderRight: '1px solid var(--border-subtle)', padding: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Inbox</div>
            {['All open · 124', 'Mentions', 'Assigned to me', 'Unassigned', 'Snoozed', 'Closed'].map((x) => (
              <div key={x} style={{ padding: '6px 8px', borderRadius: 6, marginBottom: 2 }}>{x}</div>
            ))}
          </div>
          <div style={{ borderRight: '1px solid var(--border-subtle)', padding: 0 }}>
            {[
              { name: 'Alex Reeves', msg: "Where's my refund for order #41204?", time: '2m' },
              { name: 'Maria Chen', msg: 'Subscription renewal failed — card declined', time: '14m' },
              { name: 'James Patel', msg: 'Can I switch plan mid-billing cycle?', time: '1h' },
              { name: 'Sofia Romero', msg: 'Order arrived damaged — see photos attached', time: '3h' },
            ].map((c, i) => (
              <div key={i} style={{ padding: 12, borderBottom: '1px solid var(--border-subtle)', fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{c.name}</strong>
                  <span style={{ color: 'var(--text-muted)' }}>{c.time}</span>
                </div>
                <div style={{ color: 'var(--text-secondary)' }}>{c.msg}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: 16, fontSize: 12 }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Customer context</div>
            <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <div><strong>Alex Reeves</strong></div>
              <div>alex@example.com</div>
              <div style={{ marginTop: 8 }}>3 open · 12 closed</div>
              <div style={{ marginTop: 12, padding: 8, background: 'var(--bg-cream-soft)', borderRadius: 6 }}>
                <strong style={{ color: 'var(--text-primary)' }}>AI suggestion</strong>
                <div style={{ marginTop: 4 }}>Refund eligible per policy. Suggest issuing $42.10 to original card.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Final CTA gradient ───────────────────────────────────────────
  function FinalCTA({
    title = 'Get started with Clain today',
    subtitle = 'Join thousands of teams already delivering AI-powered customer service.',
    primary = 'Try for free',
    secondary = 'Talk to sales',
    variant = 'dark', // dark | cream
  }) {
    return (
      <section style={{ background: 'var(--bg-cream-warm)' }}>
        <div className={`final-cta ${variant === 'cream' ? 'final-cta-cream' : ''}`}>
          <h2>{title}</h2>
          <p style={{ fontSize: 17, opacity: 0.85, maxWidth: 600, margin: '0 auto', lineHeight: 1.5 }}>{subtitle}</p>
          <div className="final-cta-actions">
            <a href="/signup" className="btn btn-primary">{primary}</a>
            <a href="/demo" className="btn btn-secondary" style={{ borderColor: variant === 'cream' ? 'rgba(2,9,23,0.15)' : 'rgba(255,255,255,0.25)', background: 'transparent', color: variant === 'cream' ? 'var(--text-primary)' : '#fff' }}>{secondary}</a>
          </div>
        </div>
      </section>
    );
  }

  // ── FAQ list ─────────────────────────────────────────────────────
  function FAQ({ items = [] }) {
    const [open, setOpen] = useState(null);
    return (
      <div>
        {items.map((it, i) => (
          <div key={i} className={`faq-item${open === i ? ' open' : ''}`} onClick={() => setOpen(open === i ? null : i)}>
            <div className="faq-q">
              <span>{it.q}</span>
              <span className="faq-toggle">+</span>
            </div>
            <div className="faq-a">{it.a}</div>
          </div>
        ))}
      </div>
    );
  }

  // ── Section eyebrow + title block ────────────────────────────────
  function SectionHeader({ eyebrow, title, lede, center = false, dark = false, maxWidth = 720 }) {
    return (
      <div style={{ textAlign: center ? 'center' : 'left', marginBottom: 48, maxWidth: center ? maxWidth : '100%', marginLeft: center ? 'auto' : 0, marginRight: center ? 'auto' : 0 }}>
        {eyebrow && <div className="h-eyebrow" style={{ marginBottom: 16 }}>{eyebrow}</div>}
        {title && <h2 className="h-section">{title}</h2>}
        {lede && <p className="lede mt-2" style={{ marginLeft: center ? 'auto' : 0, marginRight: center ? 'auto' : 0 }}>{lede}</p>}
      </div>
    );
  }

  // ── Stats row ────────────────────────────────────────────────────
  function StatsRow({ items }) {
    return (
      <div className="stats-row">
        {items.map((s, i) => (
          <div key={i} className="stat">
            <div className="num">{s.num}</div>
            <div className="label">{s.label}</div>
          </div>
        ))}
      </div>
    );
  }

  // ── Page wrapper (consistent vertical rhythm) ────────────────────
  function PageShell({ children, navVariant = 'light' }) {
    useSpaLinks();
    useEffect(() => { window.scrollTo(0, 0); }, []);
    return (
      <>
        <Nav variant={navVariant} />
        {children}
        <Footer />
      </>
    );
  }

  window.ClainV2 = {
    ROUTES,
    navigate,
    useSpaLinks,
    Nav,
    Footer,
    Logo,
    LogoStrip,
    Pill,
    MockScreen,
    MockInbox,
    FinalCTA,
    FAQ,
    SectionHeader,
    StatsRow,
    PageShell,
  };
})();
