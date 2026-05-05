(() => {
  (function() {
    const { useState, useEffect } = React;
    const ROUTES = [
      { path: "/", title: "Home", component: "HomePage" },
      { path: "/ai-agent", title: "AI Agent", component: "AiAgentPage" },
      { path: "/ai-agent/slack", title: "AI Agent \xB7 Slack", component: "AiAgentSlackPage" },
      { path: "/copilot", title: "Copilot", component: "CopilotPage" },
      { path: "/agent-customer", title: "Customer Agent", component: "AgentCustomerPage" },
      { path: "/agent-trust", title: "AI trust", component: "AgentTrustPage" },
      { path: "/how-agent-works", title: "How agents work", component: "HowAgentWorksPage" },
      { path: "/inbox", title: "Inbox", component: "InboxPage" },
      { path: "/omnichannel", title: "Omnichannel", component: "OmnichannelPage" },
      { path: "/how-it-works", title: "How Clain works", component: "HowItWorksPage" },
      { path: "/tickets", title: "Tickets", component: "TicketsPage" },
      { path: "/reporting", title: "Reporting", component: "ReportingPage" },
      { path: "/startups", title: "Startups", component: "StartupsPage" },
      { path: "/knowledge", title: "Knowledge", component: "KnowledgePage" },
      { path: "/pricing", title: "Pricing", component: "PricingPage" },
      { path: "/technology", title: "Technology", component: "TechnologyPage" },
      { path: "/signin", title: "Log in", component: "SigninPage" },
      { path: "/signup", title: "Start free trial", component: "SignupPage" },
      { path: "/reset-password", title: "Reset password", component: "ResetPasswordPage" },
      { path: "/demo", title: "Talk to sales", component: "DemoPage" },
      { path: "/upgrade", title: "Plans", component: "PaywallPage" }
    ];
    function navigate(path) {
      if (window.location.pathname === path) return;
      window.history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
    function useSpaLinks() {
      useEffect(() => {
        function onClick(e) {
          const a = e.target.closest && e.target.closest("a[data-spa]");
          if (!a) return;
          const href = a.getAttribute("href");
          if (!href || href.startsWith("http") || href.startsWith("mailto:")) return;
          e.preventDefault();
          navigate(href);
        }
        document.addEventListener("click", onClick);
        return () => document.removeEventListener("click", onClick);
      }, []);
    }
    function Logo() {
      return /* @__PURE__ */ React.createElement("a", { "data-spa": true, href: "/", className: "nav-logo" }, /* @__PURE__ */ React.createElement("span", { className: "nav-logo-dot" }), "Clain");
    }
    const BUILT_PAGES = /* @__PURE__ */ new Set([
      "/",
      "/inbox",
      "/omnichannel",
      "/how-it-works",
      "/ai-agent",
      "/ai-agent/slack",
      "/tickets",
      "/reporting",
      "/startups",
      "/knowledge",
      "/pricing",
      "/copilot",
      "/agent-customer",
      "/agent-trust",
      "/how-agent-works",
      "/technology"
    ]);
    function ifBuilt(slug, fallback = null) {
      return BUILT_PAGES.has(slug) ? slug : fallback;
    }
    const PRODUCT_MENU_ALL = {
      about: [
        { slug: "/how-it-works", icon: "\u25E7", name: "How Clain works", desc: "Built around an autonomous AI agent" },
        { slug: "/ai-agent", icon: "\u2726", name: "Clain AI Agent", desc: "Resolves tickets end-to-end" },
        { slug: "/omnichannel", icon: "\u25A5", name: "Omnichannel inbox", desc: "Email, chat, voice and social" },
        { slug: "/technology", icon: "\u25C7", name: "Plugs into your stack", desc: "30+ native integrations" }
      ],
      featured: [
        { slug: "/inbox", name: "Inbox" },
        { slug: "/tickets", name: "Tickets" },
        { slug: "/knowledge", name: "Knowledge Hub" },
        { slug: "/reporting", name: "Reporting" },
        { slug: "/copilot", name: "Copilot" },
        { slug: "/pricing", name: "Pricing" },
        { slug: "/ai-agent/slack", name: "AI Agent for Slack" },
        { slug: "/startups", name: "Startups" },
        { slug: "/agent-trust", name: "Trust & safety" },
        { slug: "/agent-customer", name: "Customer Agent" }
      ]
    };
    const RESOURCES_MENU_ALL = [
      { slug: "#help", name: "Help center", desc: "Docs and how-tos" },
      { slug: "#academy", name: "Clain Academy", desc: "Hands-on courses" },
      { slug: "#blog", name: "Blog", desc: "Product news and posts" },
      { slug: "#community", name: "Community", desc: "Forum and feedback" },
      { slug: "#api", name: "API reference", desc: "Integrate Clain anywhere" },
      { slug: "#changelog", name: "Changelog", desc: "Latest releases" }
    ];
    const RESOURCES_MENU = RESOURCES_MENU_ALL;
    const CLAIN_AI_MENU_ALL = {
      agents: [
        { slug: "/ai-agent", icon: "\u2726", name: "AI Agent", desc: "Customer-facing autonomous agent" },
        { slug: "/copilot", icon: "\u25D0", name: "Copilot", desc: "AI assistant for human agents" },
        { slug: "/agent-customer", icon: "\u25C9", name: "Customer Agent", desc: "Resolves complex queries end-to-end" }
      ],
      learn: [
        { slug: "/how-agent-works", name: "How agents work" },
        { slug: "/agent-trust", name: "Trust & safety" },
        { slug: "/technology", name: "Technology" },
        { slug: "/ai-agent/slack", name: "AI Agent for Slack" }
      ]
    };
    const PRODUCT_MENU = {
      about: PRODUCT_MENU_ALL.about.filter((i) => BUILT_PAGES.has(i.slug)),
      featured: PRODUCT_MENU_ALL.featured.filter((i) => BUILT_PAGES.has(i.slug))
    };
    const CLAIN_AI_MENU = {
      agents: CLAIN_AI_MENU_ALL.agents.filter((i) => BUILT_PAGES.has(i.slug)),
      learn: CLAIN_AI_MENU_ALL.learn.filter((i) => BUILT_PAGES.has(i.slug))
    };
    function NavDropdownProduct({ open }) {
      if (!open) return null;
      return /* @__PURE__ */ React.createElement("div", { className: "nav-dd" }, /* @__PURE__ */ React.createElement("div", { className: "nav-dd-grid" }, /* @__PURE__ */ React.createElement("div", { className: "nav-dd-col" }, /* @__PURE__ */ React.createElement("div", { className: "nav-dd-eyebrow" }, "About Clain"), /* @__PURE__ */ React.createElement("ul", { className: "nav-dd-list nav-dd-list-icons" }, PRODUCT_MENU.about.map((item) => /* @__PURE__ */ React.createElement("li", { key: item.slug }, /* @__PURE__ */ React.createElement("a", { "data-spa": true, href: item.slug, className: "nav-dd-item-icon" }, /* @__PURE__ */ React.createElement("span", { className: "nav-dd-icon" }, item.icon), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("strong", null, item.name), /* @__PURE__ */ React.createElement("em", null, item.desc))))))), /* @__PURE__ */ React.createElement("div", { className: "nav-dd-col" }, /* @__PURE__ */ React.createElement("div", { className: "nav-dd-eyebrow" }, "Featured capabilities"), /* @__PURE__ */ React.createElement("ul", { className: "nav-dd-list" }, PRODUCT_MENU.featured.map((item) => /* @__PURE__ */ React.createElement("li", { key: item.slug }, /* @__PURE__ */ React.createElement("a", { "data-spa": true, href: item.slug, className: "nav-dd-item" }, item.name)))))));
    }
    function NavDropdownResources({ open }) {
      if (!open) return null;
      return /* @__PURE__ */ React.createElement("div", { className: "nav-dd" }, /* @__PURE__ */ React.createElement("div", { className: "nav-dd-grid nav-dd-grid-1" }, /* @__PURE__ */ React.createElement("div", { className: "nav-dd-col" }, /* @__PURE__ */ React.createElement("div", { className: "nav-dd-eyebrow" }, "Resources"), /* @__PURE__ */ React.createElement("ul", { className: "nav-dd-list nav-dd-list-icons" }, RESOURCES_MENU.map((item) => /* @__PURE__ */ React.createElement("li", { key: item.slug }, /* @__PURE__ */ React.createElement("a", { href: item.slug, className: "nav-dd-item-icon" }, /* @__PURE__ */ React.createElement("span", { className: "nav-dd-icon" }, "\u25C7"), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("strong", null, item.name), /* @__PURE__ */ React.createElement("em", null, item.desc)))))))));
    }
    function Nav({ variant = "light" }) {
      const [scrolled, setScrolled] = useState(false);
      const [openMenu, setOpenMenu] = useState(null);
      useEffect(() => {
        function onScroll() {
          setScrolled(window.scrollY > 8);
        }
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
      }, []);
      useEffect(() => {
        function onClickOutside(e) {
          if (!e.target.closest(".nav-shell")) setOpenMenu(null);
        }
        function onEsc(e) {
          if (e.key === "Escape") setOpenMenu(null);
        }
        document.addEventListener("mousedown", onClickOutside);
        document.addEventListener("keydown", onEsc);
        return () => {
          document.removeEventListener("mousedown", onClickOutside);
          document.removeEventListener("keydown", onEsc);
        };
      }, []);
      const isDark = variant === "dark";
      const toggle = (name) => setOpenMenu(openMenu === name ? null : name);
      return /* @__PURE__ */ React.createElement("header", { className: `nav-shell${scrolled ? " is-scrolled" : ""}${isDark ? " dark" : ""}${openMenu ? " has-open-menu" : ""}` }, /* @__PURE__ */ React.createElement("div", { className: "nav-inner", style: { display: "flex", alignItems: "center", gap: 32 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 32, flex: "0 0 auto" } }, /* @__PURE__ */ React.createElement(Logo, null), /* @__PURE__ */ React.createElement("ul", { className: "nav-links hide-mobile", style: { display: "flex", alignItems: "center", gap: 28, listStyle: "none", margin: 0, padding: 0 } }, /* @__PURE__ */ React.createElement("li", { className: `nav-link-wrap${openMenu === "product" ? " is-open" : ""}`, style: { position: "relative" } }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "nav-link nav-link-trigger", onClick: () => toggle("product") }, "Product ", /* @__PURE__ */ React.createElement("span", { className: "nav-caret" }, "\u25BE")), /* @__PURE__ */ React.createElement(NavDropdownProduct, { open: openMenu === "product" })), /* @__PURE__ */ React.createElement("li", { style: { position: "relative" } }, /* @__PURE__ */ React.createElement("a", { "data-spa": true, href: "/pricing", className: "nav-link" }, "Pricing")))), /* @__PURE__ */ React.createElement("div", { className: "nav-actions", style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 } }, /* @__PURE__ */ React.createElement("a", { href: "/signin", className: "btn btn-secondary hide-mobile" }, "Log in"), /* @__PURE__ */ React.createElement("a", { href: "/signup", className: "btn btn-primary" }, "Start free trial"), /* @__PURE__ */ React.createElement("a", { "data-spa": true, href: "/how-agent-works", className: "btn btn-secondary hide-mobile nav-cta-arrow" }, "Clain AI ", /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true" }, "\u2192")))));
    }
    function Footer() {
      const cols = [
        {
          title: "Product",
          links: ["AI Agent", "Inbox", "Tickets", "Omnichannel", "Reporting", "How it works"]
        },
        {
          title: "Plans",
          links: ["Pricing", "Startups program", "Enterprise", "For agencies"]
        },
        {
          title: "Resources",
          links: ["Help center", "Academy", "Blog", "Community", "API reference"]
        },
        {
          title: "Company",
          links: ["About", "Careers", "Customers", "Contact", "Trust & security"]
        }
      ];
      return /* @__PURE__ */ React.createElement("footer", { className: "footer" }, /* @__PURE__ */ React.createElement("div", { className: "container" }, /* @__PURE__ */ React.createElement("div", { className: "footer-grid" }, /* @__PURE__ */ React.createElement("div", { className: "footer-col" }, /* @__PURE__ */ React.createElement(Logo, null), /* @__PURE__ */ React.createElement("p", { className: "text-secondary mt-2", style: { fontSize: 14, lineHeight: 1.55, maxWidth: 280 } }, "The only helpdesk designed for the AI Agent era. Build customer experiences that actually scale.")), cols.map((c) => /* @__PURE__ */ React.createElement("div", { className: "footer-col", key: c.title }, /* @__PURE__ */ React.createElement("h5", null, c.title), /* @__PURE__ */ React.createElement("ul", null, c.links.map((l) => /* @__PURE__ */ React.createElement("li", { key: l }, /* @__PURE__ */ React.createElement("a", { href: "#" }, l))))))), /* @__PURE__ */ React.createElement("div", { className: "footer-bottom" }, /* @__PURE__ */ React.createElement("span", null, "\xA9 ", (/* @__PURE__ */ new Date()).getFullYear(), " Clain. All rights reserved."), /* @__PURE__ */ React.createElement("span", null, "Made for the AI agent era"))));
    }
    function LogoStrip({ label = "Used by ambitious teams shipping faster customer service" }) {
      const logos = ["Lovable", "Synthesia", "ChatPRD", "Gamma", "Polymarket", "Chess.com"];
      return /* @__PURE__ */ React.createElement("section", { className: "logo-strip" }, /* @__PURE__ */ React.createElement("div", { className: "container" }, /* @__PURE__ */ React.createElement("div", { className: "logo-strip-label" }, label), /* @__PURE__ */ React.createElement("div", { className: "logo-strip-row" }, logos.map((l) => /* @__PURE__ */ React.createElement("span", { key: l }, l)))));
    }
    function Pill({ children, dot = true }) {
      return /* @__PURE__ */ React.createElement("span", { className: "pill" }, dot && /* @__PURE__ */ React.createElement("span", { className: "pill-dot" }), children);
    }
    function MockScreen({ children, label = "Product UI", tall = false, square = false, wide = false, style }) {
      const cls = ["mock"];
      if (tall) cls.push("mock-tall");
      if (square) cls.push("mock-square");
      if (wide) cls.push("mock-wide");
      return /* @__PURE__ */ React.createElement("div", { className: cls.join(" "), style }, /* @__PURE__ */ React.createElement("div", { className: "mock-bar", style: { position: "absolute", top: 0, left: 0, right: 0 } }, /* @__PURE__ */ React.createElement("span", { className: "mock-dot" }), /* @__PURE__ */ React.createElement("span", { className: "mock-dot" }), /* @__PURE__ */ React.createElement("span", { className: "mock-dot" })), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 32, padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 } }, children || label));
    }
    function MockInbox() {
      return /* @__PURE__ */ React.createElement("div", { className: "mock", style: { aspectRatio: "16 / 9", padding: 0 } }, /* @__PURE__ */ React.createElement("div", { className: "mock-bar" }, /* @__PURE__ */ React.createElement("span", { className: "mock-dot" }), /* @__PURE__ */ React.createElement("span", { className: "mock-dot" }), /* @__PURE__ */ React.createElement("span", { className: "mock-dot" })), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "180px 1fr 280px", height: "calc(100% - 32px)", textAlign: "left" } }, /* @__PURE__ */ React.createElement("div", { style: { borderRight: "1px solid var(--border-subtle)", padding: 12, fontSize: 12, color: "var(--text-secondary)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 } }, "Inbox"), ["All open \xB7 124", "Mentions", "Assigned to me", "Unassigned", "Snoozed", "Closed"].map((x) => /* @__PURE__ */ React.createElement("div", { key: x, style: { padding: "6px 8px", borderRadius: 6, marginBottom: 2 } }, x))), /* @__PURE__ */ React.createElement("div", { style: { borderRight: "1px solid var(--border-subtle)", padding: 0 } }, [
        { name: "Alex Reeves", msg: "Where's my refund for order #41204?", time: "2m" },
        { name: "Maria Chen", msg: "Subscription renewal failed \u2014 card declined", time: "14m" },
        { name: "James Patel", msg: "Can I switch plan mid-billing cycle?", time: "1h" },
        { name: "Sofia Romero", msg: "Order arrived damaged \u2014 see photos attached", time: "3h" }
      ].map((c, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { padding: 12, borderBottom: "1px solid var(--border-subtle)", fontSize: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 4 } }, /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--text-primary)" } }, c.name), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-muted)" } }, c.time)), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-secondary)" } }, c.msg)))), /* @__PURE__ */ React.createElement("div", { style: { padding: 16, fontSize: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 } }, "Customer context"), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-secondary)", lineHeight: 1.6 } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("strong", null, "Alex Reeves")), /* @__PURE__ */ React.createElement("div", null, "alex@example.com"), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 8 } }, "3 open \xB7 12 closed"), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 12, padding: 8, background: "var(--bg-cream-soft)", borderRadius: 6 } }, /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--text-primary)" } }, "AI suggestion"), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 4 } }, "Refund eligible per policy. Suggest issuing $42.10 to original card."))))));
    }
    function FinalCTA({
      title = "Get started with Clain today",
      subtitle = "Join thousands of teams already delivering AI-powered customer service.",
      primary = "Try for free",
      secondary = "Talk to sales",
      variant = "dark"
      // dark | cream
    }) {
      return /* @__PURE__ */ React.createElement("section", { style: { background: "var(--bg-cream-warm)" } }, /* @__PURE__ */ React.createElement("div", { className: `final-cta ${variant === "cream" ? "final-cta-cream" : ""}` }, /* @__PURE__ */ React.createElement("h2", null, title), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 17, opacity: 0.85, maxWidth: 600, margin: "0 auto", lineHeight: 1.5 } }, subtitle), /* @__PURE__ */ React.createElement("div", { className: "final-cta-actions" }, /* @__PURE__ */ React.createElement("a", { href: "/signup", className: "btn btn-primary" }, primary), /* @__PURE__ */ React.createElement("a", { href: "/demo", className: "btn btn-secondary", style: { borderColor: variant === "cream" ? "rgba(2,9,23,0.15)" : "rgba(255,255,255,0.25)", background: "transparent", color: variant === "cream" ? "var(--text-primary)" : "#fff" } }, secondary))));
    }
    function FAQ({ items = [] }) {
      const [open, setOpen] = useState(null);
      return /* @__PURE__ */ React.createElement("div", null, items.map((it, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: `faq-item${open === i ? " open" : ""}`, onClick: () => setOpen(open === i ? null : i) }, /* @__PURE__ */ React.createElement("div", { className: "faq-q" }, /* @__PURE__ */ React.createElement("span", null, it.q), /* @__PURE__ */ React.createElement("span", { className: "faq-toggle" }, "+")), /* @__PURE__ */ React.createElement("div", { className: "faq-a" }, it.a))));
    }
    function SectionHeader({ eyebrow, title, lede, center = false, dark = false, maxWidth = 720 }) {
      return /* @__PURE__ */ React.createElement("div", { style: { textAlign: center ? "center" : "left", marginBottom: 48, maxWidth: center ? maxWidth : "100%", marginLeft: center ? "auto" : 0, marginRight: center ? "auto" : 0 } }, eyebrow && /* @__PURE__ */ React.createElement("div", { className: "h-eyebrow", style: { marginBottom: 16 } }, eyebrow), title && /* @__PURE__ */ React.createElement("h2", { className: "h-section" }, title), lede && /* @__PURE__ */ React.createElement("p", { className: "lede mt-2", style: { marginLeft: center ? "auto" : 0, marginRight: center ? "auto" : 0 } }, lede));
    }
    function StatsRow({ items }) {
      return /* @__PURE__ */ React.createElement("div", { className: "stats-row" }, items.map((s, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "stat" }, /* @__PURE__ */ React.createElement("div", { className: "num" }, s.num), /* @__PURE__ */ React.createElement("div", { className: "label" }, s.label))));
    }
    function setupTabsCarousels(root, cycleMs = 8e3) {
      const groups = [];
      const seen = /* @__PURE__ */ new WeakSet();
      function pushGroup(cells, sortByLeft) {
        if (cells.some((c) => seen.has(c))) return;
        cells.forEach((c) => seen.add(c));
        const ordered = sortByLeft ? cells.slice().sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left) : cells.slice().sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
        groups.push(ordered);
      }
      root.querySelectorAll('[data-name="div.flex"]').forEach((parent) => {
        let cells = Array.from(parent.querySelectorAll(':scope > [data-name="div.flex-1"]'));
        if (cells.length >= 2 && cells.length <= 4 && cells.every((c) => c.querySelector('[data-name="button.relative"]'))) {
          pushGroup(cells, true);
          return;
        }
        cells = Array.from(parent.children).filter(
          (c) => c.matches('[data-name^="button.relative"]') || c.querySelector('[data-name="button.relative"]')
        );
        if (cells.length === 2 && cells.length === parent.children.length) {
          pushGroup(cells, true);
        }
      });
      const allParents = root.querySelectorAll("div");
      allParents.forEach((parent) => {
        const children = Array.from(parent.children).filter((el) => el.tagName === "DIV");
        if (children.length < 2 || children.length > 6) return;
        const allCards = children.every(
          (c) => c.querySelector('[data-name^="h4.text-heading"]') && c.querySelector('[data-name="p"], [data-name^="p."]')
        );
        if (!allCards) return;
        if (children.some((c) => seen.has(c))) return;
        const rects = children.map((c) => c.getBoundingClientRect());
        const horizontalSpread = Math.max(...rects.map((r) => r.left)) - Math.min(...rects.map((r) => r.left));
        const verticalSpread = Math.max(...rects.map((r) => r.top)) - Math.min(...rects.map((r) => r.top));
        pushGroup(children, horizontalSpread > verticalSpread);
      });
      groups.forEach((cells) => {
        cells.forEach((cell, i) => {
          cell.setAttribute("data-clain-tab", String(i));
          const host = cell.querySelector('[data-name="button.relative"]') || cell;
          host.style.position = host.style.position || "relative";
          if (!host.querySelector(":scope > .clain-tab-progress")) {
            const bar = document.createElement("div");
            bar.className = "clain-tab-progress";
            host.appendChild(bar);
          }
        });
        let active = 0;
        let intervalId = null;
        let started = false;
        const activate = (idx) => {
          cells.forEach((cell, i) => {
            cell.classList.toggle("clain-tab-active", i === idx);
            cell.classList.toggle("clain-tab-inactive", i !== idx);
          });
          const bar = cells[idx].querySelector(".clain-tab-progress");
          if (bar) {
            bar.style.animation = "none";
            void bar.offsetWidth;
            bar.style.animation = "";
          }
        };
        const tick = () => {
          activate(active);
          active = (active + 1) % cells.length;
        };
        cells.forEach((cell, i) => {
          cell.style.cursor = "pointer";
          cell.addEventListener("click", () => {
            if (intervalId) {
              clearInterval(intervalId);
              intervalId = null;
            }
            active = i;
            activate(active);
            active = (i + 1) % cells.length;
            intervalId = setInterval(tick, cycleMs);
          });
        });
        const start = () => {
          if (started) return;
          started = true;
          tick();
          intervalId = setInterval(tick, cycleMs);
        };
        const sentinel = cells[0].parentElement || cells[0];
        if ("IntersectionObserver" in window) {
          const obs = new IntersectionObserver((entries) => {
            entries.forEach((e) => {
              if (e.isIntersecting) {
                start();
                obs.disconnect();
              }
            });
          }, { threshold: 0.25 });
          obs.observe(sentinel);
        } else {
          start();
        }
      });
    }
    function GravityGrid() {
      const canvasRef = React.useRef(null);
      useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        let w = 0, h = 0, dots = [];
        const SPACING = 28, RADIUS = 220, DPR = Math.min(window.devicePixelRatio || 1, 2);
        const resize = () => {
          w = window.innerWidth;
          h = window.innerHeight;
          canvas.width = w * DPR;
          canvas.height = h * DPR;
          canvas.style.width = w + "px";
          canvas.style.height = h + "px";
          ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
          dots = [];
          const cols = Math.ceil(w / SPACING) + 2, rows = Math.ceil(h / SPACING) + 2;
          for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
              const ox = (i - 1) * SPACING + j % 2 * (SPACING / 2);
              const oy = (j - 1) * SPACING;
              dots.push({ ox, oy, x: ox, y: oy, vx: 0, vy: 0 });
            }
          }
        };
        const mouse = { x: -9999, y: -9999, active: false };
        const onMove = (e) => {
          mouse.x = e.clientX;
          mouse.y = e.clientY;
          mouse.active = true;
        };
        const onLeave = () => {
          mouse.x = -9999;
          mouse.y = -9999;
          mouse.active = false;
        };
        let raf;
        const loop = () => {
          ctx.clearRect(0, 0, w, h);
          for (let k = 0; k < dots.length; k++) {
            const d = dots[k];
            const dx = mouse.x - d.x, dy = mouse.y - d.y;
            const dist2 = dx * dx + dy * dy;
            if (mouse.active && dist2 < RADIUS * RADIUS) {
              const dist = Math.sqrt(dist2) || 1;
              const force = 1 - dist / RADIUS;
              d.vx += dx / dist * force * 0.22 * 6;
              d.vy += dy / dist * force * 0.22 * 6;
            }
            d.vx += (d.ox - d.x) * 0.06;
            d.vy += (d.oy - d.y) * 0.06;
            d.vx *= 0.78;
            d.vy *= 0.78;
            d.x += d.vx;
            d.y += d.vy;
            const disp = Math.sqrt((d.x - d.ox) ** 2 + (d.y - d.oy) ** 2);
            const t = Math.min(disp / 30, 1);
            const a = 0.08 + t * 0.35, r = 0.9 + t * 1.6;
            ctx.fillStyle = `rgba(10,10,10,${a.toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
            ctx.fill();
          }
          raf = requestAnimationFrame(loop);
        };
        resize();
        window.addEventListener("resize", resize);
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseleave", onLeave);
        raf = requestAnimationFrame(loop);
        return () => {
          cancelAnimationFrame(raf);
          window.removeEventListener("resize", resize);
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseleave", onLeave);
        };
      }, []);
      return /* @__PURE__ */ React.createElement("canvas", { ref: canvasRef, className: "gravity-grid" });
    }
    function Cursor() {
      const dotRef = React.useRef(null);
      const ringRef = React.useRef(null);
      const target = React.useRef({ x: -100, y: -100 });
      const ring = React.useRef({ x: -100, y: -100 });
      useEffect(() => {
        document.body.classList.add("has-custom-cursor");
        const onMove = (e) => {
          target.current.x = e.clientX;
          target.current.y = e.clientY;
          if (dotRef.current) dotRef.current.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`;
        };
        const onOver = (e) => {
          if (!ringRef.current) return;
          const interactive = e.target.closest('a, button, [data-cursor="hover"]');
          const text = e.target.closest("input, textarea, [contenteditable]");
          ringRef.current.classList.toggle("is-hover", !!interactive);
          ringRef.current.classList.toggle("is-text", !!text);
        };
        let raf;
        const tick = () => {
          ring.current.x += (target.current.x - ring.current.x) * 0.18;
          ring.current.y += (target.current.y - ring.current.y) * 0.18;
          if (ringRef.current) ringRef.current.style.transform = `translate3d(${ring.current.x}px,${ring.current.y}px,0)`;
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseover", onOver);
        return () => {
          document.body.classList.remove("has-custom-cursor");
          cancelAnimationFrame(raf);
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseover", onOver);
        };
      }, []);
      return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { ref: ringRef, className: "cursor-ring" }), /* @__PURE__ */ React.createElement("div", { ref: dotRef, className: "cursor-dot" }));
    }
    function PageShell({ children }) {
      useSpaLinks();
      useEffect(() => {
        window.scrollTo(0, 0);
      }, []);
      useEffect(() => {
        const t = setTimeout(() => {
          const root = document.querySelector(".figma-page");
          if (root) setupTabsCarousels(root);
        }, 60);
        return () => clearTimeout(t);
      }, []);
      return /* @__PURE__ */ React.createElement(React.Fragment, null, children);
    }
    function AppShell({ children }) {
      return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(GravityGrid, null), /* @__PURE__ */ React.createElement(Cursor, null), /* @__PURE__ */ React.createElement(Nav, { variant: "light" }), children, /* @__PURE__ */ React.createElement(Footer, null));
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
      AppShell
    };
  })();
})();
