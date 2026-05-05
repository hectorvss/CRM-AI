(() => {
  (function() {
    const { useState, useEffect } = React;
    const PAGE_COMPONENTS = {
      HomePage: typeof HomePage !== "undefined" ? HomePage : null,
      AiAgentPage: typeof AiAgentPage !== "undefined" ? AiAgentPage : null,
      AiAgentSlackPage: typeof AiAgentSlackPage !== "undefined" ? AiAgentSlackPage : null,
      InboxPage: typeof InboxPage !== "undefined" ? InboxPage : null,
      OmnichannelPage: typeof OmnichannelPage !== "undefined" ? OmnichannelPage : null,
      HowItWorksPage: typeof HowItWorksPage !== "undefined" ? HowItWorksPage : null,
      TicketsPage: typeof TicketsPage !== "undefined" ? TicketsPage : null,
      ReportingPage: typeof ReportingPage !== "undefined" ? ReportingPage : null,
      StartupsPage: typeof StartupsPage !== "undefined" ? StartupsPage : null,
      KnowledgePage: typeof KnowledgePage !== "undefined" ? KnowledgePage : null,
      PricingPage: typeof PricingPage !== "undefined" ? PricingPage : null,
      CopilotPage: typeof CopilotPage !== "undefined" ? CopilotPage : null,
      AgentCustomerPage: typeof AgentCustomerPage !== "undefined" ? AgentCustomerPage : null,
      AgentTrustPage: typeof AgentTrustPage !== "undefined" ? AgentTrustPage : null,
      HowAgentWorksPage: typeof HowAgentWorksPage !== "undefined" ? HowAgentWorksPage : null,
      TechnologyPage: typeof TechnologyPage !== "undefined" ? TechnologyPage : null,
      SigninPage: typeof SigninPage !== "undefined" ? SigninPage : null,
      SignupPage: typeof SignupPage !== "undefined" ? SignupPage : null,
      ResetPasswordPage: typeof ResetPasswordPage !== "undefined" ? ResetPasswordPage : null,
      DemoPage: typeof DemoPage !== "undefined" ? DemoPage : null,
      PaywallPage: typeof PaywallPage !== "undefined" ? PaywallPage : null
    };
    function findRoute(path) {
      let p = path.replace(/^\/v2(\/|$)/, "/") || "/";
      if (p !== "/") p = p.replace(/\/+$/, "");
      return ClainV2.ROUTES.find((r) => r.path === p) || null;
    }
    function NotFound() {
      return /* @__PURE__ */ React.createElement("section", { className: "section" }, /* @__PURE__ */ React.createElement("div", { className: "container", style: { textAlign: "center", padding: "120px 20px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--font-display)", fontSize: 96, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1 } }, "404"), /* @__PURE__ */ React.createElement("h2", { className: "h-section mt-4" }, "This page doesn't exist"), /* @__PURE__ */ React.createElement("p", { className: "lede mt-2", style: { margin: "16px auto 32px" } }, "The page you're looking for might have moved or never existed in the first place."), /* @__PURE__ */ React.createElement("a", { "data-spa": true, href: "/", className: "btn btn-primary" }, "Back to home")));
    }
    function App() {
      const [path, setPath] = useState(window.location.pathname || "/");
      useEffect(() => {
        function onPop() {
          setPath(window.location.pathname || "/");
        }
        window.addEventListener("popstate", onPop);
        return () => window.removeEventListener("popstate", onPop);
      }, []);
      useEffect(() => {
        const route2 = findRoute(path);
        document.title = route2 ? `Clain \u2014 ${route2.title}` : "Clain \u2014 Page not found";
      }, [path]);
      const route = findRoute(path);
      let Page;
      if (!route) {
        Page = NotFound;
      } else {
        Page = PAGE_COMPONENTS[route.component] || NotFound;
      }
      return /* @__PURE__ */ React.createElement(ClainV2.AppShell, null, /* @__PURE__ */ React.createElement(Page, { key: path }));
    }
    const root = ReactDOM.createRoot(document.getElementById("root"));
    root.render(/* @__PURE__ */ React.createElement(App, null));
  })();
})();
